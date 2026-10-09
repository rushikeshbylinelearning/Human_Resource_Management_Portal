// frontend/src/api/axios.js
//
// Auth model (Phase 1):
//   Access token  → held in AuthContext memory state + axios default header.
//                   NOT stored in sessionStorage or localStorage.
//   Refresh token → httpOnly cookie set by the server; never readable here.
//
// 401 handling:
//   On code TOKEN_EXPIRED  → attempt silent refresh via POST /auth/refresh
//                            (browser sends the httpOnly cookie automatically).
//                            Queue concurrent 401s so only one refresh fires.
//   On code REFRESH_INVALID / refresh itself fails → full logout via auth-error event.
//
// The legacy sessionStorage / localStorage token reads below are kept during the
// rollout transition; they will be removed once all clients have refreshed and
// AuthContext fully drives the header.

import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBaseUrl';
import { refreshAccessToken, isAuthBootstrapInProgress } from './authRefresh';

const authErrorEvent = new Event('auth-error');

// ─── Base URL ────────────────────────────────────────────────────────────────
const baseURL = getApiBaseUrl();

const api = axios.create({
  baseURL,
  withCredentials: true, // Required: sends the httpOnly refreshToken cookie
  headers: { 'Content-Type': 'application/json' },
});

// ─── Token restore (transition period) ──────────────────────────────────────
// During the rollout window some clients may still have a token in sessionStorage
// from before Phase 1. Restore it once so they aren't immediately logged out.
// Once AuthContext sets the in-memory access token this header is overwritten.
const restoreToken = () => {
  const tokenToUse = sessionStorage.getItem('ams_token') || sessionStorage.getItem('token');
  if (tokenToUse) {
    api.defaults.headers.common['Authorization'] = `Bearer ${tokenToUse}`;
  }
};
restoreToken();

// ─── Request interceptor ─────────────────────────────────────────────────────
// Cache-bust exemption list: endpoints whose freshness is managed server-side
// (NodeCache / ETags). Adding ?_t= to these defeats browser and CDN caching.
const CACHE_BUST_EXEMPT_PATTERNS = [
  '/auth/me',
  '/leaves',
  '/admin/leaves',
  '/admin/dashboard',
  '/attendance/dashboard',
  '/attendance/status',
  '/attendance/summary',
  '/probation/tracker',
  '/announcements',
  '/analytics',
  '/holidays',
  '/admin/settings',
  '/new-notifications',
];

api.interceptors.request.use(
  (config) => {
    // Add cache-buster only where strictly needed
    const isGet = config.method?.toUpperCase() === 'GET';
    const url = config.url || '';
    const isExempt = CACHE_BUST_EXEMPT_PATTERNS.some((pattern) => url.includes(pattern));

    if (isGet && !config.params?._t && !isExempt) {
      config.params = { ...config.params, _t: Date.now() };
    }

    // FormData must not inherit application/json. The runtime sets the boundary.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers) {
        if (typeof config.headers.delete === 'function') {
          config.headers.delete('Content-Type');
        } else {
          delete config.headers['Content-Type'];
          delete config.headers['content-type'];
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response interceptor ─────────────────────────────────────────────────────
let isRefreshing = false;
let refreshSubscribers = [];
let isLoggingOut = false;

// Queue a callback to be called once the in-flight refresh resolves.
const onTokenRefreshed = (callback) => refreshSubscribers.push(callback);

// Drain the queue — call each subscriber with the new token (or the error).
const processQueue = (error, token = null) => {
  refreshSubscribers.forEach((cb) => cb(error, token));
  refreshSubscribers = [];
};

const isAuthEndpoint = (url = '') => url.includes('/auth/refresh') || url.includes('/auth/me');

/**
 * Trigger a clean logout: clear the in-memory header, clear legacy storage
 * keys, and dispatch the auth-error event so AuthContext calls its logout().
 */
const triggerLogout = () => {
  if (isLoggingOut) return;
  isLoggingOut = true;

  // Clear the Authorization header
  delete api.defaults.headers.common['Authorization'];

  // Clear legacy storage keys (transition: was used pre-Phase-1)
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('ams_token');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('sso_processed_token');

  window.dispatchEvent(authErrorEvent);

  setTimeout(() => {
    if (
      window.location.pathname !== '/login' &&
      window.location.pathname !== '/public-form'
    ) {
      window.location.href = '/login';
    }
  }, 100);
};

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // Only intercept 401s outside of the login/public pages
    if (
      error.response?.status !== 401 ||
      window.location.pathname === '/login' ||
      window.location.pathname === '/public-form' ||
      isLoggingOut
    ) {
      return Promise.reject(error);
    }

    // Never intercept auth bootstrap endpoints — AuthContext owns session restore.
    if (isAuthEndpoint(originalRequest.url)) {
      return Promise.reject(error);
    }

    // During initial auth restoration, let 401s propagate so AuthContext can
    // resolve to authenticated/unauthenticated without forcing a logout redirect.
    if (isAuthBootstrapInProgress()) {
      return Promise.reject(error);
    }

    const errorCode = error.response?.data?.code;

    // If the refresh itself came back with REFRESH_INVALID → full logout
    if (errorCode === 'REFRESH_INVALID' || originalRequest._retryFailed) {
      processQueue(error, null);
      triggerLogout();
      return Promise.reject(error);
    }

    // Prevent retrying the same request more than once
    if (originalRequest._retry) {
      processQueue(error, null);
      triggerLogout();
      return Promise.reject(error);
    }

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        onTokenRefreshed((err, token) => {
          if (err) return reject(err);
          originalRequest.headers.Authorization = `Bearer ${token}`;
          resolve(api(originalRequest));
        });
      });
    }

    // Start a refresh attempt
    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const newAccessToken = await refreshAccessToken();

      // Update the default header for all subsequent requests
      api.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;

      // Notify AuthContext of the new token via a custom event so it can
      // schedule the next proactive refresh timer.
      window.dispatchEvent(
        new CustomEvent('auth-token-refreshed', { detail: { accessToken: newAccessToken } })
      );

      // Drain the queue and retry the original request
      processQueue(null, newAccessToken);
      isRefreshing = false;
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);

    } catch (refreshError) {
      isRefreshing = false;
      originalRequest._retryFailed = true;
      processQueue(refreshError, null);
      triggerLogout();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
