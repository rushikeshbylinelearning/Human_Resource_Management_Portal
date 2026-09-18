// backend/routes/auth.js
/**
 * ATTENDANCE PORTAL AUTHENTICATION ROUTES
 * 
 * This file contains TWO independent login routes:
 * 
 * 1. STANDALONE LOGIN ROUTE: POST /api/auth/login
 *    - Handles direct email/password authentication
 *    - Completely independent of SSO
 *    - Used when users log in directly to the attendance portal
 *    - Protected by geofencing middleware
 *    - Returns JWT token and user data
 * 
 * 2. SSO LOGIN ROUTE: POST /api/auth/sso-consume
 *    - Handles SSO token authentication from SSO portal
 *    - Completely independent of standalone login
 *    - Used when users are redirected from SSO portal with sso_token
 *    - Validates SSO token via JWKS/RS256
 *    - Returns AMS JWT token and user data
 * 
 * Both routes are protected and work independently.
 * The SSO middleware (ssoTokenAuth) is configured to NOT interfere with:
 * - POST requests (all API routes)
 * - /login page route (frontend handles SSO tokens)
 * - /api/* routes (all API endpoints)
 */
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticateToken');
const { loginGeofencingMiddleware } = require('../middleware/geofencingMiddleware');
const { validateLogin } = require('../middleware/validation');
const { checkGeofence } = require('../services/geofencingService');
const ssoService = require('../services/ssoService');
const SSOVerification = require('../utils/ssoVerification');
const jwtUtils = require('../utils/jwtUtils');
const { syncOrgFields } = require('../utils/syncOrgFields');
const { attachLeavesSectionFlag } = require('../utils/leavesSectionSetting');
// isNightShiftEmployee was used for the old 7d/10h expiry split; no longer needed
// with the uniform 15-minute access token model. Import kept as a no-op comment
// until the module reference is confirmed safe to remove.
// const { isNightShiftEmployee } = require('../utils/istTime');
const rateLimit = require('express-rate-limit');
const {
    RefreshTokenReuseError,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    hashRefreshToken,
} = require('../utils/refreshTokenUtils');

// ─── Refresh-token rotation dedup cache ───────────────────────────────────────
// Keyed by the SHA-256 hash of the raw refresh token (never the raw value).
// If two requests arrive with the same token within REFRESH_DEDUP_TTL_MS
// (e.g. a network-level retry or a proactive-refresh timer racing a reactive
// 401 retry) the second call waits for the first call's in-flight Promise
// instead of creating a new DB race.  This is a defence-in-depth layer on top
// of the atomic findOneAndUpdate in rotateRefreshToken().
//
// Map<tokenHash, { promise: Promise, settledAt: number|null }>
const refreshDedupCache = new Map();
const REFRESH_DEDUP_TTL_MS = 2000; // 2 seconds

function cleanRefreshDedupCache() {
    const now = Date.now();
    for (const [key, entry] of refreshDedupCache.entries()) {
        if (entry.settledAt !== null && now - entry.settledAt > REFRESH_DEDUP_TTL_MS) {
            refreshDedupCache.delete(key);
        }
    }
}

// ─── Dedicated rate limiter for POST /api/auth/refresh ────────────────────────
// Separate from the general 100/15 min limiter — tighter window to contain
// rotation storms from a misbehaving client without affecting other auth routes.
const refreshRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,   // 5 minutes
    max: 20,                    // 20 requests per window per IP
    standardHeaders: true,      // Return RateLimit-* headers
    legacyHeaders: false,
    // Key by IP + first 16 chars of cookie hash so each refresh-token identity
    // gets its own bucket, but we never log the raw token.
    keyGenerator: (req) => {
        const raw = req.cookies && req.cookies.refreshToken;
        const cookieKey = raw ? hashRefreshToken(raw).slice(0, 16) : 'no-cookie';
        const ip = req.ip || req.connection?.remoteAddress || 'unknown';
        return `${ip}:${cookieKey}`;
    },
    handler: (req, res) => {
        console.warn(
            `[Auth/Refresh] Rate limit exceeded | ip: ${req.ip} | ` +
            `ua: ${(req.headers['user-agent'] || '').slice(0, 80)}`
        );
        return res.status(429).json({
            error: 'Too many refresh attempts. Please try again later.',
            code: 'REFRESH_RATE_LIMITED',
        });
    },
});

// Helper to clear the refresh token cookie with the same attributes used to set it.
// clearCookie() must match the original path and domain or the browser ignores it.
function clearRefreshCookie(res) {
    const isProd = process.env.NODE_ENV === 'production';
    const opts = { path: '/api/auth' };
    if (isProd) opts.domain = '.bylinelms.com';
    res.clearCookie('refreshToken', opts);
}
// The refresh token is NEVER accessible to JavaScript — only sent by the
// browser automatically to /api/auth/refresh and /api/auth/logout.
//
// Dev note: In development the Vite proxy at :5173 forwards /api/* to
// the backend at :3011. The proxy is configured with cookieDomainRewrite
// so the browser receives the Set-Cookie as coming from localhost:5173.
// We intentionally omit the `domain` attribute in dev so the browser
// binds the cookie to the Vite dev-server origin, not the backend port.
//
// sameSite behaviour:
//   production  → 'strict'  (same-site HTTPS only)
//   development → 'lax'     (allows the Vite proxy cross-port forwarding)
function getRefreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const opts = {
        httpOnly: true,
        secure: isProd,                      // HTTPS only in prod
        sameSite: isProd ? 'strict' : 'lax', // lax in dev for Vite proxy compatibility
        maxAge: 7 * 24 * 60 * 60 * 1000,    // 7 days — matches RefreshToken MongoDB TTL
        path: '/api/auth',                   // Scope to auth endpoints only
    };
    // In production, pin to the shared subdomain so the cookie is sent
    // from both attendance.bylinelms.com and attendance-test.bylinelms.com.
    if (isProd) {
        opts.domain = '.bylinelms.com';
    }
    // No domain attribute in dev — let the browser bind it to localhost automatically.
    return opts;
}

