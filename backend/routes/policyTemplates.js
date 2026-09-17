const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/policyTemplateController');
const authenticateToken = require('../middleware/authenticateToken');
const requireAdminOrHr = require('../middleware/requireAdminOrHr');
const uploadPolicyGridFS = require('../middleware/uploadPolicyGridFS');
const uploadTemplateImageGridFS = require('../middleware/uploadTemplateImageGridFS');

// Logging middleware for debugging
router.use((req, res, next) => {
  console.log(`[PolicyTemplates] ${req.method} ${req.originalUrl} - ID param: ${req.params.id || 'none'}`);
  next();
});

// List templates (admin view)
router.get('/', authenticateToken, requireAdminOrHr, ctrl.listTemplates);

// Get active template by name (public for employee view)
router.get('/active', authenticateToken, ctrl.getActiveTemplate);

// Upload a source PDF to GridFS for later extraction (no Policy doc created).
// This is the entry point the "Import from PDF" button in PolicyTemplateList
// calls before POST /policy-templates + POST /:id/extract-from-pdf.
router.post('/upload-source-pdf', authenticateToken, requireAdminOrHr, uploadPolicyGridFS, ctrl.uploadSourcePdf);

// Hero image for the consent wizard (must be registered before /:id)
router.post('/upload-hero-image', authenticateToken, requireAdminOrHr, uploadTemplateImageGridFS, ctrl.uploadHeroImage);
router.get('/hero-image/:fileId', ctrl.streamHeroImage);

// Get single template by ID
router.get('/:id', authenticateToken, ctrl.getTemplateById);

// Create new template
router.post('/', authenticateToken, requireAdminOrHr, ctrl.createTemplate);

// Extract from PDF
router.post('/:id/extract-from-pdf', authenticateToken, requireAdminOrHr, ctrl.extractFromPdf);

// Update template (partial)
router.patch('/:id', authenticateToken, requireAdminOrHr, ctrl.updateTemplate);

// Publish template
router.post('/:id/publish', authenticateToken, requireAdminOrHr, ctrl.publishTemplate);

module.exports = router;
