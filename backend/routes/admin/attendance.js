// backend/routes/admin/attendance.js
// Admin attendance rewrite, overrides, absent-to-leave, and bulk actions.
// Mounted at /api/admin via routes/admin/index.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const authenticateToken = require('../../middleware/authenticateToken');
const isAdminOrHr = require('../../middleware/requireAdminOrHr');
const { invalidateAnalyticsCache, invalidateCacheForDate } = require('../../middleware/analyticsCacheInvalidation');
const requireBulkAttendanceActionsAccess = require('../../middleware/requireBulkAttendanceActionsAccess');

const User = require('../../models/User');
const AttendanceLog = require('../../models/AttendanceLog');
const AttendanceSession = require('../../models/AttendanceSession');
const LeaveRequest = require('../../models/LeaveRequest');
const BreakLog = require('../../models/BreakLog');
const { recalculateLateStatus } = require('../../services/dailyStatusService');
const { getGracePeriodMinutes } = require('../../utils/gracePeriod');
const { getTodayISTKey, getISTDateString, parseISTDate, startOfISTDay } = require('../../utils/istTime');
const {
    getBulkActionPreview,
    executeBulkAction,
    VALID_ACTIONS,
    getTeaBreakOverruns,
} = require('../../services/bulkAttendanceActionsService');

// --- ATTENDANCE MANAGEMENT ROUTES ---

// PATCH /api/admin/attendance/toggle-status
// Toggle attendance status (late/half-day) for an employee on a specific date
router.patch('/attendance/toggle-status', [authenticateToken, isAdminOrHr, invalidateCacheForDate], async (req, res) => {
    try {
        const { employeeId, attendanceDate, statusType, newStatus } = req.body;

        if (process.env.NODE_ENV !== 'production') console.log('Toggle attendance status request:', { employeeId, attendanceDate, statusType, newStatus });

        // Validate required fields
        if (!employeeId || !attendanceDate || !statusType || !newStatus) {
            return res.status(400).json({ error: 'Employee ID, attendance date, status type, and new status are required.' });
        }

        // Validate status type
        if (!['late', 'halfday'].includes(statusType)) {
            return res.status(400).json({ error: 'Status type must be either "late" or "halfday".' });
        }

        // Validate new status
        if (!['On-time', 'Late', 'Half-day'].includes(newStatus)) {
            return res.status(400).json({ error: 'New status must be "On-time", "Late", or "Half-day".' });
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
            return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ error: 'Invalid employee ID format.' });
        }

        // Check if employee exists
        const employee = await User.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Find or create attendance log for the date
        let attendanceLog = await AttendanceLog.findOne({
            user: employeeId,
            attendanceDate: attendanceDate
        });

        if (!attendanceLog) {
            // If no attendance log exists, create one
            const defaultClockInTime = new Date(`${attendanceDate}T09:00:00`);
            attendanceLog = new AttendanceLog({
                user: employeeId,
                attendanceDate: attendanceDate,
                clockInTime: defaultClockInTime,
                shiftDurationMinutes: 480, // Default 8 hours
                penaltyMinutes: 0,
                paidBreakMinutesTaken: 0,
                unpaidBreakMinutesTaken: 0,
                isLate: newStatus === 'Late',
                isHalfDay: newStatus === 'Half-day',
                lateMinutes: newStatus === 'Late' ? 15 : (newStatus === 'Half-day' ? 60 : 0), // Default late minutes
                lateCount: 0,
                attendanceStatus: newStatus
            });
            await attendanceLog.save();
        } else {
            // Update existing attendance log based on new status
            attendanceLog.attendanceStatus = newStatus;

            if (statusType === 'late') {
                // Toggle late status
                attendanceLog.isLate = newStatus === 'Late';
                attendanceLog.isHalfDay = false; // Remove half-day if marking as late
                attendanceLog.lateMinutes = newStatus === 'Late' ? Math.max(attendanceLog.lateMinutes || 0, 15) : 0;
            } else if (statusType === 'halfday') {
                // Toggle half-day status
                attendanceLog.isHalfDay = newStatus === 'Half-day';
                attendanceLog.isLate = false; // Remove late if marking as half-day
                attendanceLog.lateMinutes = newStatus === 'Half-day' ? Math.max(attendanceLog.lateMinutes || 0, 60) : 0;
            }

            await attendanceLog.save();
        }

        // Log the admin action
        try {
            const auditLogger = require('../../services/auditLogger');
            await auditLogger.logAction({
                userId: req.user.userId,
                action: 'toggle_attendance_status',
                details: {
                    targetEmployeeId: employeeId,
                    targetEmployeeName: employee.fullName,
                    attendanceDate: attendanceDate,
                    statusType: statusType,
                    newStatus: newStatus,
                    previousStatus: attendanceLog.attendanceStatus
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
        } catch (auditError) {
            console.error('Failed to log audit action:', auditError);
            // Don't fail the request if audit logging fails
        }

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                // Emit to all connected clients
                io.emit('attendance_log_updated', {
                    logId: attendanceLog._id,
                    userId: attendanceLog.user,
                    attendanceDate: attendanceLog.attendanceDate,
                    attendanceStatus: attendanceLog.attendanceStatus,
                    isHalfDay: attendanceLog.isHalfDay,
                    isLate: attendanceLog.isLate,
                    lateMinutes: attendanceLog.lateMinutes,
                    clockInTime: attendanceLog.clockInTime,
                    clockOutTime: attendanceLog.clockOutTime,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance status updated to "${newStatus}" for ${employee.fullName} on ${attendanceDate}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for log ${attendanceLog._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        res.json({
            message: `Attendance status updated to "${newStatus}" successfully.`,
            attendanceLog: {
                id: attendanceLog._id,
                attendanceDate: attendanceLog.attendanceDate,
                isLate: attendanceLog.isLate,
                isHalfDay: attendanceLog.isHalfDay,
                attendanceStatus: attendanceLog.attendanceStatus,
                lateMinutes: attendanceLog.lateMinutes,
                employeeName: employee.fullName
            }
        });

    } catch (error) {
        console.error('Error toggling attendance status:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            error: 'Failed to toggle attendance status.',
            details: error.message
        });
    }
});

// GET /api/admin/attendance/employee/:employeeId
// Get attendance data for a specific employee for attendance resolution
router.get('/attendance/employee/:employeeId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { startDate, endDate } = req.query;

        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required.' });
        }

        // Check if employee exists
        const employee = await User.findById(employeeId).select('fullName employeeCode');
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Build query
        const query = { user: employeeId };

        if (process.env.NODE_ENV !== 'production') console.log('Querying attendance logs for employee:', employeeId);

        if (startDate && endDate) {
            query.attendanceDate = {
                $gte: startDate,
                $lte: endDate
            };
            if (process.env.NODE_ENV !== 'production') console.log('Date range filter applied:', { startDate, endDate });
        }

        if (process.env.NODE_ENV !== 'production') console.log('Final query:', query);

        // Get attendance logs with recent dates first
        const attendanceLogs = await AttendanceLog.find(query)
            .select('attendanceDate clockInTime clockOutTime isLate isHalfDay attendanceStatus lateMinutes')
            .sort({ attendanceDate: -1 })
            .limit(50) // Limit to recent 50 records for performance
            .lean();

        if (process.env.NODE_ENV !== 'production') console.log(`Found ${attendanceLogs.length} attendance logs for employee ${employeeId}`);

        const GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
        if (process.env.NODE_ENV !== 'production') console.log(`Using grace period: ${GRACE_PERIOD_MINUTES} minutes`);

        // Calculate correct status for each log based on grace period
        const logsWithCalculatedStatus = attendanceLogs.map(log => {
            const lateMinutes = log.lateMinutes || 0;
            let calculatedStatus = 'On-time';
            let calculatedIsLate = false;
            let calculatedIsHalfDay = false;

            // Check if there's a manual override (stored status differs from calculated)
            // Updated logic to account for new priority system
            const { MINIMUM_WORKING_HOURS } = require('../../config/shiftPolicy');
            const hasSufficientHours = !log.totalWorkingHours || log.totalWorkingHours >= MINIMUM_WORKING_HOURS;
            const withinGracePeriod = lateMinutes <= GRACE_PERIOD_MINUTES;
            
            let expectedStatus = 'On-time';
            if (!hasSufficientHours) {
                expectedStatus = 'Half-day'; // Insufficient hours
            } else if (!withinGracePeriod) {
                expectedStatus = 'Half-day'; // Late arrival
            }
            
            const hasManualOverride = log.attendanceStatus && log.attendanceStatus !== expectedStatus;

            if (hasManualOverride) {
                // Use the manually set status
                calculatedStatus = log.attendanceStatus;
                calculatedIsLate = log.attendanceStatus === 'Late';
                calculatedIsHalfDay = log.attendanceStatus === 'Half-day';
            } else {
                // Apply new priority logic: insufficient hours takes precedence over grace period
                const { MINIMUM_WORKING_HOURS } = require('../../config/shiftPolicy');
            const hasSufficientHours = !log.totalWorkingHours || log.totalWorkingHours >= MINIMUM_WORKING_HOURS;
                const withinGracePeriod = lateMinutes <= GRACE_PERIOD_MINUTES;
                
                if (!hasSufficientHours) {
                    // PRIORITY 1: Insufficient working hours (regardless of grace period)
                    calculatedStatus = 'Half-day';
                    calculatedIsHalfDay = true;
                    calculatedIsLate = false; // Not marked as late if within grace period
                } else if (!withinGracePeriod) {
                    // PRIORITY 2: Exceeds grace period (only if working hours are sufficient)
                    calculatedStatus = 'Half-day';
                    calculatedIsHalfDay = true;
                    calculatedIsLate = true; // Set isLate=true for tracking and notifications
                } else {
                    // PRIORITY 3: Within grace period and sufficient hours → On-time
                    calculatedStatus = 'On-time';
                    calculatedIsLate = false;
                    calculatedIsHalfDay = false;
                }
            }

            return {
                ...log,
                // Override with calculated values
                calculatedStatus,
                calculatedIsLate,
                calculatedIsHalfDay,
                gracePeriodMinutes: GRACE_PERIOD_MINUTES,
                hasManualOverride
            };
        });

        if (attendanceLogs.length > 0) {
            if (process.env.NODE_ENV !== 'production') console.log('Sample attendance log with calculated status:', logsWithCalculatedStatus[0]);
        }

        res.json({
            employee: employee,
            attendanceLogs: logsWithCalculatedStatus,
            gracePeriodMinutes: GRACE_PERIOD_MINUTES
        });

    } catch (error) {
        console.error('Error fetching employee attendance:', error);
        res.status(500).json({ error: 'Failed to fetch employee attendance data.' });
    }
});

