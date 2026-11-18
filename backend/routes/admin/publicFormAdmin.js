// backend/routes/admin/publicFormAdmin.js
const express = require('express');
const router = express.Router();
const publicFormController = require('../../controllers/publicFormController');
const requireAuth = require('../../middleware/requireAuth');

// All routes require authentication
router.use(requireAuth);

/**
 * Generate token for employee
 * POST /api/admin/public-form/generate-link
 */
router.post('/generate-link', publicFormController.generateToken);

/**
 * One password-protected link for every employee.
 * POST /api/admin/public-form/generate-shared-link
 */
router.post('/generate-shared-link', publicFormController.generateSharedToken);

/**
 * Bulk generate tokens
 * POST /api/admin/public-form/bulk-generate
 */
router.post('/bulk-generate', publicFormController.bulkGenerateTokens);

/**
 * Get token status for employee
 * GET /api/admin/public-form/status/:employeeId
 */
router.get('/status/:employeeId', publicFormController.getTokenStatus);

/**
 * Get all pending submissions
 * GET /api/admin/public-form/pending
 */
router.get('/pending', publicFormController.getPendingSubmissions);

module.exports = router;
