// backend/routes/onboarding.js
// Mounts onboarding endpoints onto /api/onboarding
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const requireAdminOrHr = require('../middleware/requireAdminOrHr');
const ctrl = require('../controllers/onboardingController');

// ── Employee endpoints (all require valid JWT) ────────────────────────────────
router.get('/status',                   authenticateToken, ctrl.getOnboardingStatus);
router.post('/first-login',             authenticateToken, ctrl.recordFirstLogin);
router.post('/policy/start-reading',    authenticateToken, ctrl.startReadingPolicy);
router.post('/policy/accept',           authenticateToken, ctrl.acceptPolicy);
router.post('/tour/complete',           authenticateToken, ctrl.completeTour);
router.post('/profile/complete',        authenticateToken, ctrl.completeProfile);

// ── Standalone Policy Acknowledgement (for existing employees) ────────────────
router.get('/pending-policies',               authenticateToken, ctrl.getPendingPolicies);
router.post('/policy/standalone-start-reading', authenticateToken, ctrl.standaloneStartReading);
router.post('/policy/standalone-accept',       authenticateToken, ctrl.standaloneAcceptPolicy);

// ── Admin endpoints ───────────────────────────────────────────────────────────
router.get('/admin/compliance',                    authenticateToken, requireAdminOrHr, ctrl.getComplianceDashboard);
router.get('/admin/compliance/export',             authenticateToken, requireAdminOrHr, ctrl.exportComplianceReport);
router.get('/admin/compliance/:userId/timeline',   authenticateToken, requireAdminOrHr, ctrl.getEmployeeTimeline);
router.get('/admin/control',                       authenticateToken, requireAdminOrHr, ctrl.getOnboardingControl);
router.put('/admin/control',                       authenticateToken, requireAdminOrHr, ctrl.updateOnboardingControl);
router.post('/admin/policy/:policyId/set-mandatory',   authenticateToken, requireAdminOrHr, ctrl.setMandatoryPolicy);
router.post('/admin/policy/:policyId/unset-mandatory', authenticateToken, requireAdminOrHr, ctrl.unsetMandatoryPolicy);
router.post('/admin/force/:userId',                authenticateToken, requireAdminOrHr, ctrl.forceOnboarding);
router.post('/admin/restart-onboarding',           authenticateToken, requireAdminOrHr, ctrl.restartOnboardingForUsers);
router.post('/admin/assign-tour',                  authenticateToken, requireAdminOrHr, ctrl.assignTourToUsers);

// ── Dynamic Policy Assignment (Admin/HR) ──────────────────────────────────────
router.post('/admin/assign-policy-to-users',  authenticateToken, requireAdminOrHr, ctrl.assignPolicyToUsers);
router.post('/admin/assign-policy-to-all',    authenticateToken, requireAdminOrHr, ctrl.assignPolicyToAll);
router.post('/admin/assign-template-to-users', authenticateToken, requireAdminOrHr, ctrl.assignTemplateToUsers);

module.exports = router;