router.get('/attendance/user/:userId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { userId } = req.params;
        const { startDate, endDate } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid employee ID format.' });
        }
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date query parameters are required.' });
        }

        const logs = await AttendanceLog.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), attendanceDate: { $gte: startDate, $lte: endDate } } },
            { $lookup: { from: 'attendancesessions', localField: '_id', foreignField: 'attendanceLog', as: 'sessions' } },
            { $lookup: { from: 'breaklogs', localField: '_id', foreignField: 'attendanceLog', as: 'breaks' } },
            { $project: { _id: 1, attendanceDate: 1, status: 1, clockInTime: 1, clockOutTime: 1, notes: 1, logoutType: 1, autoLogoutReason: 1, earlyCheckoutNote: 1, sessions: { $map: { input: "$sessions", as: "s", in: { startTime: "$$s.startTime", endTime: "$$s.endTime", logoutType: "$$s.logoutType", autoLogoutReason: "$$s.autoLogoutReason" } } }, breaks: { $map: { input: "$breaks", as: "b", in: { startTime: "$$b.startTime", endTime: "$$b.endTime", durationMinutes: "$$b.durationMinutes", breakType: "$$b.breakType" } } } } },
            { $sort: { attendanceDate: 1 } }
        ]);

        res.json(logs);

    } catch (error) {
        console.error('Error fetching user attendance summary:', error);
        res.status(500).json({ error: 'Server error while fetching attendance summary.' });
    }
});

/**
 * PUT /api/admin/attendance/log/:logId
 * Update an attendance log with new sessions and breaks
 * 
 * Expected payload structure:
 * {
 *   sessions: Array<{ 
 *     startTime: string (ISO 8601 date string, required),
 *     endTime: string (ISO 8601 date string, optional, must be after startTime if provided)
 *   }>,
 *   breaks: Array<{
 *     startTime: string (ISO 8601 date string, required),
 *     endTime: string (ISO 8601 date string, required, must be after startTime),
 *     breakType: 'Paid' | 'Unpaid' | 'Extra' (required)
 *   }>,
 *   notes: string (optional, defaults to empty string)
 * }
 * 
 * Validation rules:
 * - All time values must be valid ISO 8601 date strings
 * - endTime must be after startTime for both sessions and breaks
 * - Session duration cannot exceed 24 hours (increased from 16 hours for admin flexibility)
 * - Break duration cannot exceed 24 hours (increased from 16 hours for admin flexibility)
 * - breakType must be one of: 'Paid', 'Unpaid', 'Extra'
 * - Admins can edit auto-logged-out attendance logs (restriction removed)
 */
