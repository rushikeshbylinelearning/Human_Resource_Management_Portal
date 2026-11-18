// backend/middleware/authenticateToken.js
// Supports both AMS local tokens and SSO tokens (RS256)
const jwt = require('jsonwebtoken');
const jwtUtils = require('../utils/jwtUtils');
const { normalizeEmail, caseInsensitiveEmailClause } = require('../utils/emailUtils');

// ─── SSO User Cache ───────────────────────────────────────────────────────────
// A2 Hosting shared environments have slow MongoDB round-trips.
// Cache SSO user lookups (email → userId/role) for 5 minutes so repeated
// requests from the same browser session don't hit the DB every time.
const ssoUserCache = new Map(); // email → { user, expiresAt }
const SSO_USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedSSOUser(email) {
    const entry = ssoUserCache.get(email);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        ssoUserCache.delete(email);
        return null;
    }
    return entry.user;
}

function setCachedSSOUser(email, user) {
    ssoUserCache.set(email, { user, expiresAt: Date.now() + SSO_USER_CACHE_TTL_MS });
    // Prevent unbounded growth
    if (ssoUserCache.size > 500) {
        const firstKey = ssoUserCache.keys().next().value;
        ssoUserCache.delete(firstKey);
    }
}
// ─────────────────────────────────────────────────────────────────────────────

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        return res.sendStatus(401); // Unauthorized
    }

    try {
        // Ensure MongoDB connection before proceeding
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            await new Promise((resolve, reject) => {
                if (mongoose.connection.readyState === 1) return resolve();
                const timeout = setTimeout(() => reject(new Error('MongoDB connection timeout')), 5000);
                mongoose.connection.once('connected', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }

        // Decode token header to determine type
        const decodedHeader = jwt.decode(token, { complete: true });
        if (!decodedHeader || !decodedHeader.header) {
            throw new Error('Invalid token format: missing header');
        }

        const kid = decodedHeader.header.kid;
        const alg = decodedHeader.header.alg;

        let user;

        if (alg === 'HS256') {
            // Legacy HS256 token
            const decoded = jwtUtils.verify(token);
            user = {
                userId: decoded.userId || decoded.id,
                email: decoded.email,
                role: decoded.role,
                authMethod: decoded.authMethod || 'local'
            };
        } else if (!kid) {
            throw new Error('Missing kid (key ID) in token header');
        } else if (kid.startsWith('sso-key-')) {
            // SSO token - verify using JWKS
            const decoded = await jwtUtils.verifySSOTokenWithJWKS(token);

            const rawEmail = decoded.email;
            const normalizedEmail = normalizeEmail(rawEmail);
            const rawLowerEmail = String(rawEmail).toLowerCase();

            // ── Check in-process cache first (avoids DB round-trip on shared hosting) ──
            let cachedUser = getCachedSSOUser(normalizedEmail) || getCachedSSOUser(rawLowerEmail);

            if (!cachedUser) {
                const User = require('../models/User');
                const emailMatches = [normalizedEmail, rawLowerEmail]
                    .map((value) => caseInsensitiveEmailClause(value))
                    .filter(Boolean)
                    .map((clause) => ({ email: clause }));
                const dbUser = emailMatches.length
                    ? await User.findOne({
                        isActive: true,
                        $or: emailMatches
                    }).select('_id email role').lean()
                    : null; // select only needed fields

                if (!dbUser) {
                    throw new Error('User not found for SSO token email: ' + normalizedEmail);
                }

                cachedUser = {
                    userId: dbUser._id.toString(),
                    email: dbUser.email,
                    role: dbUser.role,
                    authMethod: 'SSO'
                };
                setCachedSSOUser(normalizedEmail, cachedUser);
                if (rawLowerEmail !== normalizedEmail) {
                    setCachedSSOUser(rawLowerEmail, cachedUser);
                }
            }

            user = cachedUser;
        } else {
            if (alg !== 'RS256') {
                throw new Error(`Invalid algorithm: ${alg}. Only RS256 or HS256 are supported.`);
            }
            // AMS local RS256 token
            const decoded = jwtUtils.verify(token);
            user = {
                userId: decoded.userId || decoded.id,
                email: decoded.email,
                role: decoded.role,
                authMethod: decoded.authMethod || 'local'
            };
        }

        req.user = user;
        next();
    } catch (err) {
        // Only log detailed info in development to reduce I/O overhead on A2
        if (process.env.NODE_ENV !== 'production') {
            console.error('[AuthenticateToken] Token verification failed:', err.message);
        }

        // Distinguish expired tokens from genuinely invalid ones.
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: err.message,
                code: 'TOKEN_EXPIRED'
            });
        }

        return res.status(403).json({
            error: 'Invalid token',
            message: err.message,
            code: 'TOKEN_VERIFICATION_FAILED'
        });
    }
}

module.exports = authenticateToken;
