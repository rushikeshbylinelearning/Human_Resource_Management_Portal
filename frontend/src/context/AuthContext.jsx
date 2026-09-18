// frontend/src/context/AuthContext.jsx
// Auth model (Phase 1):
//   Access token  → stored in memory ONLY (accessToken state below).
//                   AuthContext sets it on login/refresh and updates the
//                   axios Authorization header. On page refresh it's lost;
//                   /api/auth/me is called with the httpOnly refresh cookie
//                   to restore session.
//   Refresh token → httpOnly cookie set by the server; never accessible here.
//
// Proactive refresh: A timer fires ~2 minutes before access token expiry
// (13-minute mark for a 15-minute token) to silently refresh, eliminating
// the 401-interrupt UX for normal active sessions.
import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../api/axios';
import { refreshAccessToken } from '../api/authRefresh';
import { Box, Snackbar, Alert } from '@mui/material';
import socket from '../socket';

const AuthContext = createContext(null);

// Shared across StrictMode re-runs so /api/auth/me is only called once per page load
let authBootstrapPromise = null;

// Auth status states: 'unknown' | 'authenticated' | 'unauthenticated'
// 'unknown' = auth check in progress, UI should render with skeletons
// 'authenticated' = user is authenticated (from backend confirmation)
// 'unauthenticated' = user is not authenticated (from backend confirmation)
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authStatus, setAuthStatus] = useState('unknown');
    const [permissionNotification, setPermissionNotification] = useState({ open: false, message: '' });
    // Access token is held in memory only — never written to storage.
    const [accessToken, setAccessToken] = useState(null);
    // Timer ref for the proactive refresh scheduled before token expiry.
    const proactiveRefreshTimerRef = useRef(null);

    // ─── Proactive refresh helpers ──────────────────────────────────────────────
    // executeProactiveRefresh and scheduleProactiveRefresh call each other
    // (schedule → setTimeout → execute → schedule on success).
    // We break the circular useCallback dependency by storing each function
    // in a ref so the other can call the latest version without needing it
    // listed as a dep.
    const executeProactiveRefreshRef = useRef(null);
    const scheduleProactiveRefreshRef = useRef(null);

    const scheduleProactiveRefresh = useCallback((token) => {
        // Clear any existing timer first
        if (proactiveRefreshTimerRef.current) {
            clearTimeout(proactiveRefreshTimerRef.current);
            proactiveRefreshTimerRef.current = null;
        }

        if (!token) return;

        let decoded;
        try {
            decoded = jwtDecode(token);
        } catch {
            return; // Non-JWT or malformed — reactive path will handle it
        }

        if (!decoded?.exp) return;

        const expiresAtMs = decoded.exp * 1000;
        const refreshAtMs = expiresAtMs - 2 * 60 * 1000; // 2 minutes before expiry
        const delayMs = refreshAtMs - Date.now();

        if (delayMs <= 0) {
            // Token is already at or past the refresh window — trigger immediately
            executeProactiveRefreshRef.current?.(0);
            return;
        }

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[AuthContext] Proactive refresh scheduled in ${Math.round(delayMs / 1000)}s`);
        }

        proactiveRefreshTimerRef.current = setTimeout(
            () => executeProactiveRefreshRef.current?.(0),
            delayMs
        );
    }, []); // stable — reads timer ref and calls executeProactiveRefreshRef by ref

    // Keep the ref in sync with the latest stable function
    scheduleProactiveRefreshRef.current = scheduleProactiveRefresh;

    const executeProactiveRefresh = useCallback(async (attempt) => {
        const MAX_ATTEMPTS = 3;
        const RETRY_DELAY_MS = 30 * 1000;

        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[AuthContext] Proactive refresh attempt ${attempt + 1}`);
            }
            // withCredentials is set on the api instance — httpOnly cookie sent automatically
            const newToken = await refreshAccessToken();
            if (!newToken) throw new Error('No accessToken in refresh response');

            // Store new token in memory and update axios header
            setAccessToken(newToken);
            api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

            // Schedule the next proactive refresh using the ref to avoid stale closure
            scheduleProactiveRefreshRef.current?.(newToken);

            if (process.env.NODE_ENV !== 'production') {
                console.log('[AuthContext] ✅ Proactive refresh succeeded');
            }
        } catch (err) {
            const isAuthError = err?.response?.data?.code === 'REFRESH_INVALID' ||
                                err?.response?.status === 401;

            if (isAuthError) {
                // Server rejected the refresh — full logout (handled by axios interceptor)
                console.warn('[AuthContext] Proactive refresh got auth error — reactive path will handle logout');
                return;
            }

            // Network / transient error: retry up to MAX_ATTEMPTS
            if (attempt < MAX_ATTEMPTS - 1) {
                console.warn(`[AuthContext] Proactive refresh network error (attempt ${attempt + 1}) — retrying in 30s`);
                proactiveRefreshTimerRef.current = setTimeout(
                    () => executeProactiveRefreshRef.current?.(attempt + 1),
                    RETRY_DELAY_MS
                );
            } else {
                console.warn('[AuthContext] Proactive refresh exhausted retries — reactive 401 path active');
                // No further action: the axios interceptor will handle the next 401
            }
        }
    }, []); // stable — all mutable state accessed via refs or setters

    // Keep the ref in sync
    executeProactiveRefreshRef.current = executeProactiveRefresh;
    // ────────────────────────────────────────────────────────────────────────────

    const logout = useCallback(async () => {
        console.log('[AuthContext] Logging out user.');
        const authMethod = user?.authMethod;
        const ssoPortalUrl = import.meta.env.VITE_SSO_PORTAL_URL || 
                            (import.meta.env.DEV ? 'http://localhost:3000' : 'https://sso.bylinelms.com');
        
        // Cancel any pending proactive refresh
        if (proactiveRefreshTimerRef.current) {
            clearTimeout(proactiveRefreshTimerRef.current);
            proactiveRefreshTimerRef.current = null;
        }

        // Revoke the refresh token server-side (best-effort; httpOnly cookie sent automatically)
        try {
            await api.post('/auth/logout');
        } catch (_) {
            // Silently ignore — we always clear client state regardless
        }

        // Clear in-memory access token and axios header
        setAccessToken(null);
        delete api.defaults.headers.common['Authorization'];

        // Clear any legacy storage keys (pre-Phase-1 transition cleanup)
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('sso_processed_token');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('ams_token');
        localStorage.removeItem('token');
        localStorage.removeItem('sso_processed_token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('ams_token');
        
        // Clear user state
        setUser(null);
        setIsAuthenticated(false);
        setAuthStatus('unauthenticated');
        authInitializedRef.current = false;
        authBootstrapPromise = null;
        
        // Disconnect socket if connected
        if (socket && socket.connected) {
            socket.disconnect();
        }
        
        // If user came via SSO, redirect to SSO login page
        if (authMethod === 'SSO') {
            console.log('[AuthContext] User logged in via SSO - redirecting to SSO portal');
            window.location.href = `${ssoPortalUrl}/login`;
        } else if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }, [user?.authMethod]);

    // Guard to prevent duplicate /api/auth/me calls
    const authInitializedRef = React.useRef(false);

    const initializeAuth = useCallback(async () => {
        if (authBootstrapPromise) {
            return authBootstrapPromise;
        }

        authBootstrapPromise = (async () => {
        setAuthStatus('unknown');
        authInitializedRef.current = true;
        window.__AUTH_RESTORING__ = true;

        // Phase 1: Access token is held in memory only.
        // On page load the in-memory token is gone; we attempt a silent refresh
        // via the httpOnly refresh cookie, then fall back to /api/auth/me.
        //
        // Transition path: if a legacy token is still in sessionStorage/localStorage
        // (from before Phase 1), use it to call /api/auth/me so the user isn't
        // immediately logged out. This will be phased out once all sessions have
        // naturally rotated to the new cookie-based model.
        const legacyToken = sessionStorage.getItem('ams_token') || sessionStorage.getItem('token') ||
                            localStorage.getItem('ams_token') || localStorage.getItem('token');

        console.log('[AuthContext] Initializing auth (non-blocking)...');

        // ── Try silent refresh first (fast path for users with valid refresh cookies) ──
        try {
            const newToken = await refreshAccessToken();

            if (newToken) {
                setAccessToken(newToken);
                api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

                // Verify with /api/auth/me to get full user object
                const meResponse = await api.get('/auth/me');
                console.log('[AuthContext] ✅ Session restored via silent refresh');

                setUser(meResponse.data);
                setIsAuthenticated(true);
                setAuthStatus('authenticated');

                // Schedule proactive refresh before expiry
                scheduleProactiveRefresh(newToken);

                return;
            }
        } catch (refreshErr) {
            // Refresh failed — fall through to legacy token path or unauthenticated
            if (process.env.NODE_ENV !== 'production') {
                console.log('[AuthContext] Silent refresh failed:', refreshErr?.response?.data?.code || refreshErr.message);
            }
        }

        // ── Legacy token path (transition period only) ────────────────────────
        if (legacyToken) {
            try {
                api.defaults.headers.common['Authorization'] = `Bearer ${legacyToken}`;

                console.log('[AuthContext] Attempting auth restore from legacy storage token...');
                const response = await api.get('/auth/me');
                console.log('[AuthContext] ✅ /api/auth/me successful via legacy token');

                // Treat the legacy token as the access token in memory
                setAccessToken(legacyToken);
                setUser(response.data);
                setIsAuthenticated(true);
                setAuthStatus('authenticated');

                // Schedule proactive refresh; the legacy token may expire sooner
                // (old 7d tokens will just get a 401 once they expire — reactive path handles it)
                scheduleProactiveRefresh(legacyToken);
            } catch (error) {
                console.error('[AuthContext] Legacy token auth failed:', error?.response?.data || error.message);

                if (error.response?.status === 401) {
                    delete api.defaults.headers.common['Authorization'];
                    // Clear legacy keys
                    sessionStorage.removeItem('token');
                    sessionStorage.removeItem('ams_token');
                    localStorage.removeItem('token');
                    localStorage.removeItem('ams_token');
                    setUser(null);
                    setIsAuthenticated(false);
                    setAuthStatus('unauthenticated');
                } else {
                    // Network error — keep unknown so user can retry
                    setUser(null);
                    setIsAuthenticated(false);
                    setAuthStatus('unknown');
                }
            }
            return;
        }

        // ── No valid session ──────────────────────────────────────────────────
        console.log('[AuthContext] No valid session found');
        setUser(null);
        setIsAuthenticated(false);
        setAuthStatus('unauthenticated');
        })().finally(() => {
            window.__AUTH_RESTORING__ = false;
        });

        return authBootstrapPromise;
    }, [logout, scheduleProactiveRefresh]);

    const loginWithToken = useCallback(async (token) => {
        try {
            console.log('[AuthContext] Logging in with token:', token ? token.substring(0, 20) + '...' : 'null');
            
            // Store in memory + axios header; legacy storage cleared on logout
            setAccessToken(token);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            
            // Verify token with /api/auth/me
            console.log('[AuthContext] Verifying token via /api/auth/me (backend is source of truth)...');
            const response = await api.get('/auth/me');
            console.log('[AuthContext] ✅ Token verified, user authenticated');
            
            // Backend confirmed authentication - update state
            setUser(response.data);
            setIsAuthenticated(true);
            setAuthStatus('authenticated');

            // Schedule proactive refresh
            scheduleProactiveRefresh(token);
            
            console.log('[AuthContext] Token login successful for user:', response.data.email || response.data.user?.email);
            return response.data;
        } catch (error) {
            console.error('[AuthContext] Token login failed:', error);
            console.error('[AuthContext] Error details:', error.response?.data || error.message);
            
            // Backend rejected token - user is unauthenticated
            setAuthStatus('unauthenticated');
            logout();
            throw error;
        }
    }, [logout, scheduleProactiveRefresh]);

    useEffect(() => {
        initializeAuth();

        // Listen for auth errors dispatched by the axios interceptor
        const handleAuthError = () => {
            if (window.__AUTH_RESTORING__ === true) return;
            logout();
        };
        window.addEventListener('auth-error', handleAuthError);

        // Listen for token refreshes that happened reactively inside the axios interceptor
        // (concurrent 401s resolved by the interceptor's queue). Update our in-memory
        // token and re-schedule the proactive refresh timer accordingly.
        const handleTokenRefreshed = (event) => {
            const newToken = event.detail?.accessToken;
            if (newToken) {
                setAccessToken(newToken);
                api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
                scheduleProactiveRefresh(newToken);
            }
        };
        window.addEventListener('auth-token-refreshed', handleTokenRefreshed);

        return () => {
            window.removeEventListener('auth-error', handleAuthError);
            window.removeEventListener('auth-token-refreshed', handleTokenRefreshed);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const updateUserContext = useCallback((newUserData) => {
        setUser((currentUser) => {
            if (!currentUser) return null;
            return { ...currentUser, ...newUserData };
        });
    }, []);

    const refreshUserData = useCallback(async () => {
        try {
            // Backend is source of truth - call /api/auth/me
            const response = await api.get('/auth/me');
            
            // Backend confirmed authentication - update state
            setUser(response.data);
            setIsAuthenticated(true);
            setAuthStatus('authenticated');
            return response.data;
        } catch (error) {
            console.error('Failed to refresh user data:', error);
            
            // Backend rejected - user is unauthenticated
            if (error.response?.status === 401) {
                setAuthStatus('unauthenticated');
            }
            logout();
            throw error;
        }
    }, [logout]);

    // Socket connection and permission update listener
    // CRITICAL: Only connect when authStatus === 'authenticated' (backend confirmed)
    // Do NOT reconnect on user object reference changes - use authStatus as stable dependency
    useEffect(() => {
        // Only connect when backend has confirmed authentication
        if (authStatus !== 'authenticated' || !user || !accessToken) {
            return;
        }
        
        // Connect socket - use the in-memory access token
        const connectSocket = async () => {
            try {
                // Import socket connection helper (dynamic import for React)
                const socketModule = await import('../socket');
                const { connectSocketWithToken } = socketModule;
                
                // Connect socket with the in-memory access token
                connectSocketWithToken(accessToken);
                console.log('[AuthContext] Socket.io connection initiated (authStatus confirmed by backend)');
            } catch (error) {
                console.error('[AuthContext] Failed to connect socket:', error);
            }
        };

        // Connect socket immediately (authStatus already confirmed authentication)
        connectSocket();
        
        // Reconnect socket when page becomes visible (handles idle timeouts)
        const handleVisibilityChange = async () => {
            if (!document.hidden && authStatus === 'authenticated' && user && accessToken) {
                const socketModule = await import('../socket');
                const socket = socketModule.default;
                
                // If socket is disconnected, reconnect with current in-memory token
                if (socket.disconnected) {
                    console.log('[AuthContext] Page became visible, reconnecting socket...');
                    const { connectSocketWithToken } = socketModule;
                    connectSocketWithToken(accessToken);
                } else if (socket.connected && socket.auth?.token !== accessToken) {
                    // Update socket auth if the token changed (e.g., after refresh)
                    console.log('[AuthContext] Token updated, updating socket auth...');
                    socket.auth = { token: accessToken };
                }
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Listen for permission updates
        const handlePermissionUpdate = (data) => {
            setPermissionNotification({
                open: true,
                message: data.message
            });
            // Notify dashboard to refetch so "Today's Shift" / half-day status updates immediately
            window.dispatchEvent(new CustomEvent('dashboard-refresh-requested'));
            // Refresh user data after a short delay
            setTimeout(() => {
                refreshUserData().catch(console.error);
            }, 2000);
        };

        // Listen for employment status updates
        const handleEmploymentStatusUpdate = (data) => {
            // Only refresh if this update is for the current user
            if (data.userId === user._id || data.userId === user.id) {
                setPermissionNotification({
                    open: true,
                    message: data.message
                });
                
                // Refresh user data immediately to update employment status
                refreshUserData().catch(console.error);
            }
        };

        // Listen for user profile updates (e.g., Saturday policy changes)
        const handleUserProfileUpdate = (data) => {
            // Only refresh if this update is for the current user
            if (data.userId === user._id || data.userId === user.id) {
                if (data.field === 'alternateSaturdayPolicy') {
                    setPermissionNotification({
                        open: true,
                        message: data.message || `Your Saturday policy has been updated to: ${data.newValue}`
                    });
                    
                    // Refresh user data immediately to update Saturday policy
                    refreshUserData().catch(console.error);
                }
            }
        };

        const handleLeavesSectionUpdate = (data) => {
            setUser((prev) => {
                if (!prev) return prev;
                return { ...prev, leavesSectionEnabled: data?.enabled !== false };
            });
            if (data?.enabled) {
                refreshUserData().catch(console.error);
            }
        };

        socket.on('permissions_updated', handlePermissionUpdate);
        socket.on('employment_status_updated', handleEmploymentStatusUpdate);
        socket.on('user_profile_updated', handleUserProfileUpdate);
        socket.on('leaves_section_updated', handleLeavesSectionUpdate);

        return () => {
            socket.off('permissions_updated', handlePermissionUpdate);
            socket.off('employment_status_updated', handleEmploymentStatusUpdate);
            socket.off('user_profile_updated', handleUserProfileUpdate);
            socket.off('leaves_section_updated', handleLeavesSectionUpdate);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            // Don't disconnect socket here - let it handle reconnection automatically
        };
    }, [authStatus, user?._id, user?.id, accessToken, refreshUserData]); // Use authStatus, user IDs, and accessToken (all stable)

    const login = useCallback(async (email, password, location = null) => {
        const loginData = { email, password };
        if (location) {
            loginData.latitude = location.latitude;
            loginData.longitude = location.longitude;
        }
        
        const response = await api.post('/auth/login', loginData);
        // Support both new 'accessToken' and legacy 'token' field names
        const token = response.data.accessToken || response.data.token;
        const userData = response.data.user;
        
        // Store in memory only — NO sessionStorage / localStorage writes
        setAccessToken(token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Backend confirmed authentication via login response
        setUser(userData);
        setIsAuthenticated(true);
        setAuthStatus('authenticated');

        // Schedule proactive refresh before the 15-min token expires
        scheduleProactiveRefresh(token);

        return userData;
    }, [scheduleProactiveRefresh]);

    const loginWithSSO = useCallback(async (userData, token) => {
        // Store in memory only — NO sessionStorage / localStorage writes
        setAccessToken(token);
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Backend confirmed authentication via SSO login response
        setUser(userData);
        setIsAuthenticated(true);
        setAuthStatus('authenticated');

        // Schedule proactive refresh
        scheduleProactiveRefresh(token);

        return userData;
    }, [scheduleProactiveRefresh]);

    const value = useMemo(() => ({
        user,
        // Expose the in-memory access token for consumers that need it directly
        // (e.g., legacy components that read context.token). No storage reads.
        token: accessToken,
        isAuthenticated,
        authStatus,
        loading: authStatus === 'unknown', // kept for backward compatibility
        login,
        loginWithSSO,
        loginWithToken,
        logout,
        updateUserContext,
        refreshUserData,
    }), [user, accessToken, isAuthenticated, authStatus, login, loginWithSSO, loginWithToken, logout, updateUserContext, refreshUserData]);

    // NON-BLOCKING: Always render children immediately
    // authStatus === 'unknown' does NOT block UI - components handle it with skeletons
    // Backend remains source of truth - we update authStatus based on /api/auth/me response
    return (
        <>
            <AuthContext.Provider value={value}>
                {children}
            </AuthContext.Provider>
            
            {/* Permission Update Notification */}
            <Snackbar
                open={permissionNotification.open}
                autoHideDuration={6000}
                onClose={() => setPermissionNotification({ open: false, message: '' })}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert 
                    onClose={() => setPermissionNotification({ open: false, message: '' })}
                    severity="info"
                    sx={{ width: '100%' }}
                >
                    {String(permissionNotification.message || '')}
                </Alert>
            </Snackbar>
        </>
    );
};

export const useAuth = () => useContext(AuthContext);