router.put('/attendance/log/:logId', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    const { logId } = req.params;
    let { sessions, breaks, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid log ID.',
            error: 'Invalid log ID.'
        });
    }

    // Log received data for debugging (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') console.log('PUT /admin/attendance/log/:logId - Received data:', {
        logId,
        sessionsType: typeof sessions,
        sessionsIsArray: Array.isArray(sessions),
        sessionsLength: Array.isArray(sessions) ? sessions.length : 'N/A',
        breaksType: typeof breaks,
        breaksIsArray: Array.isArray(breaks),
        breaksLength: Array.isArray(breaks) ? breaks.length : 'N/A',
        hasNotes: notes !== undefined
    });

    // First, check if the attendance log exists and if it was auto-logged out
    const log = await AttendanceLog.findById(logId);
    if (!log) {
        return res.status(404).json({
            success: false,
            message: 'Attendance log not found.',
            error: 'Attendance log not found.'
        });
    }

    // PHASE 6: Warn if this date has an approved leave
    let leaveWarning = null;
    if (log.leaveRequest) {
        const leaveRequest = await LeaveRequest.findById(log.leaveRequest);
        if (leaveRequest && leaveRequest.status === 'Approved') {
            leaveWarning = `Warning: This date has an approved leave (${leaveRequest.requestType}). Editing attendance may conflict with leave status.`;
        }
    }

    // CRITICAL FIX: Allow admins to edit auto-logged-out sessions
    // Admins should be able to override auto-logout restrictions for corrections
    // Only show warning, but allow the edit to proceed
    if (log.logoutType === 'AUTO' && log.autoLogoutReason) {
        // Log warning but allow admin to proceed with edit
        console.warn('[Admin Edit] Editing auto-logged-out attendance log:', {
            logId: log._id,
            userId: log.user,
            autoLogoutReason: log.autoLogoutReason,
            adminUserId: req.user.userId,
            adminRole: req.user.role
        });

        // Clear auto-logout status when admin edits (mark as manually corrected)
        if (sessions !== undefined || breaks !== undefined) {
            log.logoutType = 'MANUAL';
            log.autoLogoutReason = null;
            if (process.env.NODE_ENV !== 'production') console.log('[Admin Edit] Auto-logout status cleared by admin edit');
        }
        // Continue with normal edit flow below
    }

    // Validate and default required fields
    if (sessions === undefined || sessions === null) {
        sessions = [];
    }
    if (!Array.isArray(sessions)) {
        console.error('Validation error: sessions is not an array:', sessions);
        return res.status(400).json({
            success: false,
            message: 'Sessions must be an array.',
            error: 'Sessions must be an array.'
        });
    }

    if (breaks === undefined || breaks === null) {
        breaks = [];
    }
    if (!Array.isArray(breaks)) {
        console.error('Validation error: breaks is not an array:', breaks);
        return res.status(400).json({
            success: false,
            message: 'Breaks must be an array.',
            error: 'Breaks must be an array.'
        });
    }

    // Validate sessions with time ordering checks
    for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        if (!s || typeof s !== 'object') {
            return res.status(400).json({
                success: false,
                message: `Session #${i + 1} is invalid. Expected an object.`,
                error: `Session #${i + 1} is invalid. Expected an object.`
            });
        }
        if (!s.startTime) {
            return res.status(400).json({
                success: false,
                message: `Session #${i + 1} is missing startTime.`,
                error: `Session #${i + 1} is missing startTime.`
            });
        }
        const startTime = new Date(s.startTime);
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: `Session #${i + 1} has an invalid startTime: ${s.startTime}`,
                error: `Session #${i + 1} has an invalid startTime: ${s.startTime}`
            });
        }
        if (s.endTime) {
            const endTime = new Date(s.endTime);
            if (isNaN(endTime.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: `Session #${i + 1} has an invalid endTime: ${s.endTime}`,
                    error: `Session #${i + 1} has an invalid endTime: ${s.endTime}`
                });
            }
            // Validate time ordering: endTime must be after startTime
            if (endTime <= startTime) {
                return res.status(400).json({
                    success: false,
                    message: `Session #${i + 1} end time must be after start time.`,
                    error: `Session #${i + 1} end time must be after start time.`
                });
            }
            // Validate reasonable duration (max 24 hours for admin edits - increased from 16 hours)
            // This allows for legitimate cases like night shifts, corrections, etc.
            const durationHours = (endTime - startTime) / (1000 * 60 * 60);
            if (durationHours > 24) {
                return res.status(400).json({
                    success: false,
                    message: `Session #${i + 1} duration cannot exceed 24 hours.`,
                    error: `Session #${i + 1} duration cannot exceed 24 hours.`
                });
            }
        }
    }

    // Validate breaks with time ordering and breakType checks
    for (let i = 0; i < breaks.length; i++) {
        const b = breaks[i];
        if (!b || typeof b !== 'object') {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is invalid. Expected an object.`,
                error: `Break #${i + 1} is invalid. Expected an object.`
            });
        }
        if (!b.startTime) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is missing startTime.`,
                error: `Break #${i + 1} is missing startTime.`
            });
        }
        if (!b.endTime) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is missing endTime.`,
                error: `Break #${i + 1} is missing endTime.`
            });
        }
        const startTime = new Date(b.startTime);
        const endTime = new Date(b.endTime);
        if (isNaN(startTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} has an invalid startTime: ${b.startTime}`,
                error: `Break #${i + 1} has an invalid startTime: ${b.startTime}`
            });
        }
        if (isNaN(endTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} has an invalid endTime: ${b.endTime}`,
                error: `Break #${i + 1} has an invalid endTime: ${b.endTime}`
            });
        }
        // Validate time ordering: endTime must be after startTime
        if (endTime <= startTime) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} end time must be after start time.`,
                error: `Break #${i + 1} end time must be after start time.`
            });
        }
        // Validate reasonable duration (max 24 hours for admin edits - increased from 16 hours)
        // This allows for legitimate cases like corrections, extended breaks, etc.
        const durationHours = (endTime - startTime) / (1000 * 60 * 60);
        if (durationHours > 24) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} duration cannot exceed 24 hours.`,
                error: `Break #${i + 1} duration cannot exceed 24 hours.`
            });
        }
        // Handle both breakType and type for backward compatibility
        const breakType = (b.breakType || b.type || '').toString().trim();
        if (!breakType) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} is missing breakType.`,
                error: `Break #${i + 1} is missing breakType.`
            });
        }
        if (!['Paid', 'Unpaid', 'Extra'].includes(breakType)) {
            return res.status(400).json({
                success: false,
                message: `Break #${i + 1} has an invalid breakType: ${breakType}. Must be 'Paid', 'Unpaid', or 'Extra'.`,
                error: `Break #${i + 1} has an invalid breakType: ${breakType}. Must be 'Paid', 'Unpaid', or 'Extra'.`
            });
        }
    }

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
        // Reload log within transaction to ensure consistency
        const logInTransaction = await AttendanceLog.findById(logId).session(dbSession);
        if (!logInTransaction) {
            await dbSession.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Attendance log not found.',
                error: 'Attendance log not found.'
            });
        }

        // Ensure logoutType check still applies (double-check within transaction)
        if (logInTransaction.logoutType === 'AUTO' && logInTransaction.autoLogoutReason) {
            // CRITICAL FIX: Allow admins to edit auto-logged-out sessions
            // Clear auto-logout status when admin edits (mark as manually corrected)
            console.warn('[Admin Edit] Editing auto-logged-out attendance log in transaction:', {
                logId: logInTransaction._id,
                userId: logInTransaction.user,
                autoLogoutReason: logInTransaction.autoLogoutReason,
                adminUserId: req.user.userId,
                adminRole: req.user.role
            });

            // Clear auto-logout status
            logInTransaction.logoutType = 'MANUAL';
            logInTransaction.autoLogoutReason = null;
            if (process.env.NODE_ENV !== 'production') console.log('[Admin Edit] Auto-logout status cleared by admin edit in transaction');
        }

        const log = logInTransaction;

        await AttendanceSession.deleteMany({ attendanceLog: log._id }).session(dbSession);
        await BreakLog.deleteMany({ attendanceLog: log._id }).session(dbSession);

        const newSessions = sessions.map(s => ({
            startTime: new Date(s.startTime),
            endTime: s.endTime ? new Date(s.endTime) : null,
            attendanceLog: log._id,
        }));
        if (newSessions.length > 0) {
            await AttendanceSession.insertMany(newSessions, { session: dbSession });
        }

        let totalPaidBreak = 0;
        let totalUnpaidBreak = 0;

        const newBreaks = breaks.map(b => {
            const startTime = new Date(b.startTime);
            const endTime = new Date(b.endTime);
            const durationMinutes = (endTime - startTime) / 60000;

            // Handle both breakType and type for backward compatibility
            const breakType = b.breakType || b.type || 'Unpaid';

            if (breakType === 'Paid') {
                totalPaidBreak += durationMinutes;
            } else {
                totalUnpaidBreak += durationMinutes;
            }

            return {
                type: breakType,
                breakType: breakType,
                startTime,
                endTime,
                durationMinutes,
                attendanceLog: log._id,
                userId: log.user
            };
        });

        if (newBreaks.length > 0) {
            await BreakLog.insertMany(newBreaks, { session: dbSession });
        }

        // Preserve existing clockInTime and clockOutTime if not updating from sessions
        // This ensures required fields remain valid during partial updates
        // CRITICAL: clockInTime is required in schema, so we must preserve it if not updating
        const sortedSessions = [...newSessions].sort((a, b) => a.startTime - b.startTime);

        // Track if clockInTime changed so we can recalculate derived fields
        const previousClockInTime = log.clockInTime ? new Date(log.clockInTime).getTime() : null;
        let clockInTimeChanged = false;

        // Only update clockInTime if we have valid sessions (preserve existing if not)
        // This prevents Mongoose validation errors: "Path `clockInTime` is required"
        if (sortedSessions.length > 0 && sortedSessions[0].startTime) {
            const newClockInTime = sortedSessions[0].startTime;
            const newClockInTimeMs = new Date(newClockInTime).getTime();
            // Check if clockInTime actually changed
            if (previousClockInTime !== newClockInTimeMs) {
                clockInTimeChanged = true;
                log.clockInTime = newClockInTime;
            }
        }
        // If no sessions or empty sessions array, preserve existing clockInTime
        // (no assignment needed - log.clockInTime already has the existing value)

        // Update clockOutTime if we have valid sessions (clockOutTime is optional, so null is OK)
        const lastSession = sortedSessions[sortedSessions.length - 1];
        if (sortedSessions.length > 0) {
            // We have sessions - update clockOutTime based on last session
            log.clockOutTime = lastSession?.endTime || null;
            // If admin is editing and setting clockOutTime, preserve logoutType appropriately
            // Only set to MANUAL if clockOutTime is being set and logoutType was not AUTO
            if (lastSession?.endTime && log.logoutType !== 'AUTO') {
                log.logoutType = 'MANUAL'; // Admin edits are considered manual
                log.autoLogoutReason = null; // Clear auto-logout reason if admin edits
            }
        }
        // If no sessions, preserve existing clockOutTime and logoutType (no assignment needed)

        log.paidBreakMinutesTaken = totalPaidBreak;
        log.unpaidBreakMinutesTaken = totalUnpaidBreak;
        if (notes !== undefined) {
            log.notes = notes;
            // Keep early checkout reason in sync with notes for calendar ECN and log detail
            log.earlyCheckoutNote = notes;
        }
        log.penaltyMinutes = 0;

        // CRITICAL: If clockInTime changed, recalculate derived fields (isLate, isHalfDay, etc.)
        // This ensures admin edits immediately update the status
        // NOTE: log.clockInTime is already set to first session's startTime above (line 2217)
        if (clockInTimeChanged && log.clockInTime) {
            try {
                const user = await User.findById(log.user).populate('shiftGroup').lean();
                if (user && user.shiftGroup && user.shiftGroup.startTime) {
                    // CRITICAL: log.clockInTime is already the first session's startTime (set above)
                    // But to be extra safe, verify by getting first session again
                    const AttendanceSession = require('../../models/AttendanceSession');
                    const verifyFirstSession = await AttendanceSession.findOne({ 
                        attendanceLog: log._id 
                    }).sort({ startTime: 1 }).select('startTime').lean();
                    
                    const clockInTimeForRecalc = (verifyFirstSession && verifyFirstSession.startTime) 
                        ? new Date(verifyFirstSession.startTime)
                        : new Date(log.clockInTime);
                    
                    const recalculatedStatus = await recalculateLateStatus(
                        clockInTimeForRecalc,
                        user.shiftGroup,
                        null, // gracePeriodMinutes (will be fetched from settings)
                        log.totalWorkingHours // Pass working hours for priority logic
                    );
                    // Update derived fields with recalculated values
                    log.isLate = recalculatedStatus.isLate;
                    log.isHalfDay = recalculatedStatus.isHalfDay;
                    log.lateMinutes = recalculatedStatus.lateMinutes;
                    log.attendanceStatus = recalculatedStatus.attendanceStatus;
                    if (process.env.NODE_ENV !== 'production') console.log(`✅ Recalculated attendance status after clockInTime update: ${recalculatedStatus.attendanceStatus} (lateMinutes: ${recalculatedStatus.lateMinutes})`);
                }
            } catch (recalcError) {
                console.error('Error recalculating late status after clockInTime update:', recalcError);
                // Don't fail the request, but log the error
            }
        }

        // Recalculate total working hours based on updated sessions and breaks
        if (log.clockInTime && log.clockOutTime) {
            const workingMinutes = (new Date(log.clockOutTime) - new Date(log.clockInTime)) / (1000 * 60);
            const totalBreakMinutes = totalPaidBreak + totalUnpaidBreak;
            const netWorkingMinutes = Math.max(0, workingMinutes - totalBreakMinutes);
            log.totalWorkingHours = netWorkingMinutes / 60;
        } else {
            log.totalWorkingHours = 0;
        }

        // Save the log with validation - catch any Mongoose validation errors
        try {
            await log.save({ session: dbSession });
        } catch (saveError) {
            await dbSession.abortTransaction();

            // Handle Mongoose validation errors specifically
            if (saveError.name === 'ValidationError') {
                const validationMessages = Object.values(saveError.errors).map(err => err.message);
                console.error('Mongoose validation error:', validationMessages);
                return res.status(400).json({
                    success: false,
                    message: `Validation failed: ${validationMessages.join(', ')}`,
                    error: `Validation failed: ${validationMessages.join(', ')}`
                });
            }

            // Re-throw other errors to be handled by outer catch block
            throw saveError;
        }

        await dbSession.commitTransaction();

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                // Emit to all connected clients
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    isLate: log.isLate,
                    totalWorkingHours: log.totalWorkingHours,
                    clockInTime: log.clockInTime,
                    clockOutTime: log.clockOutTime,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance log updated by admin - Working hours: ${log.totalWorkingHours.toFixed(2)}h`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for log ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // PHASE 4 OPTIMIZATION: Cache invalidation on mutation
        // Invalidate status cache for this user and date
        const cache = require('../../utils/cache');
        const cacheKey = `status:${log.user}:${log.attendanceDate}`;
        cache.delete(cacheKey);
        // Also invalidate dashboard summary cache
        cache.deletePattern(`dashboard-summary:*`);
        // Also invalidate existing cacheService
        const cacheService = require('../../services/cacheService');
        cacheService.invalidateAttendance(log.user, log.attendanceDate);
        cacheService.invalidateDashboard(log.attendanceDate);

        const response = {
            success: true,
            message: 'Log updated successfully.'
        };

        // PHASE 6: Include warning if leave exists
        if (leaveWarning) {
            response.warning = leaveWarning;
        }

        res.json(response);

    } catch (error) {
        await dbSession.abortTransaction();

        // Handle different error types with structured responses
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({
                success: false,
                message: `Validation failed: ${messages.join(', ')}`,
                error: `Validation failed: ${messages.join(', ')}`
            });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: `Invalid data format for field: ${error.path}. Please check your inputs.`,
                error: `Invalid data format for field: ${error.path}. Please check your inputs.`
            });
        }

        // Log error for debugging but don't expose internal details to client
        console.error('Error updating attendance log:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while updating log. Please try again.',
            error: 'Server error while updating log.'
        });
    } finally {
        dbSession.endSession();
    }
});

// DELETE /api/admin/attendance/log/:logId
// Delete an attendance log and all associated sessions and breaks
router.delete('/attendance/log/:logId', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { logId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(logId)) {
        return res.status(400).json({ error: 'Invalid log ID.' });
    }

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
        // Find the log and populate user info for audit logging
        const log = await AttendanceLog.findById(logId)
            .populate('user', 'fullName employeeCode')
            .session(dbSession);

        if (!log) {
            await dbSession.abortTransaction();
            return res.status(404).json({ error: 'Attendance log not found.' });
        }

        // Store log data for audit logging before deletion
        const logData = {
            logId: log._id,
            userId: log.user._id,
            userName: log.user.fullName,
            employeeCode: log.user.employeeCode,
            attendanceDate: log.attendanceDate,
            clockInTime: log.clockInTime,
            clockOutTime: log.clockOutTime,
            attendanceStatus: log.attendanceStatus,
            totalWorkingHours: log.totalWorkingHours
        };

        // Delete all associated sessions
        await AttendanceSession.deleteMany({ attendanceLog: log._id }).session(dbSession);

        // Delete all associated breaks
        await BreakLog.deleteMany({ attendanceLog: log._id }).session(dbSession);

        // Delete the attendance log
        await AttendanceLog.findByIdAndDelete(logId).session(dbSession);

        await dbSession.commitTransaction();

        // Log the admin action
        try {
            const auditLogger = require('../../services/auditLogger');
            await auditLogger.logAction({
                userId: req.user.userId,
                action: 'delete_attendance_log',
                details: {
                    deletedLogId: logData.logId,
                    targetEmployeeId: logData.userId,
                    targetEmployeeName: logData.userName,
                    targetEmployeeCode: logData.employeeCode,
                    attendanceDate: logData.attendanceDate,
                    deletedClockInTime: logData.clockInTime,
                    deletedClockOutTime: logData.clockOutTime,
                    deletedAttendanceStatus: logData.attendanceStatus,
                    deletedTotalWorkingHours: logData.totalWorkingHours
                },
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });
        } catch (auditError) {
            console.error('Failed to log audit action:', auditError);
            // Don't fail the request if audit logging fails
        }

        // Emit Socket.IO event to notify all clients about the attendance log deletion
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_deleted', {
                    logId: logData.logId,
                    userId: logData.userId,
                    attendanceDate: logData.attendanceDate,
                    deletedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance log deleted by admin for ${logData.userName} on ${logData.attendanceDate}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_deleted event for log ${logData.logId}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        res.json({
            message: 'Attendance log deleted successfully.',
            deletedLog: {
                logId: logData.logId,
                attendanceDate: logData.attendanceDate,
                employeeName: logData.userName
            }
        });

    } catch (error) {
        await dbSession.abortTransaction();
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
        }
        if (error.name === 'CastError') {
            return res.status(400).json({ error: `Invalid data format: ${error.message}` });
        }
        console.error('Error deleting attendance log:', error);
        res.status(500).json({ error: 'Server error while deleting log.' });
    } finally {
        dbSession.endSession();
    }
});

// POST /api/admin/attendance/override-half-day - Override half-day marking for an attendance log
// NEW: Accepts overrideReason in request body
router.post('/attendance/override-half-day', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { attendanceLogId } = req.body;

        // Validate required fields
        if (!attendanceLogId) {
            return res.status(400).json({
                success: false,
                error: 'attendanceLogId is required.'
            });
        }

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(attendanceLogId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid attendanceLogId format.'
            });
        }

        // Find the attendance log with user and shiftGroup populated
        const log = await AttendanceLog.findById(attendanceLogId)
            .populate({
                path: 'user',
                select: 'fullName employeeCode shiftGroup',
                populate: {
                    path: 'shiftGroup',
                    select: 'startTime endTime durationHours shiftType name'
                }
            });
        if (!log) {
            return res.status(404).json({
                success: false,
                error: 'Attendance log not found.'
            });
        }

        // Block overrides on future dates
        const { getISTDateString } = require('../../utils/istTime');
        const todayIST = getISTDateString();
        if (log.attendanceDate > todayIST) {
            return res.status(400).json({
                success: false,
                error: 'Cannot override a future date. Overrides can only be applied to past or today\'s attendance.'
            });
        }

        // Get override reason from request body (required for audit trail)
        const { overrideReason, newStatus } = req.body;

        // Validate override reason if provided (should be mandatory for proper audit trail)
        if (!overrideReason || typeof overrideReason !== 'string' || overrideReason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'overrideReason is required when overriding half-day status.'
            });
        }

        // Store original values for audit logging
        const originalStatus = log.attendanceStatus;
        const originalIsHalfDay = log.isHalfDay;
        const originalAdminOverride = log.adminOverride;
        const originalHalfDayReason = log.halfDayReasonText;

        // Override half-day: Set adminOverride flag and recompute status
        log.adminOverride = 'Override Half Day';
        log.isHalfDay = false;

        // Clear half-day reason fields (overriding removes half-day status)
        log.halfDayReasonCode = null;
        log.halfDayReasonText = '';
        log.halfDaySource = null;

        // Set override tracking fields
        log.overriddenByAdmin = true;
        log.overriddenAt = new Date();
        log.overriddenBy = req.user.userId;
        log.overrideReason = overrideReason.trim();

        // CRITICAL: Recompute late/half-day status from FIRST check-in time
        // This ensures derived state is always correct after override
        // CRITICAL FIX: Use FIRST session's startTime, not stored clockInTime
        if (log.clockInTime && log.user && log.user.shiftGroup && log.user.shiftGroup.startTime) {
            const AttendanceSession = require('../../models/AttendanceSession');
            const firstSession = await AttendanceSession.findOne({ 
                attendanceLog: log._id 
            }).sort({ startTime: 1 }).select('startTime').lean();
            
            const clockInTimeForRecalc = (firstSession && firstSession.startTime) 
                ? new Date(firstSession.startTime)
                : new Date(log.clockInTime);
            
            const recalculatedStatus = await recalculateLateStatus(
                clockInTimeForRecalc,
                log.user.shiftGroup,
                null, // gracePeriodMinutes (will be fetched from settings)
                log.totalWorkingHours // Pass working hours for priority logic
            );

            // Since we're overriding half-day, we need to determine the correct status
            // If the employee was actually late (beyond grace period), mark as Late
            // Otherwise, mark as On-time
            if (recalculatedStatus.lateMinutes > 0) {
                const GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
                if (recalculatedStatus.lateMinutes <= GRACE_PERIOD_MINUTES) {
                    // Within grace period - On-time
                    log.attendanceStatus = 'On-time';
                    log.isLate = false;
                    log.lateMinutes = recalculatedStatus.lateMinutes;
                } else {
                    // Beyond grace period - Late (but not half-day due to override)
                    log.attendanceStatus = 'Late';
                    log.isLate = true;
                    log.lateMinutes = recalculatedStatus.lateMinutes;
                }
            } else {
                // Not late - On-time
                log.attendanceStatus = 'On-time';
                log.isLate = false;
                log.lateMinutes = 0;
            }
        } else {
            // No clock-in time or shift info - default to On-time
            log.attendanceStatus = 'On-time';
            log.isLate = false;
            log.lateMinutes = 0;
        }

        // Save the updated log (DO NOT DELETE - just update status)
        await log.save();

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user._id || log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    isLate: log.isLate,
                    totalWorkingHours: log.totalWorkingHours,
                    clockInTime: log.clockInTime,
                    clockOutTime: log.clockOutTime,
                    adminOverride: log.adminOverride,
                    previousStatus: originalStatus,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Half-day override applied: ${originalStatus} → ${log.attendanceStatus}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for override on log ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Log the admin action for audit trail
        try {
            const logAction = require('../../services/logAction');
            await logAction(
                req.user.userId,
                'OVERRIDE_HALF_DAY',
                {
                    attendanceLogId: log._id,
                    attendanceDate: log.attendanceDate,
                    employeeId: log.user._id || log.user,
                    employeeName: log.user.fullName || 'Unknown',
                    previousStatus: originalStatus,
                    previousIsHalfDay: originalIsHalfDay,
                    newStatus: log.attendanceStatus,
                    newIsHalfDay: log.isHalfDay,
                    adminOverride: log.adminOverride,
                    details: `Admin override: Half-day marking removed for ${log.attendanceDate}. Status changed from "${originalStatus}" to "${log.attendanceStatus}". Override reason: "${overrideReason}". Previous half-day reason: "${originalHalfDayReason || 'None'}"`
                }
            );
        } catch (logError) {
            console.error('Failed to log override action:', logError);
            // Don't fail the main request if logging fails
        }

        res.status(200).json({
            success: true,
            message: 'Half day overridden successfully.',
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                attendanceStatus: log.attendanceStatus,
                isHalfDay: log.isHalfDay,
                isLate: log.isLate,
                lateMinutes: log.lateMinutes,
                adminOverride: log.adminOverride,
                overrideReason: log.overrideReason,
                overriddenByAdmin: log.overriddenByAdmin,
                overriddenAt: log.overriddenAt,
                previousStatus: originalStatus,
                previousHalfDayReason: originalHalfDayReason
            }
        });

    } catch (error) {
        console.error('Error overriding half-day status:', error);
        console.error('Error stack:', error.stack);
        console.error('Request details:', {
            attendanceLogId: req.body.attendanceLogId,
            userId: req.user?.userId
        });
        res.status(500).json({
            success: false,
            error: 'Server error while overriding half-day status.',
            details: error.message
        });
    }
});

// PATCH /api/admin/attendance/override/:logId - Update override note
// Only applies to logs that are already overridden. Updates existing record; no delete.
router.patch('/attendance/override/:logId', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const logId = req.params.logId;
        const { overrideReason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({ success: false, error: 'Invalid log ID.' });
        }
        if (!overrideReason || typeof overrideReason !== 'string' || overrideReason.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideReason is required and must be a non-empty string.' });
        }

        const log = await AttendanceLog.findById(logId)
            .populate({ path: 'user', select: 'fullName employeeCode', populate: { path: 'shiftGroup', select: 'startTime endTime' } });
        if (!log) {
            return res.status(404).json({ success: false, error: 'Attendance log not found.' });
        }
        if (log.overriddenByAdmin !== true) {
            return res.status(400).json({ success: false, error: 'Log is not overridden. Use apply-override first.' });
        }

        const previousNote = log.overrideReason || '';
        log.overrideReason = overrideReason.trim();
        log.overriddenAt = new Date();
        log.overriddenBy = req.user.userId;
        await log.save();

        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user._id || log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    overrideReason: log.overrideReason,
                    overriddenByAdmin: log.overriddenByAdmin,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: 'Override updated.'
                });
            }
        } catch (e) { /* ignore */ }

        try {
            const logAction = require('../../services/logAction');
            await logAction(req.user.userId, 'UPDATE_OVERRIDE', {
                attendanceLogId: log._id,
                attendanceDate: log.attendanceDate,
                previousNote,
                newNote: log.overrideReason,
                details: `Override note updated for ${log.attendanceDate}.`
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: 'Override updated successfully.',
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                overrideReason: log.overrideReason,
                overriddenByAdmin: log.overriddenByAdmin,
                overriddenAt: log.overriddenAt
            }
        });
    } catch (err) {
        console.error('Error updating override:', err);
        return res.status(500).json({ success: false, error: 'Server error while updating override.', details: err.message });
    }
});

// POST /api/admin/attendance/remove-override - Clear override and restore system-calculated status
// Does NOT delete the attendance record. Clears override fields and recalculates status.
router.post('/attendance/remove-override', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { attendanceLogId } = req.body;
        if (!attendanceLogId || !mongoose.Types.ObjectId.isValid(attendanceLogId)) {
            return res.status(400).json({ success: false, error: 'Valid attendanceLogId is required.' });
        }

        const log = await AttendanceLog.findById(attendanceLogId)
            .populate({ path: 'user', select: 'fullName employeeCode shiftGroup', populate: { path: 'shiftGroup', select: 'startTime endTime' } });
        if (!log) {
            return res.status(404).json({ success: false, error: 'Attendance log not found.' });
        }

        const previousOverride = !!log.overriddenByAdmin;
        const previousStatus = log.attendanceStatus;
        const previousNote = log.overrideReason || '';

        // Clear override-specific fields (do NOT delete the log)
        log.overriddenByAdmin = false;
        log.overrideReason = '';
        log.overrideType = null;
        log.adminOverride = 'None';
        log.overriddenAt = null;
        log.overriddenBy = null;

        // Restore system-calculated status from first check-in and working hours
        if (log.clockInTime && log.user?.shiftGroup?.startTime) {
            const AttendanceSessionModel = require('../../models/AttendanceSession');
            const first = await AttendanceSessionModel.findOne({ attendanceLog: log._id }).sort({ startTime: 1 }).select('startTime').lean();
            const clockIn = (first?.startTime) ? new Date(first.startTime) : new Date(log.clockInTime);
            const recalc = await recalculateLateStatus(
                clockIn,
                log.user.shiftGroup,
                null,
                log.totalWorkingHours
            );
            log.isLate = recalc.isLate;
            log.isHalfDay = recalc.isHalfDay;
            log.lateMinutes = recalc.lateMinutes;
            log.attendanceStatus = recalc.attendanceStatus;
            log.halfDayReasonCode = recalc.halfDayReasonCode || null;
            log.halfDayReasonText = recalc.halfDayReasonText || '';
            log.halfDaySource = recalc.isHalfDay ? 'AUTO' : null;
        } else {
            log.isLate = false;
            log.isHalfDay = false;
            log.lateMinutes = 0;
            log.attendanceStatus = log.clockInTime ? 'On-time' : 'Absent';
            log.halfDayReasonCode = null;
            log.halfDayReasonText = '';
            log.halfDaySource = null;
        }

        await log.save();

        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user._id || log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    overrideReason: null,
                    overriddenByAdmin: false,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Override removed. Status restored to ${log.attendanceStatus}.`
                });
            }
        } catch (e) { /* ignore */ }

        try {
            const logAction = require('../../services/logAction');
            await logAction(req.user.userId, 'REMOVE_OVERRIDE', {
                attendanceLogId: log._id,
                attendanceDate: log.attendanceDate,
                previousStatus: previousStatus,
                previousNote,
                newStatus: log.attendanceStatus,
                details: `Override removed for ${log.attendanceDate}. Status restored from "${previousStatus}" to "${log.attendanceStatus}".`
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: 'Override removed. System attendance status restored.',
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                attendanceStatus: log.attendanceStatus,
                isHalfDay: log.isHalfDay,
                overriddenByAdmin: false,
                overrideReason: null
            }
        });
    } catch (err) {
        console.error('Error removing override:', err);
        return res.status(500).json({ success: false, error: 'Server error while removing override.', details: err.message });
    }
});

