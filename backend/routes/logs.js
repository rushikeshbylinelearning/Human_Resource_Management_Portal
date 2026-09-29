// backend/routes/logs.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const requireOperationalLogAccess = require('../middleware/requireOperationalLogAccess');
const { getHRLogs, getITLogs, getActivityLogs } = require('../controllers/logsController');

/**
 * GET /api/logs/hr
 * HR-related audit logs
 * Categories: leave, attendance, employee, hr_query, system, policy
 * Requires: Admin or HR role
 */
router.get('/hr', [authenticateToken, requireOperationalLogAccess], getHRLogs);

/**
 * GET /api/logs/it
 * IT-related audit logs
 * Categories: it_support and all IT ticket types
 * Requires: Admin or HR role (for audit purposes)
 */
router.get('/it', [authenticateToken, requireOperationalLogAccess], getITLogs);

/**
 * GET /api/logs/activity
 * General activity logs (excluding HR and IT specific logs)
 * This is the existing activity log functionality
 * Requires: Admin or HR role
 */
router.get('/activity', [authenticateToken, requireOperationalLogAccess], getActivityLogs);

module.exports = router;
