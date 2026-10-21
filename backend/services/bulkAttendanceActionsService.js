const mongoose = require('mongoose');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const LeaveRequest = require('../models/LeaveRequest');
const AnnouncementMessage = require('../models/AnnouncementMessage');
const NewNotificationService = require('./NewNotificationService');
const cacheService = require('./cacheService');
const cache = require('../utils/cache');
const { getISTNow, getISTDateString, getShiftDateTimeIST, formatISTTime, startOfISTDay } = require('../utils/istTime');
const { getLiveAttendanceOverview } = require('./liveAttendanceService');
const { recalculateLateStatus } = require('./dailyStatusService');
const { isHalfDayLeaveType } = require('../utils/halfDayLeave');
const { stopAllActiveTeaBreaks } = require('./teaBreakStopService');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const EarlyCheckoutRequest = require('../models/EarlyCheckoutRequest');
const {
    UNPAID_BREAK_ALLOWANCE_MINUTES,
    EXTRA_BREAK_ALLOWANCE_MINUTES,
    PAID_BREAK_ALLOWANCE_MINUTES,
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY,
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY,
} = require('../config/shiftPolicy');

const VALID_ACTIONS = new Set([
    'refresh_live_attendance',
    'stop_tea_breaks',
    'end_lunch_breaks',
    'end_other_breaks',
    'overwrite_tea_break_overruns',
    'checkout_all_employees',
    'update_employee_checkin',
]);

const HH_MM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const FUTURE_CHECKOUT_BUFFER_MS = 60 * 1000;

const TEA_BREAK_SAFETY_CUTOFF_MS = 30 * 60 * 1000;

async function getTodayClockedInUserIds(today) {
    const logs = await AttendanceLog.find({
        attendanceDate: today,
        clockInTime: { $ne: null },
        clockOutTime: null,
    })
        .select('_id user')
        .lean();

    const userIds = [];
    for (const log of logs) {
        const activeSession = await AttendanceSession.findOne({
            attendanceLog: log._id,
            endTime: null,
        })
            .select('_id')
            .lean();
        if (activeSession) {
            userIds.push(String(log.user));
        }
    }
    return userIds;
}

async function countActiveTeaBreaks() {
    const now = getISTNow();
    const cutoff = new Date(now.getTime() - TEA_BREAK_SAFETY_CUTOFF_MS);
    return AnnouncementMessage.countDocuments({
        isTEABreak: true,
        teaBreakStartedAt: { $gte: cutoff, $lte: now },
        teaBreakStoppedAt: null,
    });
}

async function countActiveBreaksByCategory(breakTypes) {
    const today = getISTDateString();
    const userIds = await getTodayClockedInUserIds(today);
    if (!userIds.length) return 0;

    const logs = await AttendanceLog.find({
        user: { $in: userIds },
        attendanceDate: today,
    })
        .select('_id')
        .lean();

    const logIds = logs.map((log) => log._id);
    if (!logIds.length) return 0;

    return BreakLog.countDocuments({
        attendanceLog: { $in: logIds },
        endTime: null,
        breakType: { $in: breakTypes },
    });
}

/**
 * Get employees who have tea break overrun entries for today.
 * Returns each employee with their overrun minutes so admins can review before clearing.
 */