const { generateDateRange } = require('../../utils/attendanceStatusResolver');

// POST /api/admin/attendance/bulk-override - Global form-based override: apply to all or selected employees, date/range
router.post('/attendance/bulk-override', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { employeeScope, startDate, endDate, overrideType, overrideNote } = req.body;

        if (!overrideType || !['fullday', 'halfday', 'holiday', 'leave'].includes(overrideType)) {
            return res.status(400).json({ success: false, error: 'overrideType is required and must be one of: fullday, halfday, holiday, leave.' });
        }
        if (!overrideNote || typeof overrideNote !== 'string' || overrideNote.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideNote is required and must be a non-empty string.' });
        }
        if (!startDate || typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
            return res.status(400).json({ success: false, error: 'startDate is required in YYYY-MM-DD format.' });
        }

        const start = startDate.trim();
        const end = (endDate && typeof endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim()))
            ? endDate.trim()
            : start;
        if (start > end) {
            return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
        }

        const { getISTDateString } = require('../../utils/istTime');
        const todayIST = getISTDateString();
        if (start > todayIST) {
            return res.status(400).json({
                success: false,
                error: 'Cannot override future dates. startDate must be today or earlier.'
            });
        }
        // Clamp end date to today if end > today (partial range is allowed)
        const effectiveEnd = end > todayIST ? todayIST : end;

        const MAX_OVERRIDE_DAYS = 31;
        const { generateDateRange: countDates } = require('../../utils/attendanceStatusResolver');
        const dateCount = countDates(start, effectiveEnd).length;
        if (dateCount > MAX_OVERRIDE_DAYS) {
            return res.status(400).json({
                success: false,
                error: `Date range too large (${dateCount} days). Maximum allowed is ${MAX_OVERRIDE_DAYS} days per bulk override operation.`
            });
        }

        const defaultShiftMinutes = 480;
        let employeeIds = [];
        let shiftMinutesMap = new Map();
        
        if (employeeScope === 'all') {
            const users = await User.find({ role: { $ne: 'Admin' }, isActive: true }).select('_id shiftGroup').populate('shiftGroup', 'durationHours').lean();
            employeeIds = users.map((u) => u._id);
            // Build shiftMinutes lookup from the already-fetched data
            users.forEach(u => {
                const minutes = (u.shiftGroup?.durationHours != null)
                    ? Math.round(Number(u.shiftGroup.durationHours) * 60)
                    : defaultShiftMinutes;
                shiftMinutesMap.set(u._id.toString(), minutes);
            });
        } else if (Array.isArray(employeeScope) && employeeScope.length > 0) {
            const valid = employeeScope.filter((id) => mongoose.Types.ObjectId.isValid(id));
            const users = await User.find({ _id: { $in: valid }, role: { $ne: 'Admin' }, isActive: true }).select('_id shiftGroup').populate('shiftGroup', 'durationHours').lean();
            employeeIds = users.map((u) => u._id);
            users.forEach(u => {
                const minutes = (u.shiftGroup?.durationHours != null)
                    ? Math.round(Number(u.shiftGroup.durationHours) * 60)
                    : defaultShiftMinutes;
                shiftMinutesMap.set(u._id.toString(), minutes);
            });
        }
        if (employeeIds.length === 0) {
            return res.status(400).json({ success: false, error: 'At least one employee must be selected. Use employeeScope: "all" or an array of employee IDs.' });
        }

        const dates = generateDateRange(start, effectiveEnd);
        const getIO = require('../../socketManager').getIO;
        const io = getIO && getIO();
        const logAction = require('../../services/logAction');
        const note = overrideNote.trim();
        const adminUserId = req.user.userId;
        let appliedCount = 0;

        const adminOverrideLabel = overrideType === 'fullday' ? 'Override Full Day' : overrideType === 'holiday' ? 'Override Holiday' : overrideType === 'leave' ? 'Override Leave' : 'Override Half Day';
        const isHalfDay = overrideType === 'halfday';
        const status = overrideType === 'leave' ? 'Leave' : (isHalfDay ? 'Half-day' : 'On-time');

        // PERFORMANCE FIX: Pre-load ALL existing logs for all employees × all dates in ONE query.
        // Previously: nested for-loops with findOne per (employee, date) = up to 1,400 DB queries.
        // Now: 1 find + 1 bulkWrite regardless of how many employees/days are selected.
        const existingLogs = await AttendanceLog.find({
            user: { $in: employeeIds },
            attendanceDate: { $in: dates }
        }).lean();

        // Build a lookup map: "userId_dateStr" → log
        const logMap = new Map();
        existingLogs.forEach(log => {
            logMap.set(`${log.user.toString()}_${log.attendanceDate}`, log);
        });

        // Collect leave conflicts to resolve (logs that reference an approved leave and we're not applying 'leave' override)
        const leaveConflicts = [];
        if (overrideType !== 'leave') {
            existingLogs.forEach(log => {
                if (log.leaveRequest) {
                    leaveConflicts.push(log);
                }
            });
        }

        // Resolve leave conflicts: fetch all referenced leave requests in one batch query
        if (leaveConflicts.length > 0) {
            const leaveIds = leaveConflicts.map(l => l.leaveRequest).filter(Boolean);
            const leaveRequests = await LeaveRequest.find({ _id: { $in: leaveIds }, status: 'Approved' }).lean();
            const leaveMap = new Map(leaveRequests.map(lr => [lr._id.toString(), lr]));

            const leaveUpdateOps = [];
            const userLeaveBalanceUpdates = new Map(); // userId → { field, delta }

            for (const log of leaveConflicts) {
                const leaveReq = leaveMap.get(log.leaveRequest?.toString());
                if (!leaveReq) continue;

                const typeToField = {
                    'Planned': 'paid', 'Sick': 'sick', 'Casual': 'casual',
                    'Loss of Pay': 'lop', 'Compensatory': 'compensatory',
                    'Backdated Leave': 'paid', 'Comp-Off': 'compensatory',
                };
                const leaveField = typeToField[leaveReq.requestType];
                const leaveDuration = leaveReq.leaveType === 'Full Day' ? 1 : 0.5;

                if (leaveField) {
                    const key = `${leaveReq.employee.toString()}_${leaveField}`;
                    userLeaveBalanceUpdates.set(key, (userLeaveBalanceUpdates.get(key) || 0) + leaveDuration);
                }

                leaveUpdateOps.push({
                    updateOne: {
                        filter: { _id: leaveReq._id },
                        update: {
                            $set: {
                                status: 'Rejected',
                                rejectionNotes: `Admin bulk override changed attendance to '${overrideType}'. Leave auto-cancelled. Override reason: ${note}`
                            }
                        }
                    }
                });
            }

            // Apply all leave rejections in one bulkWrite
            if (leaveUpdateOps.length > 0) {
                await LeaveRequest.bulkWrite(leaveUpdateOps, { ordered: false });
            }

            // Apply leave balance restorations (group by userId and field)
            const balanceUpdateOps = [];
            for (const [key, delta] of userLeaveBalanceUpdates) {
                const [uid, field] = key.split('_');
                balanceUpdateOps.push({
                    updateOne: {
                        filter: { _id: uid },
                        update: { $inc: { [`leaveBalances.${field}`]: delta } }
                    }
                });
            }
            if (balanceUpdateOps.length > 0) {
                await User.bulkWrite(balanceUpdateOps, { ordered: false });
            }
        }

        // Build bulkWrite operations for attendance log upserts
        const overrideTimestamp = new Date();
        const attendanceBulkOps = [];

        for (const eid of employeeIds) {
            const shiftMinutes = shiftMinutesMap.get(eid.toString()) ?? defaultShiftMinutes;

            for (const dateStr of dates) {
                const existingLog = logMap.get(`${eid.toString()}_${dateStr}`);
                appliedCount++;

                const updateFields = {
                    overriddenByAdmin: true,
                    overrideType,
                    overrideReason: note,
                    adminOverride: adminOverrideLabel,
                    overriddenAt: overrideTimestamp,
                    overriddenBy: adminUserId,
                    attendanceStatus: status,
                    isHalfDay,
                    isLate: false,
                    lateMinutes: 0,
                    halfDayReasonCode: isHalfDay ? 'MANUAL_ADMIN' : null,
                    halfDayReasonText: isHalfDay ? note : '',
                    halfDaySource: isHalfDay ? 'MANUAL' : null,
                    // Detach any leave reference when conflict was resolved above
                    ...(existingLog?.leaveRequest && overrideType !== 'leave' ? { leaveRequest: null } : {})
                };

                if (!existingLog) {
                    // No existing log: insert a new one
                    attendanceBulkOps.push({
                        insertOne: {
                            document: {
                                user: eid,
                                attendanceDate: dateStr,
                                shiftDurationMinutes: shiftMinutes,
                                penaltyMinutes: 0,
                                paidBreakMinutesTaken: 0,
                                unpaidBreakMinutesTaken: 0,
                                totalWorkingHours: isHalfDay ? 0 : (shiftMinutes / 60),
                                ...updateFields
                            }
                        }
                    });
                } else {
                    // Existing log: update it
                    attendanceBulkOps.push({
                        updateOne: {
                            filter: { _id: existingLog._id },
                            update: { $set: updateFields }
                        }
                    });
                }

                // Emit socket event for real-time dashboard update
                try {
                    if (io) {
                        io.emit('attendance_log_updated', {
                            logId: existingLog?._id,
                            userId: eid,
                            attendanceDate: dateStr,
                            attendanceStatus: status,
                            isHalfDay,
                            overrideReason: note,
                            overriddenByAdmin: true,
                            overrideType,
                            updatedBy: adminUserId,
                            timestamp: overrideTimestamp.toISOString(),
                            message: 'Bulk override applied.',
                        });
                    }
                } catch (e) { /* ignore socket errors */ }
            }
        }

        // Execute all attendance updates in one bulkWrite
        if (attendanceBulkOps.length > 0) {
            await AttendanceLog.bulkWrite(attendanceBulkOps, { ordered: false });
        }

        try {
            await logAction(adminUserId, 'BULK_OVERRIDE', {
                employeeScope: employeeScope === 'all' ? 'all' : employeeIds.length,
                startDate: start,
                endDate: effectiveEnd,
                overrideType,
                overrideNote: note,
                appliedCount,
                details: `Bulk override: ${overrideType} for ${appliedCount} record(s) from ${start} to ${end}.`,
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: `Override applied to ${appliedCount} attendance record(s).`,
            appliedCount,
        });
    } catch (err) {
        console.error('Error in bulk-override:', err);
        return res.status(500).json({ success: false, error: 'Server error while applying bulk override.', details: err.message });
    }
});

