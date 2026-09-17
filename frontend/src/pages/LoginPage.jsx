// frontend/src/pages/LoginPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { TextField, Button, Typography, Alert, Box, IconButton, InputAdornment, Link } from '@mui/material';
import { Visibility, VisibilityOff, LocationOn, LocationOff } from '@mui/icons-material';
import { getCurrentLocation, isGeolocationSupported, formatDistance, getCachedLocationOnly, isLocationCacheValid } from '../services/locationService';
import { SkeletonBox } from '../components/SkeletonLoaders';
import '../styles/LoginPage.css';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [showDiagnosisLink, setShowDiagnosisLink] = useState(false);
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [locationSuccess, setLocationSuccess] = useState(false);
    const [geolocationSupported, setGeolocationSupported] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const isProcessingRef = useRef(false);
    const authCheckedRef = useRef(false); // Track if auth check has been performed
    const { login, loginWithToken, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Check geolocation support and cached location on component mount
    useEffect(() => {
        setGeolocationSupported(isGeolocationSupported());
        
        // Check if we have a valid cached location
        if (isLocationCacheValid()) {
            const cachedLocation = getCachedLocationOnly();
            setLocation(cachedLocation);
        }
    }, []);

    // Process SSO token function (can be called from URL or postMessage)
    const processSSOToken = async (ssoToken) => {
        if (isProcessingRef.current) {
            console.log('[LoginPage] SSO authentication already in progress, skipping duplicate call');
            return;
        }

        console.log('[SSO Login] SSO token detected - using SSO flow');
                isProcessingRef.current = true; // Lock the process
                setIsProcessing(true);
        console.log('[SSO Login] SSO token found, processing now.');
                
                try {
            console.log('[SSO Login] Calling POST /api/auth/validate-sso...');
            console.log('[SSO Login] Using axios instance with baseURL:', api.defaults.baseURL);
            console.log('[SSO Login] Full URL will be:', `${api.defaults.baseURL}/auth/validate-sso`);
            console.log('[SSO Login] SSO Token preview:', ssoToken ? ssoToken.substring(0, 50) + '...' : 'MISSING');
            console.log('[SSO Login] SSO Token length:', ssoToken ? ssoToken.length : 0);
            
            // Use axios instance for consistent URL handling and error management
            const response = await api.post('/auth/validate-sso', {
                sso_token: ssoToken
            });

            const data = response.data;
                    
                    if (!data.token) {
                        throw new Error('No AMS JWT token received from backend');
                    }

                    // Phase 1: token goes into AuthContext memory only — no storage writes.
                    // loginWithToken sets the axios header and calls /api/auth/me.
                    // Store user in AuthContext
                    if (data.user && data.token) {
                        try {
                            await loginWithToken(data.token);
                            console.log('[SSO Login] User authenticated via AuthContext');
                        } catch (authError) {
                            console.warn('[SSO Login] AuthContext login warning:', authError);
                        }
                    }
                    
                    console.log('[SSO Login] SSO success. Redirecting to dashboard.');
                    
                    // Clean up URL parameters before redirect
                    const url = new URL(window.location);
                    url.searchParams.delete('token');
                    url.searchParams.delete('sso_token');
                    url.searchParams.delete('return_url');
                    window.history.replaceState({}, document.title, url.pathname);
                    
                    // Redirect after successful authentication
                    const redirectUrl = data.redirect || '/dashboard';
                    navigate(redirectUrl, { replace: true });
                    
                } catch (error) {
            console.error('[SSO Login] ========================================');
            console.error('[SSO Login] Failed to validate SSO token');
            console.error('[SSO Login] ========================================');
            console.error('[SSO Login] Error object:', error);
            console.error('[SSO Login] Error response status:', error.response?.status);
            console.error('[SSO Login] Error response data:', error.response?.data);
            console.error('[SSO Login] Error response headers:', error.response?.headers);
            console.error('[SSO Login] Error message:', error.message);
            console.error('[SSO Login] Error config:', {
                url: error.config?.url,
                baseURL: error.config?.baseURL,
                method: error.config?.method,
                headers: error.config?.headers,
                data: error.config?.data
            });
            console.error('[SSO Login] Full request URL:', `${error.config?.baseURL}${error.config?.url}`);
            console.error('[SSO Login] Request payload:', error.config?.data);
            console.error('[SSO Login] ========================================');
            
                    isProcessingRef.current = false; // Unlock on failure
                    setIsProcessing(false);
            
            // Extract error message from axios error response
            const errorData = error.response?.data || {};
            const errorMessage = errorData.message || 
                               errorData.error || 
                               error.message || 
                               'SSO authentication failed';
            
            // Check if it's a JWKS/configuration error
            const isJwksError = errorMessage.includes('JWKS') || 
                              errorMessage.includes('signing key') || 
                              errorMessage.includes('key not found') ||
                              errorMessage.includes('JWKS endpoint');
            
            // Check if it's a network/proxy error
            const isNetworkError = !error.response && error.code !== 'ECONNABORTED';
            
            if (isNetworkError) {
                setError(`Network error: Could not reach the backend server. Please ensure the backend is running.`);
                console.error('[SSO Login] Network Error - Backend may not be running');
            } else if (isJwksError || errorData.code === 'JWKS_ERROR' || errorData.code === 'JWKS_KEY_NOT_FOUND') {
                const jwksUrl = errorData.details?.jwksUrl || 'Not configured';
                setError(`SSO configuration error: The SSO portal's JWKS endpoint is not accessible. Please contact your administrator. Error: ${errorMessage}`);
                setShowDiagnosisLink(true);
                console.error('[SSO Login] JWKS Configuration Error - SSO portal may not be properly configured');
                console.error('[SSO Login] Backend error code:', errorData.code);
                console.error('[SSO Login] JWKS URL configured:', jwksUrl);
                console.error('[SSO Login] Diagnosis guide available at: /SSO_JWKS_DIAGNOSIS.md');
            } else if (error.response?.status === 401) {
                setError(`SSO authentication failed: ${errorMessage}. Please try logging in again from the SSO portal.`);
                console.error('[SSO Login] 401 Unauthorized - Token validation failed');
            } else if (error.response?.status === 503) {
                setError(`SSO service unavailable: ${errorMessage}. This indicates a configuration issue with the SSO portal.`);
                setShowDiagnosisLink(true);
                console.error('[SSO Login] 503 Service Unavailable - SSO configuration issue');
            } else {
                setError(`SSO authentication failed: ${errorMessage}`);
            }
            
                    navigate('/login?error=sso_failed', { replace: true });
                }
    };

    // =================================================================
    // SSO LOGIN HANDLER - useEffect hook
    // This hook handles SSO token authentication from URL parameters and postMessage (iframe)
    // Standalone login is handled separately via handleLoginSubmit
    // =================================================================
    useEffect(() => {
        // Skip if already checked (prevents re-running on re-renders)
        if (authCheckedRef.current) {
            return;
        }

        // Listen for postMessage from parent window (for iframe embedding)
        const handlePostMessage = (event) => {
            // Verify origin for security
            const allowedOrigins = [
                'https://sso.bylinelms.com',
                'https://sso.legatolxp.online',
                'https://sso.leagatolxp.online',
                ...(import.meta.env.DEV ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3003'] : [])
            ];
            
            // Allow messages from allowed origins or if origin is null (some browsers in iframe scenarios)
            // Note: null origin can be a security risk, but we validate the message content
            if (event.origin && !allowedOrigins.includes(event.origin)) {
                console.warn('[SSO Login] Rejected postMessage from unauthorized origin:', event.origin);
                return;
            }
            
            // Log origin for debugging (even if null)
            if (event.origin) {
                console.log('[SSO Login] Received postMessage from origin:', event.origin);
            } else {
                console.warn('[SSO Login] Received postMessage with null origin (iframe may be blocked)');
            }

            // Check if message contains SSO token
            if (event.data && (event.data.sso_token || event.data.token || event.data.type === 'SSO_TOKEN')) {
                const ssoToken = event.data.sso_token || event.data.token;
                if (ssoToken && !isProcessingRef.current) {
                    console.log('[SSO Login] SSO token received via postMessage from parent window');
                    processSSOToken(ssoToken);
                }
            }
        };

        // Add postMessage listener for iframe communication
        window.addEventListener('message', handlePostMessage);

        const handleAuth = async () => {
            // Prevent running the logic multiple times if it's already in progress
            if (isProcessingRef.current) {
                console.log('[LoginPage] Authentication already in progress, skipping duplicate call');
                return;
            }

            // Check for SSO token in URL parameters
            const ssoToken = searchParams.get('sso_token') || searchParams.get('token');
            
            // Also check if we're in an iframe and request token from parent
            // This handles cases where SSO portal embeds the app and passes token via postMessage
            if (!ssoToken && window.self !== window.top) {
                console.log('[SSO Login] Detected iframe context, requesting SSO token from parent');
                try {
                    // Get parent origin for secure postMessage
                    let targetOrigin = '*';
                    try {
                        // Try to get parent origin (may fail if cross-origin)
                        if (window.parent.location.origin) {
                            targetOrigin = window.parent.location.origin;
                            console.log('[SSO Login] Using parent origin for postMessage:', targetOrigin);
                        }
                    } catch (e) {
                        // Cross-origin - use wildcard (less secure but necessary for iframe communication)
                        console.log('[SSO Login] Cross-origin iframe, using wildcard for postMessage');
                        targetOrigin = '*';
                    }
                    
                    // Request SSO token from parent window
                    // The parent SSO portal should respond with a postMessage containing the token
                    window.parent.postMessage({ 
                        type: 'REQUEST_SSO_TOKEN', 
                        source: 'attendance-app',
                        targetOrigin: window.location.origin 
                    }, targetOrigin);
                    
                    // Set a timeout to show login form if no token is received
                    setTimeout(() => {
                        if (!isProcessingRef.current && !ssoToken) {
                            console.log('[SSO Login] No SSO token received from parent, showing login form');
                        }
                    }, 2000);
                } catch (e) {
                    console.warn('[SSO Login] Could not communicate with parent window:', e.message);
                    console.warn('[SSO Login] This may indicate the iframe is blocked or cross-origin restrictions');
                }
            }

            // PRIORITY 1: Handle the incoming SSO Token from the URL or postMessage
            if (ssoToken) {
                processSSOToken(ssoToken);
            } 
            // PRIORITY 2: If no SSO token, but user is already authenticated, redirect.
            else if (isAuthenticated) {
                console.log('[Session Check] User is already authenticated. Redirecting to dashboard.');
                navigate('/dashboard', { replace: true });
            }
            // PRIORITY 3: If no SSO token and not authenticated, check for existing session token
            // This runs asynchronously and won't block the login form from showing
            else {
                // Run checkExistingSession asynchronously so it doesn't block form rendering
                checkExistingSession().catch(err => {
                    console.log('[LoginPage] Session check completed, showing login form');
                });
            }

            // Check for SSO error messages in URL parameters (only if not processing SSO)
            if (!ssoToken) {
                const ssoError = searchParams.get('error');
                const ssoMessage = searchParams.get('message');
                
                if (ssoError === 'sso_error' && ssoMessage) {
                    setError(decodeURIComponent(ssoMessage));
                } else if (ssoError === 'no_sso_token') {
                    setError('SSO authentication failed: No token provided');
                }
            }
            
            // Mark as checked after handling
            authCheckedRef.current = true;
        };

        // Small delay to ensure AuthContext has finished initializing
        const timeoutId = setTimeout(() => {
            handleAuth();
        }, 100);

        // Cleanup: Remove postMessage listener on unmount
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('message', handlePostMessage);
        };
    }, []); // Run only once on mount - form will always show for standard login

    // Check for existing valid AMS session
    const checkExistingSession = async () => {
        try {
            // Phase 1: session is restored by AuthContext via the httpOnly refresh cookie.
            // If AuthContext has already set isAuthenticated, redirect directly.
            if (isAuthenticated) {
                console.log('[LoginPage] AuthContext reports authenticated - redirecting to dashboard');
                window.location.href = '/dashboard';
                return;
            }

            // Try a silent refresh (browser sends the httpOnly cookie automatically).
            // If there's no valid session the server returns 401 and we stay on login.
            const response = await api.post('/auth/refresh');
            const newToken = response.data.accessToken || response.data.token;
            if (newToken) {
                console.log('[LoginPage] ✅ Existing session valid via silent refresh - redirecting to dashboard');
                await loginWithToken(newToken);
                window.location.href = '/dashboard';
            }
        } catch (error) {
            // 401 means no valid refresh token — stay on login page
            console.log('[LoginPage] No existing session:', error?.response?.data?.code || error.message);
            // Clear any leftover legacy storage keys
            sessionStorage.removeItem('ams_token');
            sessionStorage.removeItem('token');
            localStorage.removeItem('ams_token');
            localStorage.removeItem('token');
        }
    };

    // Guard to prevent duplicate SSO authentication calls (kept for backward compatibility)
    const ssoProcessingRef = React.useRef(false);

    // Legacy handleSSOAuthentication function - kept for backward compatibility
    // New logic is in the useEffect hook above
    const handleSSOAuthentication = async (ssoToken) => {
        // Prevent duplicate calls - if already processing, return
        if (ssoProcessingRef.current) {
            console.log('[SSO Debug] ⚠️ SSO authentication already in progress, skipping duplicate call');
            return;
        }

        // Check if token was already processed (prevent page reload issues)
        const processedToken = sessionStorage.getItem('sso_processed_token') || localStorage.getItem('sso_processed_token');
        if (processedToken === ssoToken) {
            console.log('[SSO Debug] ⚠️ SSO token already processed, redirecting to dashboard');
            window.location.href = '/dashboard';
            return;
        }

        ssoProcessingRef.current = true;
        setLoading(true);
        setError('');
        setShowDiagnosisLink(false);
        
        try {
            console.log('[SSO Debug] SSO token from URL:', ssoToken ? ssoToken.substring(0, 50) + '...' : 'null');
            console.log('[SSO Debug] Processing SSO token...');
            console.log('[SSO Debug] API Base URL:', import.meta.env.VITE_API_BASE_URL);
            console.log('[SSO Debug] DEV mode:', import.meta.env.DEV);

            console.log('[SSO Debug] Using axios instance with baseURL:', api.defaults.baseURL);
            console.log('[SSO Debug] Calling POST /api/auth/validate-sso (single call only)...');
            
            // Call /api/auth/validate-sso - this is the ONLY endpoint that should be called
            // It handles SSO validation AND returns AMS token in one call
            // Use axios instance for consistent URL handling and error management
            const response = await api.post('/auth/validate-sso', {
                sso_token: ssoToken
            });

            const data = response.data;
            console.log('[SSO Debug] SSO authentication successful');
            console.log('[SSO Debug] Response data:', { 
                hasToken: !!data.token, 
                hasUser: !!data.user,
                success: data.success,
                userEmail: data.user?.email 
            });
            console.log('[SSO Debug] AMS JWT from backend:', data.token ? data.token.substring(0, 50) + '...' : 'null');

            // Store the AMS JWT in sessionStorage BEFORE any other API calls
            if (!data.token) {
                console.warn('[SSO Debug] ⚠️ No token in response, authentication will fail');
                throw new Error('No AMS JWT token received from backend');
            }

            // Phase 1: token goes into AuthContext memory only — no storage writes.
            // loginWithToken sets the axios header and calls /api/auth/me.
            api.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
            
            console.log('[SSO Debug] ✅ Authorization header set for axios');
            console.info('[SSO] Frontend successfully consumed AMS token');
            
            // Verify token works by calling /api/auth/me before redirect
            try {
                console.log('[SSO Debug] Verifying AMS token by calling /api/auth/me...');
                const verifyResponse = await api.get('/auth/me');
                if (verifyResponse.data && verifyResponse.data.email) {
                    console.log('[SSO Debug] ✅ Token verification successful - user:', verifyResponse.data.email);
                } else {
                    console.warn('[SSO Debug] ⚠️ Token verification returned unexpected data');
                }
            } catch (verifyError) {
                console.error('[SSO Debug] ❌ Token verification failed:', verifyError.message);
                console.error('[SSO Debug] This may indicate the token is invalid or backend is unreachable');
                // Continue anyway - token might be valid but /me might have other issues
            }
            
            // Clean up URL parameters before redirect
            const url = new URL(window.location);
            url.searchParams.delete('token');
            url.searchParams.delete('sso_token');
            url.searchParams.delete('return_url');
            window.history.replaceState({}, document.title, url.pathname);
            
            // Store user in AuthContext before redirect
            if (data.user && data.token) {
                // Use loginWithToken to properly set up auth state
                try {
                    await loginWithToken(data.token);
                    console.log('[SSO Debug] ✅ User authenticated via AuthContext');
                } catch (authError) {
                    console.warn('[SSO Debug] AuthContext login failed, continuing with redirect:', authError);
                }
            }
            
            // Get redirect URL from response (use 'redirect' field as per backend spec)
            const redirectUrl = data.redirect || '/dashboard';
            
            // Small delay to ensure token is stored and axios headers are set
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Redirect to dashboard after successful validation
            console.log('[SSO Debug] ✅ Redirecting to:', redirectUrl);
            // Use window.location.href for full page reload to ensure clean state
            window.location.href = redirectUrl;
            
        } catch (err) {
            console.error('[SSO Debug] ❌ SSO authentication failed:', err);
            setError(`SSO authentication failed: ${err.message}`);
            setLoading(false);
            ssoProcessingRef.current = false;
        }
    };

    const getLocation = async () => {
        setLocationLoading(true);
        setLocationError('');
        setLocationSuccess(false);
        try {
            const currentLocation = await getCurrentLocation();
            setLocation(currentLocation);
            setLocationSuccess(true);
            // Hide success message after 3 seconds
            setTimeout(() => {
                setLocationSuccess(false);
            }, 3000);
        } catch (err) {
            setLocationError(err.message);
        } finally {
            setLocationLoading(false);
        }
    };

    // =================================================================
    // STANDALONE LOGIN HANDLER - POST /api/auth/login
    // This handles direct email/password authentication
    // Completely independent of SSO flow
    // =================================================================
    const handleLoginSubmit = async (event) => {
        event.preventDefault(); // Prevent page refresh
        
        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }

        console.log('[Standalone Login] Starting standalone login flow for:', email);
        setLoading(true);
        setError('');
        setShowDiagnosisLink(false);

        try {
            // Try to get location (cached or fresh) - but don't block login if it fails
            let currentLocation = location;
            
            // If no cached location, try to get fresh location
            if (!currentLocation && geolocationSupported) {
                try {
                    currentLocation = await getCurrentLocation();
                    setLocation(currentLocation);
                } catch (locationErr) {
                    console.warn('Could not get location, proceeding without it:', locationErr.message);
                    // Don't block login if location fails - let backend handle geofencing
                }
            }

            // Build request body with location if available
            const requestBody = { email, password };
            if (currentLocation) {
                requestBody.latitude = currentLocation.latitude;
                requestBody.longitude = currentLocation.longitude;
            }

            // Call the POST /api/auth/login endpoint directly (standalone route)
            console.log('[Standalone Login] Calling POST /api/auth/login...');
            const response = await api.post('/auth/login', requestBody);
            
            const { user, token } = response.data;
            // Also handle new 'accessToken' field name
            const accessToken = response.data.accessToken || token;
            
            if (!user || !accessToken) {
                throw new Error('Invalid response from server');
            }

            console.log('[Standalone Login] ✅ Login successful via standalone route');

            // Phase 1: token goes into AuthContext memory only — no storage writes.
            // loginWithToken sets the axios header and calls /api/auth/me.
            await loginWithToken(accessToken);
            
            // Manually navigate after successful login
            // Role-based redirection
            if (email.toLowerCase().includes('admin')) {
                navigate('/admin/dashboard', { replace: true });
            } else {
                navigate('/dashboard', { replace: true });
            }

        } catch (err) {
            const errorData = err?.response?.data;
            if (errorData?.code === 'GEOFENCE_VIOLATION') {
                setError(`Access denied: You must be within office premises to log in. You are ${formatDistance(errorData.details.distance)} away from the nearest office.`);
            } else if (errorData?.code === 'LOCATION_REQUIRED') {
                setError('Location access is required to log in. Please enable location permissions.');
            } else if (errorData?.code === 'ACCOUNT_LOCKED') {
                setError(`Your account has been temporarily locked. You have been late 4 times this week. Please contact HR to unlock your account. Locked on: ${new Date(errorData.lockedAt).toLocaleString()}`);
            } else {
                setError(errorData?.error || 'Login failed. Please check your credentials.');
            }
            setLoading(false);
        }
    };

    const handleClickShowPassword = () => setShowPassword((show) => !show);
    const handleMouseDownPassword = (event) => {
        event.preventDefault();
    };

    return (
        <div className="login-page-container">
            {/* Left Column: Form */}
            <Box className="login-form-section">
                <Box className="login-form-wrapper">
                    <Box className="login-logo-container">
                        <img src="/favicon.ico" alt="Byline People Logo" className="login-logo-img" width="48" height="48" />
                        <Typography variant="h5" className="login-logo-text">
                            Byline People
                        </Typography>
                    </Box>

                    <Typography component="h1" className="login-title">
                        Welcome back
                    </Typography>
                    <Typography component="p" className="login-subtitle">
                        {loading ? 'Authenticating...' : 'Please enter your details'}
                    </Typography>

                    <Box component="form" onSubmit={handleLoginSubmit} className="login-form-box">
                        {error && (
                        <Alert severity="error" sx={{ width: '100%', mb: 1 }}>
                            {error}
                            {showDiagnosisLink && (
                                <Box sx={{ mt: 1 }}>
                                    <Link 
                                        href="/SSO_JWKS_DIAGNOSIS.md" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                                    >
                                        📖 View SSO JWKS Diagnosis Guide
                                    </Link>
                                </Box>
                            )}
                        </Alert>
                    )}
                        
                        {/* Show loading state for SSO authentication */}
                        {(loading || isProcessing) && (searchParams.get('sso_token') || searchParams.get('token')) && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
                                <SkeletonBox width="40px" height="40px" borderRadius="50%" />
                                <Typography variant="body2" color="text.secondary">
                                    Authenticating with SSO...
                                </Typography>
                            </Box>
                        )}
                        
                        {/* Location Status - Only show if location is not available */}
                        {geolocationSupported && !location && (
                            <Box sx={{ mb: 2, p: 1, border: '1px solid #e0e0e0', borderRadius: 1, backgroundColor: '#f5f5f5' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <LocationOff color="warning" sx={{ mr: 1 }} />
                                        <Box>
                                            <Typography variant="body2">
                                                Location not available
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#666', fontSize: '11px' }}>
                                                Enable once for permanent access on this device
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Button
                                        size="small"
                                        onClick={getLocation}
                                        disabled={locationLoading}
                                        startIcon={locationLoading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <LocationOn />}
                                    >
                                        {locationLoading ? 'Getting...' : 'Enable Location'}
                                    </Button>
                                </Box>
                                {locationError && (
                                    <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                                        {locationError}
                                    </Typography>
                                )}
                                {locationSuccess && (
                                    <Typography variant="caption" color="success" sx={{ mt: 1, display: 'block' }}>
                                        ✓ Location enabled permanently for this device
                                    </Typography>
                                )}
                            </Box>
                        )}

                        {/* Show form fields when:
                            1. No SSO token in URL (standard login), OR
                            2. SSO processing is not active
                        */}
                        {(!(searchParams.get('sso_token') || searchParams.get('token')) || (!loading && !isProcessing)) && (
                            <>
                        <TextField
                            label="Email address"
                            variant="outlined"
                            required
                            fullWidth
                            id="email"
                            name="email"
                            autoComplete="email"
                            autoFocus
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                        <TextField
                            label="Password"
                            variant="outlined"
                            type={showPassword ? 'text' : 'password'}
                            required
                            fullWidth
                            name="password"
                            id="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            aria-label="toggle password visibility"
                                            onClick={handleClickShowPassword}
                                            onMouseDown={handleMouseDownPassword}
                                            edge="end"
                                        >
                                            {showPassword ? <VisibilityOff /> : <Visibility />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Button
                            type="submit"
                            fullWidth
                            variant="contained"
                            disabled={loading}
                            className="login-button"
                        >
                            {loading ? 'Signing in...' : 'Sign in'}
                        </Button>
                            </>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Right Column: Illustration */}
            <Box className="login-image-section">
                {/* Textured Background */}
                <div className="textured-background"></div>
                
                {/* OPTIMIZATION: Use the <picture> element to serve modern image formats like WebP */}
                <picture>
                  <source srcSet="/backdrop.webp" type="image/webp" />
                  <img 
                    src="/backdrop.png" 
                    alt="Business illustration" 
                    className="login-illustration"
                    width="600" /* Provide intrinsic size to prevent layout shift */
                    height="450" /* Adjust height to match your image's aspect ratio */
                  />
                </picture>
            </Box>
        </div>
    );
};

export default LoginPage;