async function getTeaBreakOverruns() {
    const today = getISTDateString();

    // Find all auto-created tea break overrun BreakLog entries for today
    const overrunBreaks = await BreakLog.find({
        isAutoCreatedFromTeaBreak: true,
        reason: { $regex: '^tea_break:' },
        $expr: {
            $gte: [
                { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                today,
            ],
        },
        durationMinutes: { $gt: 0 },
    })
        .select('attendanceLog userId durationMinutes startTime endTime reason')
        .lean();

    if (!overrunBreaks.length) return [];

    // Fetch user names in one query
    const userIds = [...new Set(overrunBreaks.map((b) => String(b.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
        .select('fullName employeeCode')
        .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Deduplicate: one entry per user (keep highest overrun if multiple entries)
    const byUser = new Map();
    for (const b of overrunBreaks) {
        const uid = String(b.userId);
        const existing = byUser.get(uid);
        if (!existing || b.durationMinutes > existing.durationMinutes) {
            byUser.set(uid, b);
        }
    }

    return Array.from(byUser.values()).map((b) => {
        const user = userMap.get(String(b.userId)) || {};
        return {
            userId: String(b.userId),
            fullName: user.fullName || 'Unknown',
            employeeCode: user.employeeCode || '',
            overrunMinutes: b.durationMinutes,
            breakLogId: String(b._id),
            attendanceLogId: String(b.attendanceLog),
        };
    });
}

/**
 * Clear (overwrite/reverse) tea break overrun entries for today.
 * Removes the auto-created BreakLog entries and reverses the unpaidBreakMinutesTaken increment.
 */
async function clearTeaBreakOverruns() {
    const today = getISTDateString();

    const overrunBreaks = await BreakLog.find({
        isAutoCreatedFromTeaBreak: true,
        reason: { $regex: '^tea_break:' },
        $expr: {
            $gte: [
                { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                today,
            ],
        },
        durationMinutes: { $gt: 0 },
    })
        .select('_id attendanceLog userId durationMinutes')
        .lean();

    if (!overrunBreaks.length) {
        return { processedCount: 0, details: [] };
    }

    const details = [];

    for (const b of overrunBreaks) {
        try {
            // Reverse the unpaid break minutes on the attendance log
            await AttendanceLog.findByIdAndUpdate(b.attendanceLog, {
                $inc: { unpaidBreakMinutesTaken: -b.durationMinutes },
            });

            // Delete the overrun break log entry
            await BreakLog.findByIdAndDelete(b._id);

            // Notify the employee that their overrun was cleared
            const user = await User.findById(b.userId).select('fullName role').lean();
            if (user && !['Admin', 'HR'].includes(user.role)) {
                NewNotificationService.createAndEmitNotification({
                    message: 'Your tea break overrun has been cleared by an administrator.',
                    type: 'info',
                    userId: b.userId,
                    userName: user.fullName,
                    recipientType: 'user',
                    category: 'break',
                }).catch(() => {});
            }

            cache.delete(`status:${b.userId}:${today}`);
            cache.delete(`employee_dashboard:${b.userId}:${today}`);

            details.push({ userId: String(b.userId), breakLogId: String(b._id), success: true, overrunMinutes: b.durationMinutes });
        } catch (err) {
            details.push({ userId: String(b.userId), breakLogId: String(b._id), success: false, error: err.message });
        }
    }

    cacheService.invalidateDashboard(today);
    cache.deletePattern('dashboard-summary:*');

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                attendanceDate: today,
                timestamp: getISTNow().toISOString(),
                message: 'Tea break overruns cleared.',
            });
            io.emit('live_attendance_refreshed', { date: today });
        }
    } catch (_) { /* optional */ }

    return {
        processedCount: details.filter((d) => d.success).length,
        failedCount: details.filter((d) => !d.success).length,
        details,
    };
}

async function getClockedInLogsForToday() {
    const today = getISTDateString();
    const logs = await AttendanceLog.find({
        attendanceDate: today,
        clockInTime: { $ne: null },
        clockOutTime: null,
    }).lean();

    if (!logs.length) return [];

    const activeSessions = await AttendanceSession.find({
        attendanceLog: { $in: logs.map((log) => log._id) },
        endTime: null,
    })
        .select('attendanceLog')
        .lean();

    const activeLogIds = new Set(activeSessions.map((session) => String(session.attendanceLog)));
    return logs.filter((log) => activeLogIds.has(String(log._id)));
}

async function getClockedInEmployeesPreview() {
    const logs = await getClockedInLogsForToday();
    if (!logs.length) return [];

    const users = await User.find({ _id: { $in: logs.map((log) => log.user) } })
        .select('fullName employeeCode')
        .lean();
    const userMap = new Map(users.map((user) => [String(user._id), user]));

    return logs.map((log) => {
        const user = userMap.get(String(log.user)) || {};
        return {
            userId: String(log.user),
            fullName: user.fullName || 'Unknown',
            employeeCode: user.employeeCode || '',
            clockInTime: log.clockInTime,
        };
    });
}

/**
 * Employees eligible for a bulk check-in update today: every active
 * non-Admin employee, annotated with today's current check-in state so the
 * admin UI can offer per-employee selection.
 * - hasCheckIn: already checked in today (check-in time can be corrected)
 * - clockOutTime set: already checked out (check-in can still be corrected)
 * - onLeave: approved full-day leave today (selection disabled in UI, rejected here too)
 */
async function getCheckInUpdateCandidates() {
    const today = getISTDateString();
    const dayStart = startOfISTDay(today);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [users, logs, fullDayLeaves] = await Promise.all([
        User.find({ role: { $ne: 'Admin' }, isActive: true })
            .select('fullName employeeCode')
            .sort({ fullName: 1 })
            .lean(),
        AttendanceLog.find({ attendanceDate: today })
            .select('user clockInTime clockOutTime attendanceStatus')
            .lean(),
        LeaveRequest.find({
            status: 'Approved',
            leaveDates: { $elemMatch: { $gte: dayStart, $lt: dayEnd } },
        })
            .select('employee leaveType')
            .lean(),
    ]);

    const logByUserId = new Map(logs.map((log) => [String(log.user), log]));
    const onLeaveUserIds = new Set(
        fullDayLeaves
            .filter((leave) => !isHalfDayLeaveType(leave.leaveType))
            .map((leave) => String(leave.employee))
    );

    return users.map((user) => {
        const log = logByUserId.get(String(user._id));
        const onLeave = onLeaveUserIds.has(String(user._id))
            || log?.attendanceStatus === 'Leave';
        return {
            userId: String(user._id),
            fullName: user.fullName || 'Unknown',
            employeeCode: user.employeeCode || '',
            clockInTime: log?.clockInTime || null,
            clockOutTime: log?.clockOutTime || null,
            hasCheckIn: Boolean(log?.clockInTime),
            onLeave,
        };
    });
}

function parseCheckInTime(checkInTimeInput) {
    const today = getISTDateString();
    const now = getISTNow();

    if (typeof checkInTimeInput !== 'string' || !HH_MM_RE.test(checkInTimeInput.trim())) {
        const error = new Error('Check-in time must be in HH:mm format (IST).');
        error.statusCode = 400;
        throw error;
    }

    const checkInTime = getShiftDateTimeIST(today, checkInTimeInput.trim());
    if (!(checkInTime instanceof Date) || isNaN(checkInTime.getTime())) {
        const error = new Error('Invalid check-in time.');
        error.statusCode = 400;
        throw error;
    }

    if (checkInTime.getTime() > now.getTime() + FUTURE_CHECKOUT_BUFFER_MS) {
        const error = new Error('Check-in time cannot be in the future.');
        error.statusCode = 400;
        throw error;
    }

    return checkInTime;
}

function normalizeSelectedUserIds(userIdsInput) {
    if (!Array.isArray(userIdsInput) || userIdsInput.length === 0) {
        const error = new Error('Select at least one employee to update.');
        error.statusCode = 400;
        throw error;
    }

    const userIds = [...new Set(userIdsInput.map((id) => String(id)))];
    if (userIds.length > 500) {
        const error = new Error('Too many employees selected (max 500).');
        error.statusCode = 400;
        throw error;
    }
    if (userIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
        const error = new Error('One or more selected employee IDs are invalid.');
        error.statusCode = 400;
        throw error;
    }
    return userIds;
}

async function applyRecalculatedStatus(log, user, checkInTime) {
    if (!user?.shiftGroup?.startTime || log.overriddenByAdmin) return;

    const elapsedShiftHours = log.clockOutTime
        ? (new Date(log.clockOutTime).getTime() - checkInTime.getTime()) / (1000 * 60 * 60)
        : null;
    const recalculated = await recalculateLateStatus(
        checkInTime,
        user.shiftGroup,
        null,
        elapsedShiftHours,
        user.featurePermissions?.lateArrivalMarksHalfDay === true
    );

    log.isLate = recalculated.isLate;
    log.isHalfDay = recalculated.isHalfDay;
    log.lateMinutes = recalculated.lateMinutes;
    log.attendanceStatus = recalculated.attendanceStatus;
    if (recalculated.isHalfDay) {
        log.halfDayReasonCode = recalculated.halfDayReasonCode;
        log.halfDayReasonText = recalculated.halfDayReasonText;
        log.halfDaySource = 'AUTO';
    } else if (log.halfDaySource === 'AUTO') {
        log.halfDayReasonCode = null;
        log.halfDayReasonText = '';
        log.halfDaySource = null;
    }
}

async function updateSingleEmployeeCheckIn(user, checkInTime, onLeaveUserIds) {
    const userId = String(user._id);
    const today = getISTDateString();

    if (onLeaveUserIds.has(userId)) {
        return { userId, success: false, error: 'Employee is on approved leave today.' };
    }
    if (!user.shiftGroup?.startTime) {
        return { userId, success: false, error: 'Employee has no shift assigned.' };
    }

    let log = await AttendanceLog.findOne({ user: user._id, attendanceDate: today });
    const previousClockInTime = log?.clockInTime || null;
    let created = false;

    if (log?.attendanceStatus === 'Leave') {
        return { userId, success: false, error: 'Employee is on approved leave today.' };
    }

    if (!log) {
        const shiftDurationMinutes = user.shiftGroup.durationHours != null
            ? Number(user.shiftGroup.durationHours) * 60
            : NaN;
        if (!Number.isFinite(shiftDurationMinutes) || shiftDurationMinutes < 0) {
            return { userId, success: false, error: 'Employee has an invalid shift configuration.' };
        }
        log = await AttendanceLog.create({
            user: user._id,
            attendanceDate: today,
            clockInTime: checkInTime,
            shiftDurationMinutes,
            penaltyMinutes: 0,
            paidBreakMinutesTaken: 0,
            unpaidBreakMinutesTaken: 0,
        });
        created = true;
    }

    const sessions = await AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 });
    const firstSession = sessions[0] || null;

    if (firstSession) {
        if (firstSession.endTime && checkInTime.getTime() >= new Date(firstSession.endTime).getTime()) {
            return { userId, success: false, error: 'Check-in time must be before the first session ends.' };
        }
        if (log.clockOutTime && checkInTime.getTime() >= new Date(log.clockOutTime).getTime()) {
            return { userId, success: false, error: 'Check-in time must be before check-out time.' };
        }
        const firstBreak = await BreakLog.findOne({ attendanceLog: log._id }).sort({ startTime: 1 }).select('startTime').lean();
        if (firstBreak && checkInTime.getTime() >= new Date(firstBreak.startTime).getTime()) {
            return { userId, success: false, error: 'Check-in time must be before the first break starts.' };
        }
        firstSession.startTime = checkInTime;
        await firstSession.save();
    } else {
        // No session yet (absent / not checked in): admin check-in opens today's session.
        await AttendanceSession.create({
            attendanceLog: log._id,
            startTime: checkInTime,
            endTime: log.clockOutTime || null,
        });
    }

    log.clockInTime = checkInTime;
    await applyRecalculatedStatus(log, user, checkInTime);

    if (log.clockOutTime) {
        const [sessionsList, breaksList] = await Promise.all([
            AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 }).lean(),
            BreakLog.find({ attendanceLog: log._id }).lean(),
        ]);
        let totalSessionMinutes = 0;
        sessionsList.forEach((session) => {
            if (session.endTime) totalSessionMinutes += (new Date(session.endTime) - new Date(session.startTime)) / (1000 * 60);
        });
        let totalBreakMinutes = 0;
        breaksList.forEach((breakLog) => {
            if (breakLog.endTime) totalBreakMinutes += (new Date(breakLog.endTime) - new Date(breakLog.startTime)) / (1000 * 60);
        });
        log.totalWorkingHours = Math.max(0, totalSessionMinutes - totalBreakMinutes) / 60;
    }

    await log.save();

    if (!['Admin', 'HR'].includes(user.role)) {
        const timeLabel = formatISTTime(checkInTime, { hour12: true, hour: '2-digit', minute: '2-digit' });
        NewNotificationService.createAndEmitNotification({
            message: created
                ? `You were checked in by an administrator at ${timeLabel}.`
                : `Your check-in time for today was updated by an administrator to ${timeLabel}.`,
            type: 'info',
            userId: user._id,
            userName: user.fullName,
            recipientType: 'user',
            category: 'attendance',
        }).catch(() => {});
    }

    cache.delete(`status:${userId}:${today}`);
    cache.delete(`employee_dashboard:${userId}:${today}`);

    return {
        userId,
        success: true,
        created,
        previousClockInTime: previousClockInTime || null,
        clockInTime: checkInTime.toISOString(),
        attendanceStatus: log.attendanceStatus,
    };
}

