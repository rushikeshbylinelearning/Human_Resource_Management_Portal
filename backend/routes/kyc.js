// backend/routes/kyc.js
// KYC document routes.
//
// POST /kyc/upload — browser sends multipart/form-data to backend,
//   backend proxies bytes to B2 via AWS SDK.  No CORS / presigned-URL involved.
'use strict';

const express = require('express');
const router  = express.Router();
const authenticateToken         = require('../middleware/authenticateToken');
const uploadKycDocumentToR2     = require('../middleware/uploadKycDocumentToR2');
const ctrl                      = require('../controllers/kycController');

const isAdminOrHr = (req, res, next) => {
    if (!['Admin', 'HR'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access forbidden: requires Admin or HR role.' });
    }
    next();
};

// ─── Public catalogue ─────────────────────────────────────────────────────────
router.get('/types', authenticateToken, ctrl.getDocumentTypes);

// ─── Employee endpoints ───────────────────────────────────────────────────────
// Get my current KYC document statuses
router.get('/my-documents', authenticateToken, ctrl.getMyDocuments);

// ── NEW: single-request proxy upload (authenticated employees) ────────────────
// POST /api/kyc/upload
// Content-Type: multipart/form-data
// Fields:
//   file         — the file (PDF / JPEG / PNG, max 5 MB)
//   documentType — one of the VALID_TYPES keys (e.g. "aadhaar", "pan", ...)
router.post(
    '/upload',
    authenticateToken,
    uploadKycDocumentToR2({ context: 'authenticated' }),
    ctrl.uploadDocument
);

// ─── View / download ─────────────────────────────────────────────────────────
// Generates a short-lived presigned GET URL — employees see their own; admins see all
router.get('/view/:docId', authenticateToken, ctrl.viewDocument);

// ─── Admin / HR endpoints ─────────────────────────────────────────────────────
// All KYC records for a specific employee
router.get('/admin/employee/:employeeId', authenticateToken, isAdminOrHr, ctrl.getEmployeeDocuments);

// Paginated list across all employees
router.get('/admin/all', authenticateToken, isAdminOrHr, ctrl.getAllDocuments);

// Verify a document
router.post('/admin/verify/:docId', authenticateToken, isAdminOrHr, ctrl.verifyDocument);

// Reject a document (requires a reason in the body)
router.post('/admin/reject/:docId', authenticateToken, isAdminOrHr, ctrl.rejectDocument);

module.exports = router;