// POST /api/admin/attendance/absent-to-leave
// Convert absent days to leave for permanent employees (employmentStatus = 'Permanent').
// Deducts leave balance per employee. Only processes days where the employee was absent.
router.post('/attendance/absent-to-leave', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { employeeScope, startDate, endDate, leaveType, maxDaysPerEmployee, overrideNote } = req.body;

        const validLeaveTypes = ['Sick', 'Casual', 'Planned'];
        if (!leaveType || !validLeaveTypes.includes(leaveType)) {
            return res.status(400).json({ success: false, error: `leaveType must be one of: ${validLeaveTypes.join(', ')}` });
        }
        if (!overrideNote || typeof overrideNote !== 'string' || overrideNote.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideNote is required.' });
        }
        if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
            return res.status(400).json({ success: false, error: 'startDate is required in YYYY-MM-DD format.' });
        }

        const maxDays = (typeof maxDaysPerEmployee === 'number' && maxDaysPerEmployee >= 1 && maxDaysPerEmployee <= 3)
            ? maxDaysPerEmployee : 3;

        const start = startDate.trim();
        const { getISTDateString } = require('../../utils/istTime');
        const todayIST = getISTDateString();
        const end = (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) ? endDate.trim() : start;
        const effectiveEnd = end > todayIST ? todayIST : end;

        if (start > todayIST) {
            return res.status(400).json({ success: false, error: 'Cannot convert future dates.' });
        }
        if (start > effectiveEnd) {
            return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
        }

        const { generateDateRange } = require('../../utils/attendanceStatusResolver');
        const dates = generateDateRange(start, effectiveEnd);
        if (dates.length > 31) {
            return res.status(400).json({ success: false, error: 'Maximum 31 days allowed per operation.' });
        }

        // Map leaveType → leaveBalances field
        const leaveTypeToField = { 'Sick': 'sick', 'Casual': 'casual', 'Planned': 'paid' };
        const balanceField = leaveTypeToField[leaveType];
        const adminUserId = req.user.userId;
        const note = overrideNote.trim();

        // ── KEY FIX: filter by employmentStatus: 'Permanent' (not probationStatus) ──
        const permanentFilter = { employmentStatus: 'Permanent', role: { $ne: 'Admin' }, isActive: true };

        let employeeIds = [];
        if (employeeScope === 'all') {
            const users = await User.find(permanentFilter).select('_id').lean();
            employeeIds = users.map(u => u._id);
        } else if (Array.isArray(employeeScope) && employeeScope.length > 0) {
            const valid = employeeScope.filter(id => mongoose.Types.ObjectId.isValid(id));
            const users = await User.find({ _id: { $in: valid }, ...permanentFilter }).select('_id fullName').lean();
            employeeIds = users.map(u => u._id);

            // If caller selected specific employees but none are Permanent, give a clear message
            if (employeeIds.length === 0) {
                const anyUsers = await User.find({ _id: { $in: valid } }).select('fullName employmentStatus').lean();
                const detail = anyUsers.map(u => `${u.fullName} (${u.employmentStatus || 'unknown status'})`).join(', ');
                return res.status(400).json({
                    success: false,
                    error: `None of the selected employees have Permanent employment status. Selected: ${detail}. Only employees with employmentStatus = "Permanent" can have absences converted to leave.`
                });
            }
        }

        if (employeeIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No permanent employees found in the selected scope.' });
        }

        // Load all attendance logs for selected employees × dates
        const existingLogs = await AttendanceLog.find({
            user: { $in: employeeIds },
            attendanceDate: { $in: dates },
        }).lean();

        const userLogsMap = new Map();
        for (const log of existingLogs) {
            const uid = log.user.toString();
            if (!userLogsMap.has(uid)) userLogsMap.set(uid, []);
            userLogsMap.get(uid).push(log);
        }

        const attendanceBulkOps = [];
        const balanceBulkOps = [];
        const leaveRequestDocs = [];
        const overrideTs = new Date();
        let convertedCount = 0;
        let skippedCount = 0;

        // Fetch current leave balances for all matched employees
        const usersWithBalance = await User.find({ _id: { $in: employeeIds } }).select('_id leaveBalances').lean();
        const balanceMap = new Map(usersWithBalance.map(u => [u._id.toString(), { ...u.leaveBalances }]));

        for (const eid of employeeIds) {
            const uid = eid.toString();
            const logsByDate = new Map((userLogsMap.get(uid) || []).map(l => [l.attendanceDate, l]));
            let daysConverted = 0;
            let deducted = 0;

            for (const dateStr of dates) {
                if (daysConverted >= maxDays) break;

                const log = logsByDate.get(dateStr);
                // Only convert truly absent days (no clock-in, not already overridden, not leave/holiday)
                const isAbsent = !log
                    || log.attendanceStatus === 'Absent'
                    || (!log.clockInTime && !log.overriddenByAdmin && log.attendanceStatus !== 'Leave' && log.attendanceStatus !== 'Holiday');

                if (!isAbsent) continue;

                const balance = balanceMap.get(uid);
                if (!balance || (balance[balanceField] || 0) < 1) {
                    skippedCount++;
                    continue;
                }

                balance[balanceField] = (balance[balanceField] || 0) - 1;
                deducted++;
                daysConverted++;
                convertedCount++;

                leaveRequestDocs.push({
                    employee: eid,
                    requestType: leaveType,
                    leaveType: 'Full Day',
                    leaveDates: [new Date(dateStr)],
                    reason: `Admin bulk convert: ${note}`,
                    status: 'Approved',
                    approvedBy: adminUserId,
                    approvedAt: overrideTs,
                    isBackdated: true,
                });

                if (log) {
                    attendanceBulkOps.push({
                        updateOne: {
                            filter: { _id: log._id },
                            update: { $set: {
                                attendanceStatus: 'Leave',
                                overriddenByAdmin: true,
                                overrideType: 'leave',
                                overrideReason: note,
                                adminOverride: `Convert Absent to ${leaveType} Leave`,
                                overriddenAt: overrideTs,
                                overriddenBy: adminUserId,
                                isHalfDay: false, isLate: false, lateMinutes: 0,
                            }}
                        }
                    });
                } else {
                    attendanceBulkOps.push({
                        insertOne: {
                            document: {
                                user: eid, attendanceDate: dateStr,
                                attendanceStatus: 'Leave',
                                overriddenByAdmin: true, overrideType: 'leave',
                                overrideReason: note,
                                adminOverride: `Convert Absent to ${leaveType} Leave`,
                                overriddenAt: overrideTs, overriddenBy: adminUserId,
                                isHalfDay: false, isLate: false, lateMinutes: 0,
                                penaltyMinutes: 0, paidBreakMinutesTaken: 0,
                                unpaidBreakMinutesTaken: 0, totalWorkingHours: 0, shiftDurationMinutes: 480,
                            }
                        }
                    });
                }
            }

            if (deducted > 0) {
                balanceBulkOps.push({
                    updateOne: {
                        filter: { _id: eid },
                        update: { $inc: { [`leaveBalances.${balanceField}`]: -deducted } }
                    }
                });
            }
        }

        if (leaveRequestDocs.length > 0) await LeaveRequest.insertMany(leaveRequestDocs, { ordered: false });
        if (attendanceBulkOps.length > 0) await AttendanceLog.bulkWrite(attendanceBulkOps, { ordered: false });
        if (balanceBulkOps.length > 0) await User.bulkWrite(balanceBulkOps, { ordered: false });

        try {
            const logAction = require('../../services/logAction');
            await logAction(adminUserId, 'ABSENT_TO_LEAVE_BULK', {
                employeeScope: employeeScope === 'all' ? 'all' : employeeIds.length,
                startDate: start, endDate: effectiveEnd,
                leaveType, maxDaysPerEmployee: maxDays,
                convertedCount, skippedCount, overrideNote: note,
            });
        } catch (e) { /* ignore */ }

        return res.status(200).json({
            success: true,
            message: `Converted ${convertedCount} absent day(s) to ${leaveType} leave.`,
            convertedCount,
            skippedCount,
            employeesProcessed: employeeIds.length,
        });

    } catch (err) {
        console.error('Error in absent-to-leave:', err);
        return res.status(500).json({ success: false, error: 'Server error during absent-to-leave conversion.', details: err.message });
    }
});