async function updateEmployeeCheckIns(checkInTimeInput, userIdsInput) {
    const checkInTime = parseCheckInTime(checkInTimeInput);
    const userIds = normalizeSelectedUserIds(userIdsInput);
    const today = getISTDateString();

    const [users, fullDayLeaves] = await Promise.all([
        User.find({ _id: { $in: userIds }, role: { $ne: 'Admin' }, isActive: true })
            .populate('shiftGroup')
            .lean(),
        LeaveRequest.find({
            status: 'Approved',
            leaveDates: { $elemMatch: { $gte: startOfISTDay(today), $lt: new Date(startOfISTDay(today).getTime() + 24 * 60 * 60 * 1000) } },
        })
            .select('employee leaveType')
            .lean(),
    ]);
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const onLeaveUserIds = new Set(
        fullDayLeaves
            .filter((leave) => !isHalfDayLeaveType(leave.leaveType))
            .map((leave) => String(leave.employee))
    );

    const details = [];
    for (const userId of userIds) {
        const user = userById.get(userId);
        if (!user) {
            details.push({ userId, success: false, error: 'Employee not found or inactive.' });
            continue;
        }
        try {
            details.push(await updateSingleEmployeeCheckIn(user, checkInTime, onLeaveUserIds));
        } catch (err) {
            details.push({ userId, success: false, error: err.message });
        }
    }

    cacheService.invalidateDashboard(today);
    cacheService.invalidateAttendance(null, today);
    cache.deletePattern('dashboard-summary:*');
    cache.deletePattern('live_attendance_overview:*');

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                attendanceDate: today,
                timestamp: getISTNow().toISOString(),
                message: 'Bulk check-in update completed.',
            });
            io.emit('live_attendance_refreshed', { date: today });
        }
    } catch (_) { /* optional */ }

    return {
        processedCount: details.filter((d) => d.success).length,
        failedCount: details.filter((d) => !d.success).length,
        details,
        checkInTime: checkInTime.toISOString(),
    };
}