const DEFAULT_SSO_ROLE = (() => {
    const allowed = ['Admin', 'HR', 'Employee', 'Intern'];
    const envRole = process.env.SSO_DEFAULT_ROLE;
    if (envRole && typeof envRole === 'string') {
        const normalized = envRole.trim();
        const match = allowed.find(role => role.toLowerCase() === normalized.toLowerCase());
        if (match) {
            return match;
        }
    }
    return 'Employee';
})();

const router = express.Router();

const normalizeEmail = (email) => {
    return email?.trim().toLowerCase() || '';
};

// =================================================================
// STANDALONE LOGIN ROUTE - POST /api/auth/login
// This route handles direct email/password authentication
// It is completely independent of SSO and should never be interfered with
// SSO authentication uses /api/auth/sso-consume instead
// =================================================================
router.post('/login', validateLogin, loginGeofencingMiddleware, async (req, res) => {
    // Validate required fields before any async work (production-safe)
    const email = req.body && typeof req.body.email === 'string' ? req.body.email.trim() : '';
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) {
        return res.status(400).json({ error: 'Email/Employee Code and password are required.' });
    }

    try {
        if (process.env.NODE_ENV !== 'production') console.log('[Standalone Login] Login attempt for:', email);
        
        // =================================================================
        // ### START OF FIX ###
        // Support both exact email match and normalized email match for login
        // This handles cases where admin saved email with dots/aliases but user types without
        const normalizedEmail = normalizeEmail(email);
        
        // Try to find user by exact email first, then by normalized email
        // This supports both admin-saved emails (exact) and SSO-created emails (normalized)
        let user = await User.findOne({
            $or: [
                { email: email }, // Exact match (for admin-created users)
                { email: normalizedEmail }, // Normalized match (for SSO-created users or Gmail variations)
                { employeeCode: email } // Employee code match
            ]
        }).populate('shiftGroup');

        // Check if user is active and has password
        if (!user || !user.isActive || !user.passwordHash) {
            console.warn(`Login attempt failed for: ${email}. User not found, inactive, or has no password.`);
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        // ### END OF FIX ###
        // =================================================================

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        // Check geofencing for non-admin users
        // NOTE: Geofencing is now OPTIONAL for login to allow remote access
        // Geofencing will still be enforced for attendance check-in/check-out
        if (user.role !== 'Admin' && user.role !== 'HR') {
            if (req.userLocation) {
                const geofenceResult = await checkGeofence(
                    req.userLocation.latitude,
                    req.userLocation.longitude,
                    user.role
                );

                if (!geofenceResult.isWithinGeofence) {
                    // Log the violation but don't block login
                    console.warn(`[Login] Geofence violation for ${user.email}: ${geofenceResult.distance}m from nearest office`);
                    // You can choose to block login by uncommenting the lines below:
                    /*
                    return res.status(403).json({
                        error: 'Access denied: You must be within office premises to log in',
                        code: 'GEOFENCE_VIOLATION',
                        details: {
                            distance: geofenceResult.distance,
                            nearestOffice: geofenceResult.officeLocation ? {
                                name: geofenceResult.officeLocation.name,
                                address: geofenceResult.officeLocation.address
                            } : null
                        }
                    });
                    */
                }
            } else {
                // No location provided - allow login but log the event
                console.warn(`[Login] No location data provided for ${user.email}`);
                // You can choose to block login by uncommenting the line below:
                // return res.status(400).json({ error: 'Location access is required for login. Please enable location permissions.', code: 'LOCATION_REQUIRED' });
            }
        }

        // Issue a short-lived access token (15 minutes).
        // Night-shift employees previously got 10h — that was only needed for the
        // old single-long-lived-token model. With proactive refresh the session
        // duration is now governed by the 7-day refresh token, not the access token.
        // The night-shift claim is preserved in the payload if needed downstream,
        // but the expiry is uniformly 15 minutes for all users.
        const payload = {
            userId: user._id,
            email: user.email,
            role: user.role,
            authMethod: 'local',
        };
        const accessToken = jwtUtils.sign(payload, { expiresIn: '15m' });

        // Issue a 7-day opaque refresh token and persist its hash to MongoDB.
        const userAgent = req.headers['user-agent'] || null;
        const rawRefreshToken = await issueRefreshToken(user._id, 'local', userAgent);

        if (process.env.NODE_ENV !== 'production') console.log('[Standalone Login] ✅ Login successful for:', user.email, 'via standalone route');

        // Refresh token goes into an httpOnly cookie — never readable by JS.
        // Access token is returned in the response body; AuthContext stores it
        // in memory only (no localStorage / sessionStorage write for access token).
        res.cookie('refreshToken', rawRefreshToken, getRefreshCookieOptions());

        const loginUser = await attachLeavesSectionFlag({
                id: user._id,
                name: user.fullName,
                fullName: user.fullName,
                employeeCode: user.employeeCode,
                email: user.email,
                role: user.role,
                employmentStatus: user.employmentStatus,
                domain: user.domain,
                designation: user.designation,
                department: user.department,
                alternateSaturdayPolicy: user.alternateSaturdayPolicy,
                profileImageUrl: user.profileImageUrl,
                featurePermissions: user.featurePermissions || {
                    leaves: true,
                    breaks: true,
                    extraFeatures: false,
                    maxBreaks: 999, // No restrictions
                    breakAfterHours: 0, // Can take break immediately
                    breakWindows: [], // No time restrictions by default
                    canCheckIn: true,
                    canCheckOut: true,
                    canTakeBreak: true,
                    canViewAnalytics: false,
                    canViewLiveAttendance: false,
                    canManageResourceRequests: false,
                    privilegeLevel: 'normal',
                    restrictedFeatures: {
                        canViewReports: false,
                        canViewOtherLogs: false,
                        canEditProfile: true,
                        canRequestExtraBreak: true
                    },
                    advancedFeatures: {
                        canBulkActions: false,
                        canExportData: false
                    }
                },
                shift: user.shiftGroup ? {
                    id: user.shiftGroup._id,
                    name: user.shiftGroup.shiftName,
                    startTime: user.shiftGroup.startTime,
                    endTime: user.shiftGroup.endTime,
                    duration: user.shiftGroup.durationHours,
                    paidBreak: user.shiftGroup.paidBreakMinutes,
                } : null,
                // Include onboarding status so the frontend can decide the flow
                // without an extra API call on first login.
                onboarding: user.onboarding || {}
            });

        res.status(200).json({
            message: 'Login successful!',
            accessToken,
            // 'token' alias kept for backward-compatibility during rollout.
            // Remove once frontend is fully migrated to 'accessToken'.
            token: accessToken,
            user: loginUser
        });

    } catch (error) {
        // Safe logging: no stack trace or sensitive data; safe for production
        console.error('[Standalone Login] Error:', error.name || 'Error', error.message || String(error));
        if (error.code) console.error('[Standalone Login] Code:', error.code);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.get('/me', async (req, res) => {
    try {
        let userId;
        let authMethod = 'local';

        // Check for SSO session first (defensive: session store may fail when hosted)
        try {
            if (req.session && req.session.user) {
                userId = req.session.user.id;
                authMethod = 'SSO';
                if (process.env.NODE_ENV !== 'production') console.log('[/me] SSO session found for user:', userId);
            }
        } catch (sessionErr) {
            console.warn('[/me] Session access failed, falling back to JWT:', sessionErr?.message || sessionErr);
        }

        if (!userId) {
            // Check for JWT token in Authorization header
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

            if (token == null || (typeof token !== 'string')) {
                if (process.env.NODE_ENV !== 'production') console.log('[/me] No authorization header or token found');
                return res.status(401).json({ error: 'Authentication required' });
            }

            if (process.env.NODE_ENV !== 'production') console.log('[/me] Attempting to verify JWT token...');
            if (typeof token === 'string') {
                if (process.env.NODE_ENV !== 'production') console.log('[/me] Token preview:', token.slice(0, 50) + (token.length > 50 ? '...' : ''));
            }
            
            // Try to determine token type by decoding header
            let decoded;
            let tokenType = 'unknown';
            
            try {
                const decodedHeader = jwt.decode(token, { complete: true });
                if (decodedHeader && decodedHeader.header) {
                    const kid = decodedHeader.header.kid;
                    const alg = decodedHeader.header.alg;
                    
                    // SSO tokens have kid like 'sso-key-*', AMS tokens have 'ams-key'
                    if (kid && kid.startsWith('sso-key-')) {
                        tokenType = 'SSO';
                        if (process.env.NODE_ENV !== 'production') console.log('[/me] ⚠️ Detected SSO token (kid: ' + kid + ') - should have been converted to AMS token');
                        if (process.env.NODE_ENV !== 'production') console.log('[/me] Converting SSO token to AMS user lookup...');
                        
                        // Verify SSO token using JWKS
                        try {
                            decoded = await jwtUtils.verifySSOTokenWithJWKS(token);
                            const ssoUserId = decoded.userId || decoded.sub;
                            const ssoEmail = decoded.email;
                            
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] SSO token verified for email:', ssoEmail);
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] SSO user ID (from SSO DB):', ssoUserId);
                            
                            if (!ssoEmail) {
                                throw new Error('SSO token missing email claim - cannot map to AMS user');
                            }
                            
                            // Normalize email, but also try raw lowercase for admin-created emails
                            const normalizedSsoEmail = normalizeEmail(ssoEmail);
                            const rawLowerEmail = String(ssoEmail).toLowerCase();
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] SSO email from token:', ssoEmail);
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] Normalized email for lookup:', normalizedSsoEmail);
                            
                            // Find AMS user by normalized OR exact raw lowercase email
                            console.log('[/me] Looking up AMS user by normalized or raw email:', normalizedSsoEmail, rawLowerEmail);
                            const amsUser = await User.findOne({ 
                                isActive: true,
                                $or: [
                                    { email: normalizedSsoEmail },
                                    { email: rawLowerEmail }
                                ]
                            }).lean();
                            
                            if (!amsUser) {
                                if (process.env.NODE_ENV !== 'production') console.log('[/me] ❌ AMS user not found for normalized email:', normalizedSsoEmail);
                                if (process.env.NODE_ENV !== 'production') console.log('[/me] SSO user must authenticate via /api/auth/sso-consume first to create AMS user');
                                return res.status(401).json({ 
                                    error: 'User not found in AMS database',
                                    message: `No AMS user found for email: ${normalizedSsoEmail}. Please authenticate via SSO login endpoint first.`,
                                    code: 'AMS_USER_NOT_FOUND',
                                    requiresSsoLogin: true
                                });
                            }
                            
                            userId = amsUser._id.toString();
                            authMethod = 'SSO';
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] ✅ SSO token mapped to AMS user:', userId);
                            if (ssoEmail !== normalizedSsoEmail) {
                                if (process.env.NODE_ENV !== 'production') console.log('[SSO → AMS Sync] Email normalization matched:', ssoEmail, '->', normalizedSsoEmail);
                            }
                            if (process.env.NODE_ENV !== 'production') console.log('[SSO → AMS Sync] Linked SSO user', ssoEmail, '(normalized:', normalizedSsoEmail + ')', 'to AMS user', userId);
                        } catch (ssoVerifyError) {
                            console.error('[/me] ❌ SSO token verification failed:', ssoVerifyError.message);
                            throw ssoVerifyError;
                        }
                    } else {
                        // Assume AMS local token
                        tokenType = 'AMS';
                        if (process.env.NODE_ENV !== 'production') console.log('[/me] Detected AMS local token (kid: ' + (kid || 'none') + ')');
                        try {
                            decoded = jwtUtils.verify(token);
                            userId = decoded.userId;
                            authMethod = decoded.authMethod || 'local';
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] ✅ AMS JWT token verified successfully for user:', userId);
                            if (process.env.NODE_ENV !== 'production') console.log('[/me] decoded.userId value:', decoded.userId, 'type:', typeof decoded.userId);
                        } catch (amsVerifyError) {
                            console.error('[/me] ❌ AMS token verification failed:', amsVerifyError.message);
                            throw amsVerifyError;
                        }
                    }
                } else {
                    throw new Error('Invalid token format: missing header');
                }
            } catch (verifyError) {
                console.error('[/me] ❌ JWT token verification failed:', verifyError.message);
                console.error('[/me] Error type:', verifyError.name);
                console.error('[/me] Token type attempted:', tokenType);
                
                // Try to decode token to get more info
                try {
                    const decoded = jwt.decode(token, { complete: true });
                    if (decoded && decoded.header) {
                        console.error('[/me] Token header info:', {
                            alg: decoded.header.alg,
                            kid: decoded.header.kid,
                            typ: decoded.header.typ
                        });
                    }
                } catch (decodeError) {
                    console.error('[/me] Could not decode token:', decodeError.message);
                }
                
                return res.status(401).json({ 
                    error: 'Invalid token',
                    message: verifyError.message,
                    code: 'TOKEN_VERIFICATION_FAILED'
                });
            }
        }

        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Check cache first
        const cacheService = require('../services/cacheService');
        const cachedUser = cacheService.getUser(userId);
        
        if (cachedUser) {
            if (process.env.NODE_ENV !== 'production') console.log('[/me] Returning cached user data');
            return res.json(await attachLeavesSectionFlag(cachedUser));
        }

        if (process.env.NODE_ENV !== 'production') console.log('[/me] Fetching user from database');
        if (process.env.NODE_ENV !== 'production') console.log('[/me] userId value:', userId, 'type:', typeof userId);
        
        // Fetch user with shiftGroup and reportingPerson populated in a single query (PERF-005)
        const user = await User.findById(userId)
            .populate('shiftGroup', 'shiftName startTime endTime durationHours paidBreakMinutes')
            .populate('reportingPerson', 'fullName email department designation')
            .select('-passwordHash -__v')
            .lean();
        
        if (!user) {
            if (process.env.NODE_ENV !== 'production') console.log('[/me] User not found:', userId);
            return res.status(404).json({ error: 'User not found.' });
        }
        
        // Normalize reportingPerson: if not a populated object, set to null
        if (!user.reportingPerson || typeof user.reportingPerson !== 'object') {
            user.reportingPerson = null;
        }

        if (process.env.NODE_ENV !== 'production') console.log('[/me] User found:', user.email);

        const userResponse = {
            id: user._id,
            name: user.fullName,
            fullName: user.fullName,
            employeeCode: user.employeeCode,
            email: user.email,
            role: user.role,
            employmentStatus: user.employmentStatus,
            domain: user.domain,
            designation: user.designation,
            department: user.department,
            joiningDate: user.joiningDate,
            alternateSaturdayPolicy: user.alternateSaturdayPolicy,
            profileImageUrl: user.profileImageUrl,
            authMethod: authMethod,
            // Add personal details, identity details, and reporting person
            personalDetails: user.personalDetails || {},
            identityDetails: user.identityDetails || {},
            reportingPerson: user.reportingPerson || null,
            featurePermissions: user.featurePermissions || {
                leaves: true,
                breaks: true,
                extraFeatures: false,
                maxBreaks: 999, // No restrictions
                breakAfterHours: 0, // Can take break immediately
                breakWindows: [], // No time restrictions by default
                canCheckIn: true,
                canCheckOut: true,
                canTakeBreak: true,
                canViewAnalytics: false,
                canViewLiveAttendance: false,
                canManageResourceRequests: false,
                privilegeLevel: 'normal',
                restrictedFeatures: {
                    canViewReports: false,
                    canViewOtherLogs: false,
                    canEditProfile: true,
                    canRequestExtraBreak: true
                },
                advancedFeatures: {
                    canBulkActions: false,
                    canExportData: false
                },
                autoBreakOnInactivity: false,
                inactivityThresholdMinutes: 5
            },
            shift: user.shiftGroup ? {
                id: user.shiftGroup._id,
                name: user.shiftGroup.shiftName,
                startTime: user.shiftGroup.startTime,
                endTime: user.shiftGroup.endTime,
                duration: user.shiftGroup.durationHours,
                paidBreak: user.shiftGroup.paidBreakMinutes,
            } : null,
            onboarding: user.onboarding || {}
        };

        // Cache the user data
        cacheService.setUser(userId, userResponse);
        
        if (process.env.NODE_ENV !== 'production') console.log('[/me] User data cached and returned successfully');
        res.json(await attachLeavesSectionFlag(userResponse));
    } catch (error) {
        console.error('[/me] Error fetching user data:', error);
        console.error('[/me] Error details:', error.message, error.stack);
        res.status(500).json({ 
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// SSO Callback Route
router.get('/callback', async (req, res) => {
    try {
        const { sso_token } = req.query;

        if (!sso_token) {
            if (process.env.NODE_ENV !== 'production') console.log('[SSO] No SSO token provided in callback');
            return res.redirect('/login?error=no_sso_token');
        }

        if (process.env.NODE_ENV !== 'production') console.log('[SSO] Processing SSO callback with token');

        // Validate the SSO token
        const ssoUser = await ssoService.validateToken(sso_token);

        // Find or create user in AMS
        const user = await ssoService.findOrCreateUser(ssoUser);

        // Create AMS JWT token
        const amsToken = ssoService.createAMSToken(user);

        // Prepare user data for response
        const userData = await attachLeavesSectionFlag({
            id: user._id,
            name: user.fullName,
            fullName: user.fullName,
            employeeCode: user.employeeCode,
            email: user.email,
            role: user.role,
            domain: user.domain,
            designation: user.designation,
            department: user.department,
            joiningDate: user.joiningDate,
            alternateSaturdayPolicy: user.alternateSaturdayPolicy,
            profileImageUrl: user.profileImageUrl,
            authMethod: 'SSO',
            shift: user.shiftGroup ? {
                id: user.shiftGroup._id,
                name: user.shiftGroup.shiftName,
                startTime: user.shiftGroup.startTime,
                endTime: user.shiftGroup.endTime,
                duration: user.shiftGroup.durationHours,
                paidBreak: user.shiftGroup.paidBreakMinutes,
            } : null
        });

        if (process.env.NODE_ENV !== 'production') console.log(`[SSO] Successfully authenticated user: ${user.email} via SSO`);

        // For SSO, we need to redirect to frontend with token
        // The frontend will handle setting the token in sessionStorage
        const frontendUrl = process.env.FRONTEND_URL || 'https://attendance.bylinelms.com';
        const redirectUrl = `${frontendUrl}/auth/sso-callback?token=${encodeURIComponent(amsToken)}&user=${encodeURIComponent(JSON.stringify(userData))}`;
        
        res.redirect(redirectUrl);

    } catch (error) {
        console.error('[SSO] SSO callback error:', error.message);
        
        // Redirect to login page with error
        const frontendUrl = process.env.FRONTEND_URL || 'https://attendance.bylinelms.com';
        const errorMessage = encodeURIComponent(error.message);
        res.redirect(`${frontendUrl}/login?error=sso_error&message=${errorMessage}`);
    }
});

// POST /api/auth/auto-login - Auto-login endpoint for SSO integration
router.post('/auto-login', async (req, res) => {
    try {
        const { appId, returnUrl } = req.body;
        
        if (!appId) {
            return res.status(400).json({ 
                error: 'Application ID is required',
                code: 'MISSING_APP_ID'
            });
        }

        // Get SSO token from cookies or headers
        const ssoToken = req.cookies.accessToken || req.headers.authorization?.replace('Bearer ', '');
        
        if (!ssoToken) {
            return res.status(401).json({ 
                error: 'SSO token required',
                code: 'MISSING_SSO_TOKEN'
            });
        }

        if (process.env.NODE_ENV !== 'production') console.log(`[AutoLogin] Processing auto-login for app: ${appId}`);

        // Validate SSO token using existing SSO service
        const ssoUser = await ssoService.validateToken(ssoToken);
        
        // Find or create user in AMS
        const user = await ssoService.findOrCreateUser(ssoUser);
        
        // Create AMS JWT token
        const amsToken = ssoService.createAMSToken(user);

        // Prepare response
        const response = {
            success: true,
            message: 'Auto-login successful',
            token: amsToken,
            user: {
                id: user._id,
                name: user.fullName,
                email: user.email,
                role: user.role,
                authMethod: 'SSO'
            }
        };

        // If returnUrl is provided, redirect to it with token
        if (returnUrl) {
            const redirectUrl = new URL(returnUrl);
            redirectUrl.searchParams.set('token', amsToken);
            redirectUrl.searchParams.set('user', encodeURIComponent(JSON.stringify(response.user)));
            
            return res.redirect(redirectUrl.toString());
        }

        res.json(response);

    } catch (error) {
        console.error('[AutoLogin] Auto-login failed:', error.message);
        
        res.status(401).json({
            error: 'Auto-login failed',
            message: error.message,
            code: 'AUTO_LOGIN_FAILED'
        });
    }
});

// REMOVED: /sso-verify endpoint - use /sso-consume instead
// All SSO authentication should go through /api/auth/sso-consume

// In-memory cache for SSO token verification results (prevents duplicate processing)
// Key: token hash, Value: { result, timestamp }
const ssoTokenCache = new Map();
const SSO_CACHE_TTL = 10000; // 10 seconds

// Helper to create cache key from token
function getTokenCacheKey(token) {
    // Use first 50 chars + last 20 chars as cache key (fast hash)
    return token.substring(0, 50) + token.substring(token.length - 20);
}

// Helper to clean expired cache entries
function cleanExpiredCacheEntries() {
    const now = Date.now();
    for (const [key, value] of ssoTokenCache.entries()) {
        if (now - value.timestamp > SSO_CACHE_TTL) {
            ssoTokenCache.delete(key);
        }
    }
}

// =================================================================
// SSO LOGIN ROUTE - POST /api/auth/sso-consume
// This route handles SSO token authentication from SSO portal
// It is completely independent of standalone login route
// Frontend LoginPage calls this when SSO token is detected in URL
// =================================================================
// POST /api/auth/sso-consume - Consume SSO token from frontend
// This is the ONLY endpoint frontend should call for SSO authentication
router.post('/sso-consume', async (req, res) => {
    try {
        if (process.env.NODE_ENV !== 'production') console.log('[SSO Login] SSO consume route called - processing SSO token authentication');
        
        // Ensure MongoDB connection is ready before proceeding
        const mongoose = require('mongoose');
        const connectDB = require('../db');
        
        if (mongoose.connection.readyState !== 1) {
            console.warn('[SSO-Consume] MongoDB not connected (readyState: ' + mongoose.connection.readyState + '), reconnecting...');
            try {
                await connectDB();
                if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] ✅ MongoDB connection ready');
            } catch (dbError) {
                console.error('[SSO-Consume] ❌ MongoDB reconnection failed:', dbError.message);
                return res.status(503).json({ 
                    error: 'Database connection unavailable',
                    message: 'Please try again in a moment',
                    code: 'DB_CONNECTION_ERROR'
                });
            }
        }
        
        const { token, returnUrl } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'missing_token' });
        }

        // Clean expired cache entries periodically
        cleanExpiredCacheEntries();

        // Check cache for duplicate requests (same token within 2 seconds)
        const cacheKey = getTokenCacheKey(token);
        const cachedResult = ssoTokenCache.get(cacheKey);
        const now = Date.now();
        
        if (cachedResult && (now - cachedResult.timestamp) < 2000) {
            // Same token processed within last 2 seconds - return cached result
            console.log('[SSO-Consume] ⚠️ Duplicate request detected (within 2s), returning cached result');
            return res.json(cachedResult.result);
        }

        if (process.env.NODE_ENV !== 'production') console.log('[SSO Login] Processing SSO token from frontend via SSO consume route');
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Token preview:', token.substring(0, 50) + '...');

        // Verify SSO token using JWKS (RS256 only)
        let decoded;
        try {
            // Decode header first to get kid for better error messages
            const decodedHeader = jwt.decode(token, { complete: true });
            const kid = decodedHeader?.header?.kid;
            const alg = decodedHeader?.header?.alg;
            
            decoded = await jwtUtils.verifySSOTokenWithJWKS(token);
            if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] ✅ SSO token verified via JWKS');
            if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Token payload:', {
                sub: decoded.sub,
                userId: decoded.userId,
                email: decoded.email,
                name: decoded.name,
                role: decoded.role,
                iss: decoded.iss,
                aud: decoded.aud
            });
        } catch (jwtError) {
            console.error('[SSO-Consume] ❌ SSO token verification failed:', jwtError.message);
            
            // Enhanced error logging with kid, issuer, audience info
            try {
                const decodedHeader = jwt.decode(token, { complete: true });
                const kid = decodedHeader?.header?.kid || 'MISSING';
                const alg = decodedHeader?.header?.alg || 'MISSING';
                const payload = decodedHeader?.payload || {};
                
                console.error('[SSO-Consume] Token details:', {
                    kid,
                    alg,
                    iss: payload.iss || 'MISSING',
                    aud: payload.aud || 'MISSING',
                    exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'MISSING'
                });
                
                // Provide structured error response
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SSO_TOKEN',
                    message: jwtError.message,
                    details: {
                        kid,
                        alg,
                        issuer: payload.iss,
                        audience: payload.aud,
                        expectedKid: 'sso-key-*',
                        expectedAlg: 'RS256'
                    }
                });
            } catch (decodeError) {
                // Fallback if we can't decode
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_SSO_TOKEN',
                    message: jwtError.message,
                    code: 'TOKEN_VERIFICATION_FAILED'
                });
            }
        }
        
        // Extract user data from decoded token
        const rawEmail = decoded.email;
        const userName = decoded.name;
        const userRole = decoded.role;
        const userDepartment = decoded.department;
        const userDesignation = decoded.designation;
        const employeeCode = decoded.employeeCode || decoded.employee_id;
        
        if (!rawEmail) {
            return res.status(400).json({
                error: 'Missing email in SSO token',
                code: 'MISSING_EMAIL'
            });
        }
        
        // Normalize email for matching, but also try exact raw lowercase to support admin-created emails
        const userEmail = normalizeEmail(rawEmail);
        const rawLowerEmail = String(rawEmail).toLowerCase();
        
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Processing user');
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Raw email from SSO token:', rawEmail);
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Normalized email for lookup:', userEmail);

        // Helper function to map SSO role to AMS role
        const mapSSORoleToAMS = (ssoRole) => {
            if (!ssoRole || typeof ssoRole !== 'string') {
                return DEFAULT_SSO_ROLE;
            }
            const roleMapping = {
                'admin': 'Admin',
                'administrator': 'Admin',
                'hr': 'HR',
                'human_resources': 'HR',
                'employee': 'Employee',
                'staff': 'Employee',
                'intern': 'Intern',
                'trainee': 'Intern'
            };
            const normalizedRole = ssoRole.toLowerCase().replace(/[_\s]/g, '_');
            return roleMapping[normalizedRole] || DEFAULT_SSO_ROLE;
        };

        // Find existing user in AMS by normalized OR exact raw lowercase email (prevent duplicate creation)
        let user = await User.findOne({ 
            isActive: true,
            $or: [
                { email: userEmail },            // normalized
                { email: rawLowerEmail }         // exact as stored by admin
            ]
        }).populate('shiftGroup');

        if (!user) {
            // Check if user exists but is inactive (try both variants)
            const inactiveUser = await User.findOne({ 
                isActive: false,
                $or: [
                    { email: userEmail },
                    { email: rawLowerEmail }
                ]
            });
            if (inactiveUser) {
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] Found inactive user with normalized email: ${userEmail} - reactivating`);
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] Original raw email was: ${rawEmail}`);
                inactiveUser.isActive = true;
                inactiveUser.authMethod = 'SSO';
                inactiveUser.lastLogin = new Date();
                await inactiveUser.save();
                user = await User.findById(inactiveUser._id).populate('shiftGroup');
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] ✅ Reactivated existing user: ${userEmail}`);
            } else {
                // Check if auto-provisioning is enabled
                const autoProvision = process.env.SSO_AUTO_PROVISION === 'true';
                if (!autoProvision) {
                    if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] User ${userEmail} not found and auto-provisioning disabled`);
                    return res.status(403).json({ 
                        error: 'User not found and auto-provisioning disabled',
                        code: 'USER_NOT_FOUND'
                    });
                }

                // Auto-provision new user (only if doesn't exist)
                // IMPORTANT: Store normalized email to maintain consistency
                console.log(`[SSO-Consume] No existing user found with normalized email: ${userEmail}`);
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] Auto-provisioning new user with normalized email`);
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] Raw email from SSO: ${rawEmail} -> Normalized: ${userEmail}`);
                
                const orgFields = syncOrgFields({
                    department: userDepartment || 'Unknown',
                    domain: decoded.domain || userDepartment || 'Unknown',
                    designation: userDesignation || 'Employee',
                });
                user = new User({
                    email: userEmail, // Store normalized email for consistency
                    fullName: userName || userEmail.split('@')[0],
                    employeeCode: employeeCode || `SSO_${Date.now()}`,
                    role: mapSSORoleToAMS(userRole),
                    department: orgFields.department,
                    designation: orgFields.designation,
                    domain: orgFields.domain,
                    passwordHash: 'SSO_USER_NO_PASSWORD',
                    joiningDate: new Date(),
                    isActive: true,
                    authMethod: 'SSO',
                    featurePermissions: {
                        leaves: true,
                        breaks: true,
                        extraFeatures: false,
                        maxBreaks: 999,
                        breakAfterHours: 0,
                        breakWindows: [],
                        canCheckIn: true,
                        canCheckOut: true,
                        canTakeBreak: true,
                        privilegeLevel: 'normal',
                        restrictedFeatures: {},
                        advancedFeatures: {}
                    }
                });

                await user.save();
                user = await User.findById(user._id).populate('shiftGroup');
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] ✅ Successfully created new AMS user with normalized email: ${userEmail}`);
                if (process.env.NODE_ENV !== 'production') console.log('[SSO → AMS Sync] Created AMS user', userEmail, 'with ID:', user._id.toString());
            }
        } else {
            // User found using normalized email lookup
            console.log(`[SSO-Consume] ✅ Found existing user via normalized email lookup: ${userEmail}`);
            if (rawEmail !== userEmail) {
                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] Email normalization matched: ${rawEmail} -> ${userEmail}`);
            }
            
            // Update user data from SSO if needed
            const needsUpdate = 
                (userDepartment && user.department !== userDepartment) ||
                (userDesignation && user.designation !== userDesignation) ||
                (employeeCode && user.employeeCode !== employeeCode);

            if (needsUpdate) {
                const updateData = {
                    authMethod: 'SSO'
                };

                if (userDepartment) {
                    const orgFields = syncOrgFields({
                        department: userDepartment,
                        domain: user.domain,
                        designation: userDesignation || user.designation,
                    });
                    updateData.department = orgFields.department;
                    updateData.domain = orgFields.domain;
                }
                if (userDesignation) updateData.designation = userDesignation;
                if (employeeCode) updateData.employeeCode = employeeCode;

                user = await User.findByIdAndUpdate(
                    user._id,
                    updateData,
                    { new: true }
                ).populate('shiftGroup');

                if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] Updated user data for: ${userEmail}`);
            } else {
                if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] ✅ Using existing AMS user - no update needed');
                if (process.env.NODE_ENV !== 'production') console.log('[SSO → AMS Sync] Linked SSO user', rawEmail, '(normalized:', userEmail + ')', 'to existing AMS user', user._id.toString());
            }
            
            // Update last login timestamp
            await User.findByIdAndUpdate(user._id, { lastLogin: new Date() }, { new: false });
        }

        // Check for cached AMS token first
        const cacheService = require('../services/cacheService');
        // Try to get cached token (if we had a token cache per user)
        // For now, always generate new token, but we'll cache it
        
        // Create AMS JWT token with AMS user ID (not SSO user ID)
        console.log('[SSO-Consume] Creating AMS local JWT token for user:', user.email);
        const amsToken = jwtUtils.sign({
            userId: user._id.toString(), // Use AMS user ID, not SSO user ID
            email: user.email,
            role: user.role,
            authMethod: 'SSO'
        }, { expiresIn: '15m' });
        
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] ✅ AMS access token generated successfully (15m)');
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] AMS token preview:', amsToken.substring(0, 50) + '...');
        
        // Self-verify the token we just created
        try {
            const verified = jwtUtils.verify(amsToken);
            if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] ✅ AMS token self-verification successful');
            if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Verified payload:', { userId: verified.userId, email: verified.email });
        } catch (verifyError) {
            console.error('[SSO-Consume] ❌ AMS token self-verification failed:', verifyError.message);
            throw new Error(`Failed to verify generated AMS token: ${verifyError.message}`);
        }

        // Issue a 7-day opaque refresh token for SSO users.
        const ssoUserAgent = req.headers['user-agent'] || null;
        const rawRefreshToken = await issueRefreshToken(user._id, 'SSO', ssoUserAgent);
        res.cookie('refreshToken', rawRefreshToken, getRefreshCookieOptions());

        // Create session (optional, token-based auth is primary)
        req.session.user = {
            id: user._id.toString(), // Use AMS user ID
            name: user.fullName,
            email: user.email,
            role: user.role,
            authMethod: 'SSO'
        };
        req.session.ssoAuthenticated = true;

        if (process.env.NODE_ENV !== 'production') console.log(`[SSO-Consume] ✅ SSO login success: ${userEmail}`);

        // Prepare user data for response
        const userData = await attachLeavesSectionFlag({
            id: user._id,
            name: user.fullName,
            fullName: user.fullName,
            employeeCode: user.employeeCode,
            email: user.email,
            role: user.role,
            domain: user.domain,
            designation: user.designation,
            department: user.department,
            joiningDate: user.joiningDate,
            alternateSaturdayPolicy: user.alternateSaturdayPolicy,
            profileImageUrl: user.profileImageUrl,
            authMethod: 'SSO',
            shift: user.shiftGroup ? {
                id: user.shiftGroup._id,
                name: user.shiftGroup.shiftName,
                startTime: user.shiftGroup.startTime,
                endTime: user.shiftGroup.endTime,
                duration: user.shiftGroup.durationHours,
                paidBreak: user.shiftGroup.paidBreakMinutes,
            } : null
        });

        // Prepare success response with proper format
        const redirectUrlToUse = returnUrl || '/dashboard';
        const successResponse = { 
            success: true, 
            accessToken: amsToken, // 15-minute access token
            // 'token' alias kept for backward-compatibility during rollout.
            token: amsToken,
            redirect: redirectUrlToUse,
            user: userData
        };

        // Cache the result to prevent duplicate processing
        ssoTokenCache.set(cacheKey, {
            result: successResponse,
            timestamp: Date.now()
        });

        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] ✅ SSO consume completed successfully');
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] User:', userEmail);
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] AMS User ID:', user._id.toString());
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Redirect URL:', redirectUrlToUse);
        if (process.env.NODE_ENV !== 'production') console.log('[SSO-Consume] Result cached to prevent duplicate requests');
        console.info('[SSO] Frontend successfully consumed AMS token');

        // Return JSON response (no redirect, no cookies - pure JSON)
        res.status(200).json(successResponse);

    } catch (err) {
        console.error('[SSO-Consume] Unexpected error:', err);
        console.error('[SSO-Consume] Error stack:', err.stack);
        
        // Structured error response
        res.status(401).json({ 
            success: false,
            error: 'SSO_AUTH_FAILED',
            message: err.message,
            code: 'INTERNAL_ERROR'
        });
    }
});

// =================================================================
// POST /api/auth/refresh
// Consumes the httpOnly refreshToken cookie, rotates it, and returns
// a new 15-minute access token + new refresh token cookie.
// This route is intentionally UNAUTHENTICATED — the refresh cookie IS
// the credential; it must not pass through authenticateToken middleware.
//
// Hardening layers (in order):
//   1. refreshRateLimiter  — 20 req / 5 min per IP+cookieHash bucket
//   2. refreshDedupCache   — in-process promise coalescing for the same
//                            raw token within a 2-second window
//   3. rotateRefreshToken  — atomic findOneAndUpdate in MongoDB so only
//                            one concurrent DB write can succeed
// =================================================================
router.post('/refresh', refreshRateLimiter, async (req, res) => {
    // Read refresh token from httpOnly cookie (never from body or header)
    const rawRefreshToken = req.cookies && req.cookies.refreshToken;

    if (!rawRefreshToken) {
        return res.status(401).json({
            error: 'Refresh token missing',
            code: 'REFRESH_INVALID',
        });
    }

    // ── Dedup cache: coalesce concurrent requests for the same token ──────────
    // Key by the hash (never the raw value) so the cache itself holds no secret.
    cleanRefreshDedupCache();
    const dedupKey = hashRefreshToken(rawRefreshToken);
    const existingEntry = refreshDedupCache.get(dedupKey);

    if (existingEntry) {
        // A request for this exact token is already in-flight (or settled within
        // the TTL window). Wait for / reuse its result.
        try {
            const { newRawToken, userId, authMethod } = await existingEntry.promise;
            return await _buildRefreshResponse(res, newRawToken, userId, authMethod);
        } catch (err) {
            return _handleRefreshError(res, err);
        }
    }

    // ── First caller: create the in-flight promise and register it ────────────
    let resolveEntry, rejectEntry;
    const rotationPromise = new Promise((resolve, reject) => {
        resolveEntry = resolve;
        rejectEntry = reject;
    });

    // Suppress "unhandledRejection" on the shared promise — callers that
    // coalesce onto this promise attach their own .catch() via the try/catch
    // in the existingEntry branch above. Without this suppressor, Node ≥ 15
    // (and especially v26 which defaults --unhandled-rejections=throw) will
    // crash the process the moment rejectEntry() is called before any waiter
    // has had a chance to attach a rejection handler.
    rotationPromise.catch(() => {});

    const cacheEntry = { promise: rotationPromise, settledAt: null };
    refreshDedupCache.set(dedupKey, cacheEntry);

    try {
        const rotationResult = await rotateRefreshToken(rawRefreshToken);

        // Settle the shared promise so any coalesced waiters get the same result.
        cacheEntry.settledAt = Date.now();
        resolveEntry(rotationResult);

        const { newRawToken, userId, authMethod } = rotationResult;
        return await _buildRefreshResponse(res, newRawToken, userId, authMethod);

    } catch (err) {
        cacheEntry.settledAt = Date.now();
        rejectEntry(err);
        return _handleRefreshError(res, err);
    }
});

/**
 * Build and send the 200 response after a successful rotation.
 * Extracted so both the first-caller and coalesced-waiter paths share it.
 */
async function _buildRefreshResponse(res, newRawToken, userId, authMethod) {
    // Fetch the user to build the access token claims
    const user = await User.findById(userId)
        .select('email role isActive')
        .lean();

    if (!user || !user.isActive) {
        // User deactivated since the refresh token was issued — treat as invalid.
        await revokeRefreshToken(newRawToken).catch(() => {});
        clearRefreshCookie(res);
        return res.status(401).json({
            error: 'User account is inactive',
            code: 'REFRESH_INVALID',
        });
    }

    const accessToken = jwtUtils.sign({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        authMethod,
    }, { expiresIn: '15m' });

    // Set new refresh token cookie (old one was just rotated/revoked)
    res.cookie('refreshToken', newRawToken, getRefreshCookieOptions());

    if (process.env.NODE_ENV !== 'production') {
        console.log(`[Auth/Refresh] ✅ Token rotated for userId: ${userId}`);
    }

    return res.status(200).json({ accessToken });
}

/**
 * Unified error handler for /refresh — preserves the existing response contract.
 */
function _handleRefreshError(res, err) {
    if (err instanceof RefreshTokenReuseError) {
        // Possible token theft — structured log already emitted by rotateRefreshToken.
        // Clear the cookie so the attacker's copy is also neutered.
        clearRefreshCookie(res);
        return res.status(401).json({
            error: 'Refresh token invalid or expired',
            code: 'REFRESH_INVALID',
        });
    }

    if (process.env.NODE_ENV !== 'production') {
        console.warn('[Auth/Refresh] Refresh failed:', err.message);
    }

    clearRefreshCookie(res);
    return res.status(401).json({
        error: 'Refresh token invalid or expired',
        code: 'REFRESH_INVALID',
    });
}

// =================================================================
// POST /api/auth/logout
// Revokes the refresh token (marks it as revoked in MongoDB) and
// clears the httpOnly cookie. Returns 204 No Content.
// This route is unauthenticated — only the refresh cookie is needed.
// =================================================================
router.post('/logout', async (req, res) => {
    const rawRefreshToken = req.cookies && req.cookies.refreshToken;

    if (rawRefreshToken) {
        try {
            await revokeRefreshToken(rawRefreshToken);
        } catch (err) {
            // Silently ignore errors on logout — best-effort revocation
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[Auth/Logout] revokeRefreshToken error (ignored):', err.message);
            }
        }
    }

    // Destroy the express session if one exists (SSO sessions)
    try {
        if (req.session) {
            req.session.destroy(() => {});
        }
    } catch (_) { /* ignore */ }

    clearRefreshCookie(res);
    return res.status(204).end();
});

// REMOVED: Duplicate /sso-verify and /sso-login endpoints - use /sso-consume instead
// All SSO authentication should go through /api/auth/sso-consume


module.exports = router;