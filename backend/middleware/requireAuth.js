// backend/middleware/requireAuth.js
/**
 * JWT-ONLY Authentication Middleware
 * 
 * This middleware enforces JWT-based authentication across the backend.
 * - NO SSO session support
 * - NO redirects (returns JSON only)
 * - Supports both cookie-based and header-based JWT tokens
 * - Production-safe with proper error handling
 */
const jwtUtils = require('../utils/jwtUtils');

function requireAuth(req, res, next) {
  try {
    // Prefer the Authorization header (live AMS access token from AuthContext).
    // Cookies may still hold a stale SSO/legacy JWT from another app on this host.
    // Using the cookie first verifies the wrong token, returns 401 INVALID_TOKEN,
    // and the frontend interceptor treats that as a session failure (logout).
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.split(' ')[1]
      : null;
    const token =
      bearer ||
      req.cookies?.token ||
      req.cookies?.ams_token;

    // No token found - return 401 JSON (never redirect)
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = jwtUtils.verify(token);
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId || decoded._id,
      _id: decoded.userId || decoded._id,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName || decoded.name
    };

    next();
  } catch (error) {
    // Token verification failed - return 401 JSON (never redirect)
    console.error('JWT verification failed:', error.message);
    
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
    });
  }
}

module.exports = requireAuth;
