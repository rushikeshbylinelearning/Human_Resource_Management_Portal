// backend/routes/admin/requests.js
// Extra-break status and early-checkout approval (admin/HR).
// Mounted at /api/admin via routes/admin/index.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const authenticateToken = require('../../middleware/authenticateToken');
const isAdminOrHr = require('../../middleware/requireAdminOrHr');

const User = require('../../models/User');
const ExtraBreakRequest = require('../../models/ExtraBreakRequest');
const EarlyCheckoutRequest = require('../../models/EarlyCheckoutRequest');
const AttendanceLog = require('../../models/AttendanceLog');
const earlyCheckoutService = require('../../services/earlyCheckoutService');
const NewNotificationService = require('../../services/NewNotificationService');
const { getTodayISTKey } = require('../../utils/istTime');

// --- EXTRA BREAK & HOLIDAY ROUTES ---

router.patch('/breaks/extra/:requestId/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { requestId } = req.params;
    const { status } = req.body;
    const adminUserId = req.user.userId;

    if (!['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }

    try {
        const request = await ExtraBreakRequest.findById(requestId);
        if (!request) return res.status(404).json({ error: 'Extra break request not found.' });
        if (request.status !== 'Pending') return res.status(400).json({ error: 'This request has already been actioned.' });

        request.status = status;
        request.reviewedBy = adminUserId;
        request.reviewedAt = new Date();
        await request.save();

        // Invalidate dashboard cache to update recent activity
        const cacheService = require('../../services/cacheService');
        const today = getTodayISTKey();
        cacheService.invalidateDashboard(today);

        const user = await User.findById(request.user);
        if (user) {
            const message = status === 'Approved'
                ? 'Your request for an extra break has been approved. You can now start it from the break menu.'
                : `Your request for an extra break for reason "${request.reason}" has been rejected.`;

            const actionData = status === 'Approved' ? {
                actionType: 'start_break',
                requiresAction: true,
                actionParams: { breakType: 'extra', reason: request.reason }
            } : {
                actionType: 'none',
                requiresAction: false
            };

            NewNotificationService.createAndEmitNotification({
                message: message,
                type: status === 'Approved' ? 'extra_break_approval' : 'extra_break_rejection',
                userId: request.user,
                userName: user.fullName,
                recipientType: 'user',
                category: 'break',
                priority: 'high',
                actionData,
                navigationData: { page: 'attendance' }
            }).catch(err => console.error('Error sending extra break response notification:', err));
        }

        res.json({ message: `Break request has been ${status.toLowerCase()}.` });

    } catch (error) {
        console.error('Error actioning extra break request:', error);
        res.status(500).json({ error: 'Failed to update request.' });
    }
});

// --- EARLY CHECKOUT REQUESTS (Admin approval workflow) ---

// GET /api/admin/early-checkout-requests/:id - Lightweight ECR details only (for approval modal; no full attendance/employee)
router.get('/early-checkout-requests/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }
    try {
        const doc = await EarlyCheckoutRequest.findById(id)
            .populate('employee', 'fullName _id')
            .populate('attendanceLog', 'attendanceDate clockInTime')
            .lean();
        if (!doc) return res.status(404).json({ error: 'Request not found.' });
        const employee = doc.employee;
        const log = doc.attendanceLog;
        
        // Calculate completed time: time worked from clock-in to request time (in seconds for precision)
        let completedTimeSeconds = null;
        if (log?.clockInTime && doc.requestedAt) {
            const clockInTime = new Date(log.clockInTime);
            const requestTime = new Date(doc.requestedAt);
            const elapsedMs = requestTime - clockInTime;
            completedTimeSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        }
        
        res.json({
            reference_id: doc._id.toString(),
            employee_id: employee?._id?.toString(),
            employee_name: employee?.fullName ?? '—',
            date: log?.attendanceDate ?? null,
            request_time: doc.requestedAt,
            required_logout_time: doc.requiredLogoutTime,
            remaining_time: doc.remainingTimeMinutes,
            completed_time_seconds: completedTimeSeconds,
            reason: doc.reason ?? '',
            status: doc.status,
        });
    } catch (err) {
        console.error('Error fetching ECR details:', err);
        res.status(500).json({ error: 'Failed to fetch request details.' });
    }
});

// GET /api/admin/early-checkout-requests - List pending (and optionally recent) early checkout requests
router.get('/early-checkout-requests', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const status = req.query.status || 'Pending';
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const query = status === 'all' ? {} : { status };
        const requests = await EarlyCheckoutRequest.find(query)
            .populate('employee', 'fullName employeeCode email')
            .populate('attendanceLog', 'attendanceDate clockInTime')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        res.json({ requests });
    } catch (err) {
        console.error('Error fetching early checkout requests:', err);
        res.status(500).json({ error: 'Failed to fetch early checkout requests.' });
    }
});

// POST /api/admin/early-checkout-requests/:id/approve - Approve and perform checkout
router.post('/early-checkout-requests/:id/approve', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const adminUserId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }
    try {
        const result = await earlyCheckoutService.performApprovedClockOut(id, adminUserId);
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Approval failed.' });
        }
        const cacheService = require('../../services/cacheService');
        cacheService.invalidateDashboard(getTodayISTKey());
        res.json({ message: result.message || 'Early checkout approved. Checkout has been recorded.' });
    } catch (err) {
        console.error('Error approving early checkout:', err);
        res.status(500).json({ error: err.message || 'Failed to approve request.' });
    }
});

// POST /api/admin/early-checkout-requests/:id/reject - Reject request (employee stays clocked in)
router.post('/early-checkout-requests/:id/reject', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { rejectionNote } = req.body || {};
    const adminUserId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid request ID.' });
    }
    try {
        const request = await EarlyCheckoutRequest.findById(id);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.status !== 'Pending') return res.status(400).json({ error: 'Request is no longer pending.' });
        request.status = 'Rejected';
        request.reviewedBy = adminUserId;
        request.reviewedAt = new Date();
        await request.save();
        const user = await User.findById(request.employee).select('fullName').lean();
        NewNotificationService.notifyEarlyCheckoutRejected(
            request.employee,
            user?.fullName || 'Employee',
            typeof rejectionNote === 'string' ? rejectionNote.trim() : null
        ).catch(() => {});
        const cacheService = require('../../services/cacheService');
        cacheService.invalidateDashboard(getTodayISTKey());
        const cache = require('../../utils/cache');
        const log = await AttendanceLog.findById(request.attendanceLog).select('attendanceDate').lean();
        if (log) cache.delete(`employee_dashboard:${request.employee}:${log.attendanceDate}`);
        res.json({ message: 'Early checkout request rejected.' });
    } catch (err) {
        console.error('Error rejecting early checkout:', err);
        res.status(500).json({ error: 'Failed to reject request.' });
    }
});
module.exports = router;