function parseCheckoutTime(checkoutTimeInput) {
    const today = getISTDateString();
    const now = getISTNow();

    if (checkoutTimeInput == null || checkoutTimeInput === '') {
        return now;
    }

    if (typeof checkoutTimeInput !== 'string') {
        const error = new Error('Checkout time must be a HH:mm string in IST.');
        error.statusCode = 400;
        throw error;
    }

    const trimmed = checkoutTimeInput.trim();
    if (!HH_MM_RE.test(trimmed)) {
        const error = new Error('Checkout time must be in HH:mm format (IST).');
        error.statusCode = 400;
        throw error;
    }

    const checkoutTime = getShiftDateTimeIST(today, trimmed);
    if (!(checkoutTime instanceof Date) || isNaN(checkoutTime.getTime())) {
        const error = new Error('Invalid checkout time.');
        error.statusCode = 400;
        throw error;
    }

    if (checkoutTime.getTime() > now.getTime() + FUTURE_CHECKOUT_BUFFER_MS) {
        const error = new Error('Checkout time cannot be in the future.');
        error.statusCode = 400;
        throw error;
    }

    return checkoutTime;
}

async function endActiveBreakAt(activeBreak, log, breakEndTime) {
    const startMs = new Date(activeBreak.startTime).getTime();
    const endMs = Math.max(startMs, new Date(breakEndTime).getTime());
    const resolvedEnd = new Date(endMs);
    const currentBreakDuration = Math.max(0, Math.round((endMs - startMs) / (1000 * 60)));

    let penalty = 0;
    let paidBreakToAdd = 0;
    let unpaidBreakToAdd = 0;

    if (activeBreak.breakType === 'Paid') {
        const user = await User.findById(log.user).populate('shiftGroup').lean();
        const paidBreakAllowance = user?.shiftGroup?.paidBreakMinutes || PAID_BREAK_ALLOWANCE_MINUTES;
        const remainingPaidAllowance = paidBreakAllowance - (log.paidBreakMinutesTaken || 0);
        paidBreakToAdd = currentBreakDuration;
        if (currentBreakDuration > Math.max(0, remainingPaidAllowance)) {
            penalty = currentBreakDuration - Math.max(0, remainingPaidAllowance);
        }
    } else if (activeBreak.breakType === 'Unpaid' || activeBreak.breakType === 'Extra') {
        const allowance = activeBreak.breakType === 'Unpaid'
            ? UNPAID_BREAK_ALLOWANCE_MINUTES
            : EXTRA_BREAK_ALLOWANCE_MINUTES;
        unpaidBreakToAdd = currentBreakDuration;
        if (currentBreakDuration > allowance) {
            penalty = currentBreakDuration - allowance;
        }
    }

    await BreakLog.findByIdAndUpdate(activeBreak._id, {
        $set: { endTime: resolvedEnd, durationMinutes: currentBreakDuration },
    });

    const updatePayload = { $inc: {} };
    if (penalty > 0) updatePayload.$inc.penaltyMinutes = penalty;
    if (paidBreakToAdd > 0) updatePayload.$inc.paidBreakMinutesTaken = paidBreakToAdd;
    if (unpaidBreakToAdd > 0) updatePayload.$inc.unpaidBreakMinutesTaken = unpaidBreakToAdd;
    if (Object.keys(updatePayload.$inc).length > 0) {
        await AttendanceLog.findByIdAndUpdate(log._id, updatePayload);
        if (paidBreakToAdd > 0) log.paidBreakMinutesTaken = (log.paidBreakMinutesTaken || 0) + paidBreakToAdd;
        if (unpaidBreakToAdd > 0) log.unpaidBreakMinutesTaken = (log.unpaidBreakMinutesTaken || 0) + unpaidBreakToAdd;
    }
}

