// backend/routes/settingsRoutes.js

const express = require('express');
const router = express.Router();
const Setting = require('../models/Setting');
const authenticateToken = require('../middleware/authenticateToken');
const isAdminOrHr = require('../middleware/requireAdminOrHr');
const cache = require('../utils/cache');
const User = require('../models/User');


// Admin-only middleware for RBAC-protected settings (e.g. enforce required logout toggle)
const isAdmin = (req, res, next) => {
    if (req.user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin role.' });
    }
    next();
};

const HR_EMAIL_KEY = 'hrNotificationEmails';
const HIRING_EMAIL_KEY = 'hiringNotificationEmails';
const YEAR_END_FEATURE_KEY = 'yearEndFeature';
// Feature toggle: disable Check-out until required logout time (shift end + excess paid break)
const ENFORCE_REQUIRED_LOGOUT_KEY = 'enforceRequiredLogoutBeforeCheckout';
// Feature toggle: require admin approval before early checkout is executed
const REQUIRE_ADMIN_APPROVAL_EARLY_CHECKOUT_KEY = 'requireAdminApprovalForEarlyCheckout';
const {
    isLeavesSectionEnabled,
    setLeavesSectionEnabled,
} = require('../utils/leavesSectionSetting');

// GET /api/admin/settings/hr-emails - Get the list of HR emails
router.get('/hr-emails', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: HR_EMAIL_KEY });
        res.json(setting ? setting.value : []); // Return emails array or empty array if not found
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching email settings.' });
    }
});

// POST /api/admin/settings/hr-emails - Add a new email to the list
router.post('/hr-emails', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: HR_EMAIL_KEY },
            // $addToSet adds the email only if it's not already in the array
            { $addToSet: { value: email } },
            // { upsert: true } creates the document if it doesn't exist
            // { new: true } returns the updated document
            { upsert: true, new: true }
        );
        res.json(updatedSetting.value);
    } catch (error) {
        res.status(500).json({ error: 'Server error adding email.' });
    }
});

// DELETE /api/admin/settings/hr-emails - Remove an email from the list
router.delete('/hr-emails', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: HR_EMAIL_KEY },
            // $pull removes the specified email from the array
            { $pull: { value: email } },
            { new: true }
        );
        res.json(updatedSetting ? updatedSetting.value : []);
    } catch (error) {
        res.status(500).json({ error: 'Server error deleting email.' });
    }
});

// GET /api/admin/settings/hiring-emails - Get the list of hiring emails
router.get('/hiring-emails', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: HIRING_EMAIL_KEY });
        res.json(setting ? setting.value : []); // Return emails array or empty array if not found
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching hiring email settings.' });
    }
});

// POST /api/admin/settings/hiring-emails - Add a new email to the hiring list
router.post('/hiring-emails', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: HIRING_EMAIL_KEY },
            // $addToSet adds the email only if it's not already in the array
            { $addToSet: { value: email } },
            // { upsert: true } creates the document if it doesn't exist
            // { new: true } returns the updated document
            { upsert: true, new: true }
        );
        res.json(updatedSetting.value);
    } catch (error) {
        res.status(500).json({ error: 'Server error adding hiring email.' });
    }
});

// DELETE /api/admin/settings/hiring-emails - Remove an email from the hiring list
router.delete('/hiring-emails', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: HIRING_EMAIL_KEY },
            // $pull removes the specified email from the array
            { $pull: { value: email } },
            { new: true }
        );
        res.json(updatedSetting ? updatedSetting.value : []);
    } catch (error) {
        res.status(500).json({ error: 'Server error deleting hiring email.' });
    }
});

// GET /api/admin/settings/year-end-feature - Get the year-end feature enabled status
router.get('/year-end-feature', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: YEAR_END_FEATURE_KEY });
        res.json({ enabled: setting ? setting.value : false }); // Return enabled status, default to false if not found
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching year-end feature setting.' });
    }
});

// POST /api/admin/settings/year-end-feature - Update the year-end feature enabled status
router.post('/year-end-feature', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Enabled must be a boolean value.' });
    }
    
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: YEAR_END_FEATURE_KEY },
            { value: enabled },
            { upsert: true, new: true }
        );
        res.json({ enabled: updatedSetting.value });
    } catch (error) {
        res.status(500).json({ error: 'Server error updating year-end feature setting.' });
    }
});

// GET /api/admin/settings/enforce-required-logout - Get "Enforce Required Logout Before Checkout" toggle (Admin only)
router.get('/enforce-required-logout', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: ENFORCE_REQUIRED_LOGOUT_KEY });
        res.json({ enabled: setting ? !!setting.value : false });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching enforce required logout setting.' });
    }
});

// POST /api/admin/settings/enforce-required-logout - Update toggle (hot-applied; no deploy/refresh required)
router.post('/enforce-required-logout', [authenticateToken, isAdmin], async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Enabled must be a boolean value.' });
    }
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: ENFORCE_REQUIRED_LOGOUT_KEY },
            { value: enabled },
            { upsert: true, new: true }
        );
        // Invalidate employee dashboard cache so next load gets fresh canCheckout (hot-applied)
        cache.deletePattern('employee_dashboard:*');
        res.json({ enabled: !!updatedSetting.value });
    } catch (error) {
        res.status(500).json({ error: 'Server error updating enforce required logout setting.' });
    }
});

