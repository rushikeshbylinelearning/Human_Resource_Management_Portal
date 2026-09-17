// backend/routes/publicForm.js
const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const publicFormController = require('../controllers/publicFormController');
const kycController        = require('../controllers/kycController');
const uploadKycDocumentToR2 = require('../middleware/uploadKycDocumentToR2');
const EmployeePublicToken  = require('../models/EmployeePublicToken');
const User                 = require('../models/User');
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
const validatePublicFormToken = async (req, res, next) => {
  try {
    // For multipart KYC uploads the token must be in the query string.
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'Token is required.' });
    }

    const tokenDoc = await EmployeePublicToken.findOne({ token });
    if (!tokenDoc) {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    if (new Date() > tokenDoc.expiresAt) {
      return res.status(401).json({ error: 'Token expired.', expired: true });
    }
    if (tokenDoc.isUsed && !tokenDoc.allowMultipleSubmissions) {
      return res.status(401).json({ error: 'Token already used.', alreadyUsed: true });
    }

    // Resolve employee — tokenDoc.employeeId stores the employeeCode string
    const employee = await User.findOne({ employeeCode: tokenDoc.employeeId }).select('_id').lean();
    if (!employee) {
      return res.status(401).json({ error: 'Employee not found.' });
    }

    // Attach the MongoDB ObjectId so KYC controller can use it directly
    req.employeeId = employee._id.toString();
    next();
  } catch (err) {
    console.error('[PublicFormToken] Middleware error:', err);
    res.status(500).json({ error: 'Token validation failed.' });
  }
};

// ─── PUBLIC ROUTES (NO AUTH REQUIRED) ──────────────────────────────────────

/**
 * Validate token and get employee data
 * GET /api/public/validate?token=xxx
 */
router.get('/validate', validateLimiter, publicFormController.validateToken);

/**
 * Submit profile data
 * POST /api/public/submit
 */
router.post(
  '/submit',
  publicLimiter,
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
router.get('/kyc/my-documents', kycUploadLimiter, validatePublicFormToken, kycController.publicGetMyDocuments);

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
  validatePublicFormToken,
  uploadKycDocumentToR2({ context: 'public' }),
    kycController.publicUploadDocument
);

module.exports = router;