async function checkoutSingleEmployee(log, checkoutTime, gracePeriodMinutes, performedByUserId) {
    const userId = String(log.user);
    const today = log.attendanceDate;
    const clockInMs = new Date(log.clockInTime).getTime();

    if (checkoutTime.getTime() <= clockInMs) {
        return { userId, success: false, error: 'Checkout time is not after clock-in time.' };
    }

    const activeBreaks = await BreakLog.find({
        $or: [
            { attendanceLog: log._id, endTime: null },
            { userId: log.user, endTime: null, isAutoBreak: true },
        ],
    }).lean();

    for (const activeBreak of activeBreaks) {
        await endActiveBreakAt(activeBreak, log, checkoutTime);
    }

    const openSession = await AttendanceSession.findOne({
        attendanceLog: log._id,
        endTime: null,
    }).sort({ startTime: -1 });

    if (!openSession) {
        return { userId, success: false, error: 'No active session found.' };
    }

    if (checkoutTime.getTime() <= new Date(openSession.startTime).getTime()) {
        return { userId, success: false, error: 'Checkout time is not after session start.' };
    }

    await AttendanceSession.findByIdAndUpdate(openSession._id, {
        $set: { endTime: checkoutTime, logoutType: 'MANUAL' },
    });

    const [sessionsList, breaksList] = await Promise.all([
        AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 }).lean(),
        BreakLog.find({ attendanceLog: log._id }).lean(),
    ]);

    let totalWorkingMinutes = 0;
    let totalBreakMinutes = 0;
    sessionsList.forEach((session) => {
        if (session.endTime) totalWorkingMinutes += (session.endTime - session.startTime) / (1000 * 60);
    });
    breaksList.forEach((breakLog) => {
        if (breakLog.endTime) totalBreakMinutes += (breakLog.endTime - breakLog.startTime) / (1000 * 60);
    });
    const netWorkingMinutes = Math.max(0, totalWorkingMinutes - totalBreakMinutes);
    const totalWorkingHours = netWorkingMinutes / 60;

    const updateData = {
        clockOutTime: checkoutTime,
        totalWorkingHours,
        logoutType: 'MANUAL',
        autoLogoutReason: null,
    };

    if (!log.overriddenByAdmin) {
        const withinGracePeriod = (log.lateMinutes || 0) <= gracePeriodMinutes;
        const elapsedShiftHours = (checkoutTime.getTime() - clockInMs) / (1000 * 60 * 60);

        if (elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY) {
            updateData.isHalfDay = false;
            updateData.isLate = false;
            updateData.attendanceStatus = 'Absent';
            updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
            updateData.halfDayReasonText = `Less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours total shift time (${elapsedShiftHours.toFixed(1)} hours elapsed). Minimum ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs for half-day, ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hrs for full day.`;
            updateData.halfDaySource = 'AUTO';
        } else if (elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY) {
            updateData.isHalfDay = true;
            updateData.isLate = withinGracePeriod ? false : log.isLate;
            updateData.attendanceStatus = 'Half-day';
            updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
            updateData.halfDayReasonText = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
            updateData.halfDaySource = 'AUTO';
        }
    }

    await AttendanceLog.findByIdAndUpdate(log._id, { $set: updateData });

    const earlyCheckoutUpdate = { status: 'Approved', reviewedAt: getISTNow() };
    if (performedByUserId) earlyCheckoutUpdate.reviewedBy = performedByUserId;
    await EarlyCheckoutRequest.updateMany(
        { attendanceLog: log._id, status: 'Pending' },
        { $set: earlyCheckoutUpdate }
    );

    const user = await User.findById(log.user).select('fullName role').lean();
    if (user && !['Admin', 'HR'].includes(user.role)) {
        const timeLabel = formatISTTime(checkoutTime, { hour12: true, hour: '2-digit', minute: '2-digit' });
        NewNotificationService.createAndEmitNotification({
            message: `You were checked out by an administrator at ${timeLabel}.`,
            type: 'info',
            userId: log.user,
            userName: user.fullName,
            recipientType: 'user',
            category: 'attendance',
        }).catch(() => {});
    }

    cache.delete(`status:${userId}:${today}`);
    cache.delete(`employee_dashboard:${userId}:${today}`);

    return {
        userId,
        success: true,
        attendanceStatus: updateData.attendanceStatus || log.attendanceStatus,
        totalWorkingHours,
    };
}