// GET /api/admin/settings/require-admin-approval-early-checkout - Get "Require Admin Approval for Early Checkout" toggle (Admin only)
router.get('/require-admin-approval-early-checkout', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: REQUIRE_ADMIN_APPROVAL_EARLY_CHECKOUT_KEY });
        res.json({ enabled: setting ? !!setting.value : false });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching require admin approval for early checkout setting.' });
    }
});

// POST /api/admin/settings/require-admin-approval-early-checkout - Update toggle (hot-applied)
router.post('/require-admin-approval-early-checkout', [authenticateToken, isAdmin], async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Enabled must be a boolean value.' });
    }
    try {
        const updatedSetting = await Setting.findOneAndUpdate(
            { key: REQUIRE_ADMIN_APPROVAL_EARLY_CHECKOUT_KEY },
            { value: enabled },
            { upsert: true, new: true }
        );
        cache.deletePattern('employee_dashboard:*');
        res.json({ enabled: !!updatedSetting.value });
    } catch (error) {
        res.status(500).json({ error: 'Server error updating require admin approval for early checkout setting.' });
    }
});

// GET /api/admin/settings/leaves-section - whether employees/interns can see Leaves
router.get('/leaves-section', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const enabled = await isLeavesSectionEnabled();
        res.json({ enabled });
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching leave section setting.' });
    }
});

// POST /api/admin/settings/leaves-section - hide/show Leaves for employees and interns
router.post('/leaves-section', [authenticateToken, isAdmin], async (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Enabled must be a boolean value.' });
    }
    try {
        const nextValue = await setLeavesSectionEnabled(enabled);
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leaves_section_updated', {
                    enabled: nextValue,
                    timestamp: new Date().toISOString(),
                });
            }
        } catch (socketErr) {
            console.warn('[Settings] Could not broadcast leaves_section_updated:', socketErr.message);
        }
        res.json({ enabled: nextValue });
    } catch (error) {
        res.status(500).json({ error: 'Server error updating leave section setting.' });
    }
});


// --- Teams Attendance Notification (Power Automate Webhook) ---
const TEAMS_WEBHOOK_KEY = 'teamsAttendanceWebhookUrl';
const REPORT_CONFIG_KEY = 'teamsReportConfig';
const {
    sendMorningAttendanceReport,
    sendAfternoonAttendanceReport,
    sendEditedReport,
    getPreviewData,
    getStatusOverrides,
    saveStatusOverride,
    deleteStatusOverride,
    DEFAULT_CONFIG,
} = require('../services/teamsAttendanceNotificationService');

// GET /api/admin/settings/teams-webhook
router.get('/teams-webhook', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const [webhookSetting, configSetting] = await Promise.all([
            Setting.findOne({ key: TEAMS_WEBHOOK_KEY }),
            Setting.findOne({ key: REPORT_CONFIG_KEY }),
        ]);
        res.json({
            webhookUrl:   webhookSetting?.value  || '',
            reportConfig: configSetting?.value   || DEFAULT_CONFIG,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch Teams settings.' });
    }
});

// POST /api/admin/settings/teams-webhook  { webhookUrl }
router.post('/teams-webhook', [authenticateToken, isAdmin], async (req, res) => {
    const { webhookUrl } = req.body;
    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'A valid https:// webhook URL is required.' });
    }
    try {
        await Setting.findOneAndUpdate(
            { key: TEAMS_WEBHOOK_KEY },
            { value: webhookUrl.trim() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save webhook URL.' });
    }
});

// DELETE /api/admin/settings/teams-webhook
router.delete('/teams-webhook', [authenticateToken, isAdmin], async (req, res) => {
    try {
        await Setting.findOneAndDelete({ key: TEAMS_WEBHOOK_KEY });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove webhook URL.' });
    }
});

// POST /api/admin/settings/teams-report-config  { config }
router.post('/teams-report-config', [authenticateToken, isAdmin], async (req, res) => {
    const { config } = req.body;
    if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'config object is required.' });
    }
    try {
        const merged = { ...DEFAULT_CONFIG, ...config };
        await Setting.findOneAndUpdate(
            { key: REPORT_CONFIG_KEY },
            { value: merged },
            { upsert: true, new: true }
        );
        res.json({ success: true, config: merged });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save report config.' });
    }
});

// GET /api/admin/settings/teams-preview?scope=morning|afternoon|all
router.get('/teams-preview', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const scope = ['morning', 'afternoon', 'all'].includes(req.query.scope) ? req.query.scope : 'all';
        const previewData = await getPreviewData(scope);
        res.json(previewData);
    } catch (err) {
        console.error('[Settings] Teams preview error:', err);
        res.status(500).json({ error: 'Failed to build preview: ' + err.message });
    }
});