// PUT /api/admin/attendance/half-day/:logId - Toggle half-day status for an attendance log
router.put('/attendance/half-day/:logId', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { logId } = req.params;
        const { isHalfDay } = req.body;

        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({ error: 'Invalid log ID.' });
        }

        if (typeof isHalfDay !== 'boolean') {
            return res.status(400).json({ error: 'isHalfDay must be a boolean value.' });
        }

        const log = await AttendanceLog.findById(logId);
        if (!log) {
            return res.status(404).json({ error: 'Attendance log not found.' });
        }

        // Store the original status for logging
        const originalStatus = log.attendanceStatus;
        const wasHalfDay = log.isHalfDay;

        // Update the half-day status
        log.isHalfDay = isHalfDay;

        // Enhanced status transition logic
        if (isHalfDay && !wasHalfDay) {
            // Marking as half-day - set status to Half-day regardless of current status
            log.attendanceStatus = 'Half-day';
        } else if (!isHalfDay && wasHalfDay) {
            // Unmarking half-day - recalculate status based on existing data
            if (!log.clockInTime) {
                // No clock-in time = Absent
                log.attendanceStatus = 'Absent';
            } else if (log.isLate) {
                // Has clock-in but was late = Late
                log.attendanceStatus = 'Late';
            } else {
                // Has clock-in and wasn't late = On-time
                log.attendanceStatus = 'On-time';
            }
        } else if (isHalfDay && wasHalfDay && log.attendanceStatus !== 'Half-day') {
            // Already marked as half-day but status got changed elsewhere - restore to Half-day
            log.attendanceStatus = 'Half-day';
        }

        await log.save();

        // Emit Socket.IO event to notify all clients about the attendance log update
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                // Emit to all connected clients
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: log.user,
                    attendanceDate: log.attendanceDate,
                    attendanceStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    isLate: log.isLate,
                    totalWorkingHours: log.totalWorkingHours,
                    clockInTime: log.clockInTime,
                    clockOutTime: log.clockOutTime,
                    previousStatus: originalStatus,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Attendance log updated: ${originalStatus} → ${log.attendanceStatus} - Working hours: ${log.totalWorkingHours.toFixed(2)}h`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for log ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Log the action with status transition details (with error handling)
        try {
            const logAction = require('../../services/logAction');
            await logAction(
                req.user.userId,
                isHalfDay ? 'MARK_HALF_DAY' : 'UNMARK_HALF_DAY',
                {
                    attendanceLogId: log._id,
                    attendanceDate: log.attendanceDate,
                    previousStatus: originalStatus,
                    newStatus: log.attendanceStatus,
                    isHalfDay: log.isHalfDay,
                    details: `${isHalfDay ? 'Marked' : 'Unmarked'} half-day for attendance log on ${log.attendanceDate}. Status changed from "${originalStatus}" to "${log.attendanceStatus}"`
                }
            );
        } catch (logError) {
            console.error('Failed to log half-day action:', logError);
            // Don't fail the main request if logging fails
        }

        res.json({
            message: `Half-day status ${isHalfDay ? 'enabled' : 'disabled'} successfully. Status changed from "${originalStatus}" to "${log.attendanceStatus}".`,
            log: {
                _id: log._id,
                attendanceDate: log.attendanceDate,
                isHalfDay: log.isHalfDay,
                attendanceStatus: log.attendanceStatus,
                previousStatus: originalStatus
            }
        });

    } catch (error) {
        console.error('Error updating half-day status:', error);
        console.error('Error stack:', error.stack);
        console.error('Request details:', {
            logId: req.params.logId,
            isHalfDay: req.body.isHalfDay,
            userId: req.user?.userId
        });
        res.status(500).json({
            error: 'Server error while updating half-day status.',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/attendance/recalculate
 * Recalculate attendance records for a date range to sync with leave requests.
 * Admin-only endpoint for fixing historical data.
 */
router.post('/attendance/recalculate', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { startDate, endDate, userId } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Start date and end date are required (format: YYYY-MM-DD).'
            });
        }

        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }

        const { recalculateAttendanceForDateRange, cleanupOrphanedLeaveReferences } = require('../../services/attendanceRecalculationService');

        // Recalculate attendance for date range
        const recalculationResults = await recalculateAttendanceForDateRange(
            userId || null,
            startDate,
            endDate
        );

        // Clean up orphaned leave references
        const cleanupResults = await cleanupOrphanedLeaveReferences(
            userId || null,
            startDate,
            endDate
        );

        res.json({
            success: true,
            message: 'Recalculation completed.',
            recalculation: recalculationResults,
            cleanup: cleanupResults
        });
    } catch (error) {
        console.error('Error recalculating attendance:', error);
        res.status(500).json({
            error: 'Failed to recalculate attendance.',
            details: error.message
        });
    }
});


// --- Bulk attendance actions (admin summary assistant) ---
router.get('/bulk-attendance-actions/preview', [authenticateToken, requireBulkAttendanceActionsAccess], async (req, res) => {
    try {
        const preview = await getBulkActionPreview();
        res.json({ success: true, actions: preview });
    } catch (error) {
        console.error('[bulk-attendance-actions] preview error:', error);
        res.status(500).json({ success: false, error: 'Failed to load bulk action preview.' });
    }
});

router.get('/bulk-attendance-actions/tea-break-overruns', [authenticateToken, requireBulkAttendanceActionsAccess], async (req, res) => {
    try {
        const overruns = await getTeaBreakOverruns();
        res.json({ success: true, overruns });
    } catch (error) {
        console.error('[bulk-attendance-actions] tea-break-overruns error:', error);
        res.status(500).json({ success: false, error: 'Failed to load tea break overrun data.' });
    }
});

router.post('/bulk-attendance-actions/execute', [authenticateToken, requireBulkAttendanceActionsAccess], async (req, res) => {
    try {
        const { action, confirm, checkoutTime } = req.body;

        if (confirm !== true) {
            return res.status(400).json({
                success: false,
                error: 'Confirmation required. Set confirm: true to execute this action.',
            });
        }

        if (!action || !VALID_ACTIONS.has(action)) {
            return res.status(400).json({
                success: false,
                error: `Invalid action. Must be one of: ${Array.from(VALID_ACTIONS).join(', ')}`,
            });
        }

        const result = await executeBulkAction(action, req.user.userId, { checkoutTime });
        res.json(result);
    } catch (error) {
        console.error('[bulk-attendance-actions] execute error:', error);
        const status = error.statusCode || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to execute bulk action.',
        });
    }
});
module.exports = router;