async function checkoutAllEmployees(checkoutTimeInput, performedByUserId) {
    const checkoutTime = parseCheckoutTime(checkoutTimeInput);
    const logs = await getClockedInLogsForToday();
    if (!logs.length) {
        return { processedCount: 0, failedCount: 0, details: [], checkoutTime: checkoutTime.toISOString() };
    }

    const gracePeriodMinutes = await getGracePeriodMinutes();
    const details = [];

    for (const log of logs) {
        try {
            const result = await checkoutSingleEmployee(log, checkoutTime, gracePeriodMinutes, performedByUserId);
            details.push(result);
        } catch (err) {
            details.push({
                userId: String(log.user),
                success: false,
                error: err.message,
            });
        }
    }

    const today = getISTDateString();
    cacheService.invalidateDashboard(today);
    cacheService.invalidateAttendance(null, today);
    cache.deletePattern('dashboard-summary:*');
    cache.deletePattern('live_attendance_overview:*');

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                attendanceDate: today,
                timestamp: getISTNow().toISOString(),
                message: 'Bulk checkout completed.',
            });
            io.emit('live_attendance_refreshed', { date: today });
        }
    } catch (_) { /* optional */ }

    return {
        processedCount: details.filter((d) => d.success).length,
        failedCount: details.filter((d) => !d.success).length,
        details,
        checkoutTime: checkoutTime.toISOString(),
    };
}