// POST /api/admin/settings/teams-webhook/send-edited — send (possibly edited) report
router.post('/teams-webhook/send-edited', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const { sections, config, todayStr, reportLabel } = req.body;
        if (!sections || !config) {
            return res.status(400).json({ error: 'sections and config are required.' });
        }
        await sendEditedReport(sections, config, todayStr, reportLabel || '');
        res.json({ success: true, message: 'Report sent to Teams channel.' });
    } catch (err) {
        console.error('[Settings] Teams send-edited error:', err);
        res.status(500).json({ error: 'Failed to send: ' + err.message });
    }
});

// ─── Status Override routes ────────────────────────────────────────────────────

// GET /api/admin/settings/teams-status-overrides?date=YYYY-MM-DD
router.get('/teams-status-overrides', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const overrides = await getStatusOverrides(req.query.date || null);
        res.json({ overrides });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch status overrides.' });
    }
});

// POST /api/admin/settings/teams-status-overrides — create/update override
// Body: { employeeId, employeeName, designation, date, status, reason }
router.post('/teams-status-overrides', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const { employeeId, employeeName, designation, date, status, reason } = req.body;
        if (!employeeId || !date || !status) {
            return res.status(400).json({ error: 'employeeId, date and status are required.' });
        }
        const validStatuses = ['absent', 'present', 'late', 'on_leave'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'status must be one of: ' + validStatuses.join(', ') });
        }
        const adminUser = await require('../models/User').findById(req.user.userId).select('fullName').lean();
        await saveStatusOverride({
            employeeId: employeeId.toString(),
            employeeName: employeeName || '',
            designation:  designation  || '',
            date,
            status,
            reason: reason || '',
            createdBy: adminUser?.fullName || 'Admin',
        });
        res.json({ success: true, message: 'Status override saved.' });
    } catch (err) {
        console.error('[Settings] Save status override error:', err);
        res.status(500).json({ error: 'Failed to save override: ' + err.message });
    }
});

// DELETE /api/admin/settings/teams-status-overrides?employeeId=X&date=YYYY-MM-DD
router.delete('/teams-status-overrides', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const { employeeId, date } = req.query;
        if (!employeeId || !date) return res.status(400).json({ error: 'employeeId and date are required.' });
        await deleteStatusOverride(employeeId, date);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete override.' });
    }
});

// POST /api/admin/settings/teams-webhook/test
router.post('/teams-webhook/test', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const setting = await Setting.findOne({ key: TEAMS_WEBHOOK_KEY });
        if (!setting?.value) {
            return res.status(400).json({ error: 'No webhook URL configured.' });
        }
        await Setting.findOneAndDelete({ key: 'teamsAttendanceLastSentDate' });
        await sendMorningAttendanceReport();
        res.json({ success: true, message: 'Test report sent to your Teams channel.' });
    } catch (err) {
        console.error('[Settings] Teams test error:', err);
        res.status(500).json({ error: 'Test failed: ' + err.message });
    }
});

// --- Upcoming Leaves Notification ---
const { getUpcomingLeaves, sendUpcomingLeavesReport } = require('../services/teamsUpcomingLeavesService');

// GET /api/admin/settings/teams-upcoming-leaves?weeks=2
router.get('/teams-upcoming-leaves', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const weeksAhead = parseInt(req.query.weeks) || 2;
        if (weeksAhead < 1 || weeksAhead > 8) {
            return res.status(400).json({ error: 'weeks must be between 1 and 8' });
        }
        const data = await getUpcomingLeaves(weeksAhead);
        res.json(data);
    } catch (err) {
        console.error('[Settings] Teams upcoming leaves error:', err);
        res.status(500).json({ error: 'Failed to fetch upcoming leaves: ' + err.message });
    }
});

// POST /api/admin/settings/teams-upcoming-leaves/send
router.post('/teams-upcoming-leaves/send', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const { employees, weeksAhead, startDate, endDate } = req.body;
        if (!employees || !weeksAhead || !startDate || !endDate) {
            return res.status(400).json({ error: 'employees, weeksAhead, startDate, and endDate are required.' });
        }
        await sendUpcomingLeavesReport(employees, weeksAhead, startDate, endDate);
        res.json({ success: true, message: 'Upcoming leaves report sent to Teams channel.' });
    } catch (err) {
        console.error('[Settings] Teams send upcoming leaves error:', err);
        res.status(500).json({ error: 'Failed to send: ' + err.message });
    }
});

// GET /api/admin/settings/teams-upcoming-leaves/employees
// Returns all active non-admin employees for the "add manually" dropdown
router.get('/teams-upcoming-leaves/employees', [authenticateToken, isAdmin], async (req, res) => {
    try {
        const employees = await User.find({ isActive: true, role: { $nin: ['Admin'] } })
            .select('_id fullName designation department')
            .sort({ fullName: 1 })
            .lean();
        res.json({ employees });
    } catch (err) {
        console.error('[Settings] Teams employee list error:', err);
        res.status(500).json({ error: 'Failed to fetch employees: ' + err.message });
    }
});

module.exports = router;
