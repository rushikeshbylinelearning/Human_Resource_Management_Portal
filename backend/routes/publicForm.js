// backend/routes/publicForm.js
const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const publicFormController = require('../controllers/publicFormController');
const kycController        = require('../controllers/kycController');
const uploadKycDocumentToR2 = require('../middleware/uploadKycDocumentToR2');
const publicFormService    = require('../services/publicFormService');
const {
  profileSubmissionRules,
  validate,
  sanitizeProfileData,
  rateLimitConfig,
  validateRateLimitConfig,
  kycUploadLimiterConfig
} = require('../middleware/publicFormValidation');

// Strict limiter for form submission (10 req / 15 min)
const publicLimiter = rateLimit(rateLimitConfig);

// Relaxed limiter for token validation — users navigate the form multiple times (20 req / 15 min)
const validateLimiter = rateLimit(validateRateLimitConfig);

// Relaxed limiter for KYC document uploads (100 req / 15 min).
const kycUploadLimiter = rateLimit(kycUploadLimiterConfig);

// ─── Middleware: validate public-form token → attach req.employeeId ───────────
// Reuses exactly the same validation logic as publicFormService.validateToken,
// but does NOT mark the token as used — uploads happen before final submission.
//
// IMPORTANT: this middleware must run BEFORE uploadKycDocumentToR2 on the new
// upload route because busboy starts consuming the request stream on pipe; once
// piped, req.body fields are not available through express-json.  The token is
// therefore read from req.query OR from multipart form fields.
//
// For the /kyc/upload route: pass the token as a query-string parameter
//   POST /api/public/kyc/upload?token=<token>
// (req.query is populated before any middleware touches the body stream.)
// The link token only identifies the form. The employee is taken from the
// password session cookie, so a shared link cannot read or write anyone
// except the person who signed in.
const requireProfileFormSession = async (req, res, next) => {
  try {
    if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'Request blocked.' });
    }

    const token = req.query.token || req.body?.token;
    if (!token) {
      return res.status(401).json({ error: 'Sign in required.', requiresAuth: true });
    }

    const session = await publicFormService.employeeFromSession(req.cookies?.pf_session, token);
    if (!session) {
      return res.status(401).json({ error: 'Sign in required.', requiresAuth: true });
    }

    req.profileEmployee = session.employee;
    req.profileTokenDoc = session.tokenDoc;
    req.employeeId = session.employee._id.toString();
    next();
  } catch (err) {
    console.error('[PublicFormSession] Middleware error:', err);
    res.status(500).json({ error: 'Sign-in check failed.' });
  }
};

// ─── PUBLIC ROUTES (NO AUTH REQUIRED) ──────────────────────────────────────

/**
 * Validate token and get employee data
 * GET /api/public/validate?token=xxx
 */
router.get('/validate', validateLimiter, publicFormController.validateToken);

/**
 * Sign in with the employee's work email and password.
 * POST /api/public/unlock
 */
const unlockLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Please try again later.' },
});

router.post('/unlock', unlockLimiter, publicFormController.unlock);

/**
 * Submit profile data
 * POST /api/public/submit
 */
router.post(
  '/submit',
  publicLimiter,
  requireProfileFormSession,
  sanitizeProfileData,
  profileSubmissionRules,
  validate,
  publicFormController.submitProfile
);

// ─── KYC UPLOAD ROUTES — token-authenticated (no JWT required) ─────────────

/**
 * Get current KYC document statuses for the employee
 * GET /api/public/kyc/my-documents?token=xxx
 */
router.get('/kyc/my-documents', kycUploadLimiter, requireProfileFormSession, kycController.publicGetMyDocuments);

// ── NEW: single-request proxy upload (public token / onboarding form) ─────────
/**
 * Upload a KYC document — browser → backend → B2 (no CORS, no presigned URL).
 *
 * POST /api/public/kyc/upload?token=<token>
 * Content-Type: multipart/form-data
 * Fields:
 *   file         — the file (PDF / JPEG / PNG, max 5 MB)
 *   documentType — one of the VALID_TYPES keys
 *
 * The token MUST be supplied as a query parameter, not a form field, because
 * validatePublicFormToken runs before busboy starts consuming the body stream.
 */
router.post(
  '/kyc/upload',
  kycUploadLimiter,
  requireProfileFormSession,
  uploadKycDocumentToR2({ context: 'public' }),
    kycController.publicUploadDocument
);

module.exports = router;