async function getBulkActionPreview() {
    const [overview, teaBreakCount, lunchBreakCount, otherBreakCount, overrunList, clockedInEmployees, checkInCandidates] = await Promise.all([
        getLiveAttendanceOverview({ leaveRange: 'today' }),
        countActiveTeaBreaks(),
        countActiveBreaksByCategory(['Paid']),
        countActiveBreaksByCategory(['Unpaid', 'Extra']),
        getTeaBreakOverruns(),
        getClockedInEmployeesPreview(),
        getCheckInUpdateCandidates(),
    ]);

    return {
        refresh_live_attendance: {
            label: 'Refresh live attendance',
            description: 'Invalidate caches and reload today\'s live attendance snapshot.',
            affectedCount: overview.counts?.present ?? 0,
            meta: overview.counts,
        },
        stop_tea_breaks: {
            label: 'Stop all tea breaks',
            description: 'End company-wide tea break announcements for all clocked-in employees.',
            affectedCount: teaBreakCount,
        },
        end_lunch_breaks: {
            label: 'End all lunch breaks',
            description: 'Force-end active paid (lunch) breaks for employees still on break.',
            affectedCount: lunchBreakCount,
        },
        end_other_breaks: {
            label: 'End all other breaks',
            description: 'Force-end active unpaid and extra breaks.',
            affectedCount: otherBreakCount,
        },
        overwrite_tea_break_overruns: {
            label: 'Clear tea break overruns',
            description: 'Remove auto-applied overrun penalties for employees who exceeded tea break time today. This reverses the unpaid break minutes added.',
            affectedCount: overrunList.length,
            overrunDetails: overrunList,
        },
        checkout_all_employees: {
            label: 'Check out all employees',
            description: 'Check out every employee still clocked in today at a time you choose. Active breaks are ended automatically. Attendance status still follows elapsed shift hours.',
            affectedCount: clockedInEmployees.length,
            employees: clockedInEmployees,
        },
        update_employee_checkin: {
            label: 'Update employee check-in',
            description: 'Set a new check-in time for today for the employees you select. Employees who have not checked in yet will be checked in at that time. Late status is recalculated from the new time.',
            affectedCount: checkInCandidates.filter((emp) => emp.hasCheckIn).length,
            employees: checkInCandidates,
        },
    };
}

async function endSingleActiveBreak(activeBreak, log, initiatedByUserId) {
    const breakEndTime = getISTNow();
    const currentBreakDuration = Math.round(
        (breakEndTime - new Date(activeBreak.startTime)) / (1000 * 60)
    );

    let penalty = 0;
    let paidBreakToAdd = 0;
    let unpaidBreakToAdd = 0;

    if (activeBreak.breakType === 'Paid') {
        const user = await User.findById(log.user).populate('shiftGroup').lean();
        const paidBreakAllowance = user?.shiftGroup?.paidBreakMinutes || PAID_BREAK_ALLOWANCE_MINUTES;
        const remainingPaidAllowance = paidBreakAllowance - (log.paidBreakMinutesTaken || 0);
        paidBreakToAdd = currentBreakDuration;
        if (currentBreakDuration > Math.max(0, remainingPaidAllowance)) {
            penalty = currentBreakDuration - Math.max(0, remainingPaidAllowance);
        }
    } else if (activeBreak.breakType === 'Unpaid' || activeBreak.breakType === 'Extra') {
        const allowance = activeBreak.breakType === 'Unpaid'
            ? UNPAID_BREAK_ALLOWANCE_MINUTES
            : EXTRA_BREAK_ALLOWANCE_MINUTES;
        unpaidBreakToAdd = currentBreakDuration;
        if (currentBreakDuration > allowance) {
            penalty = currentBreakDuration - allowance;
        }
    }

    await BreakLog.findByIdAndUpdate(activeBreak._id, {
        $set: { endTime: breakEndTime, durationMinutes: currentBreakDuration },
    });

    const updatePayload = { $inc: {} };
    if (penalty > 0) updatePayload.$inc.penaltyMinutes = penalty;
    if (paidBreakToAdd > 0) updatePayload.$inc.paidBreakMinutesTaken = paidBreakToAdd;
    if (unpaidBreakToAdd > 0) updatePayload.$inc.unpaidBreakMinutesTaken = unpaidBreakToAdd;
    if (Object.keys(updatePayload.$inc).length > 0) {
        await AttendanceLog.findByIdAndUpdate(log._id, updatePayload);
    }

    const user = await User.findById(log.user).select('fullName role').lean();
    const today = log.attendanceDate;

    if (user && !['Admin', 'HR'].includes(user.role)) {
        NewNotificationService.createAndEmitNotification({
            message: `Your ${activeBreak.breakType} break was ended by an administrator.`,
            type: 'info',
            userId: log.user,
            userName: user.fullName,
            recipientType: 'user',
            category: 'break',
        }).catch(() => {});
    }

    cache.delete(`status:${log.user}:${today}`);
    cache.delete(`employee_dashboard:${log.user}:${today}`);

    return { userId: String(log.user), breakId: String(activeBreak._id), breakType: activeBreak.breakType };
}

async function endBreaksByCategory(breakTypes) {
    const today = getISTDateString();
    const userIds = await getTodayClockedInUserIds(today);
    if (!userIds.length) {
        return { processedCount: 0, details: [] };
    }

    const logs = await AttendanceLog.find({
        user: { $in: userIds },
        attendanceDate: today,
    }).lean();

    const logIds = logs.map((log) => log._id);
    const activeBreaks = await BreakLog.find({
        attendanceLog: { $in: logIds },
        endTime: null,
        breakType: { $in: breakTypes },
    }).lean();

    const logById = new Map(logs.map((log) => [String(log._id), log]));
    const details = [];

    for (const activeBreak of activeBreaks) {
        const log = logById.get(String(activeBreak.attendanceLog));
        if (!log) continue;
        try {
            const result = await endSingleActiveBreak(activeBreak, log);
            details.push({ ...result, success: true });
        } catch (err) {
            details.push({
                breakId: String(activeBreak._id),
                success: false,
                error: err.message,
            });
        }
    }

    cacheService.invalidateDashboard(today);
    cache.deletePattern('dashboard-summary:*');

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                attendanceDate: today,
                timestamp: getISTNow().toISOString(),
                message: 'Bulk break action completed.',
            });
            io.emit('live_attendance_refreshed', { date: today });
        }
    } catch (_) {
        /* optional */
    }

    return {
        processedCount: details.filter((d) => d.success).length,
        failedCount: details.filter((d) => !d.success).length,
        details,
    };
}

async function refreshLiveAttendance() {
    const today = getISTDateString();
    cacheService.invalidateDashboard(today);
    cacheService.invalidateAttendance(null, today);
    cache.deletePattern('dashboard-summary:*');

    const overview = await getLiveAttendanceOverview({ leaveRange: 'today' });

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('live_attendance_refreshed', {
                date: today,
                counts: overview.counts,
                lastUpdated: overview.lastUpdated,
            });
        }
    } catch (_) {
        /* optional */
    }

    return {
        processedCount: 1,
        overview: {
            counts: overview.counts,
            lastUpdated: overview.lastUpdated,
        },
    };
}

async function executeBulkAction(action, performedByUserId, options = {}) {
    if (!VALID_ACTIONS.has(action)) {
        const error = new Error(`Invalid action: ${action}`);
        error.statusCode = 400;
        throw error;
    }

    let result;

    switch (action) {
        case 'refresh_live_attendance':
            result = await refreshLiveAttendance();
            break;
        case 'stop_tea_breaks':
            result = await stopAllActiveTeaBreaks();
            cacheService.invalidateDashboard(getISTDateString());
            result = {
                processedCount: result.stoppedCount ?? 0,
                details: result.results ?? [],
            };
            break;
        case 'end_lunch_breaks':
            result = await endBreaksByCategory(['Paid']);
            break;
        case 'end_other_breaks':
            result = await endBreaksByCategory(['Unpaid', 'Extra']);
            break;
        case 'overwrite_tea_break_overruns':
            result = await clearTeaBreakOverruns();
            break;
        case 'checkout_all_employees':
            result = await checkoutAllEmployees(options.checkoutTime, performedByUserId);
            break;
        case 'update_employee_checkin':
            result = await updateEmployeeCheckIns(options.checkInTime, options.userIds);
            break;
        default:
            result = { processedCount: 0 };
    }

    try {
        const logAction = require('./logAction');
        await logAction(performedByUserId, 'BULK_ATTENDANCE_ACTION', {
            action,
            processedCount: result.processedCount ?? 0,
            checkoutTime: result.checkoutTime || options.checkoutTime || null,
            checkInTime: result.checkInTime || options.checkInTime || null,
            userIds: Array.isArray(options.userIds) ? options.userIds.map(String) : null,
            details: `Bulk attendance action "${action}" executed.`,
        });
    } catch (_) {
        /* audit optional */
    }

    return {
        success: true,
        action,
        ...result,
    };
}

module.exports = {
    VALID_ACTIONS,
    getBulkActionPreview,
    executeBulkAction,
    getTeaBreakOverruns,
};
