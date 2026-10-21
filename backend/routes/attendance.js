const express = require('express');
const mongoose = require('mongoose');
const authenticateToken = require('../middleware/authenticateToken');
const { geofencingMiddleware } = require('../middleware/geofencingMiddleware');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const ExtraBreakRequest = require('../models/ExtraBreakRequest');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const Setting = require('../models/Setting');
const EarlyCheckoutRequest = require('../models/EarlyCheckoutRequest');
const NewNotificationService = require('../services/NewNotificationService');
const logAction = require('../services/logAction');
const { getUserDailyStatus, computeCalculatedLogoutTime } = require('../services/dailyStatusService');
const LeavePolicyService = require('../services/LeavePolicyService');
const cache = require('../utils/cache');
const { getISTNow, getISTDateString, parseISTDate, startOfISTDay, endOfISTDay, getShiftDateTimeIST, formatISTTime, getAttendanceDate } = require('../utils/istTime');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const { isHalfDayLeaveType } = require('../utils/halfDayLeave');

const router = express.Router();
const requireLiveAttendanceAccess = require('../middleware/requireLiveAttendanceAccess');
const { getLiveAttendanceOverview } = require('../services/liveAttendanceService');
const { getMusterRoll } = require('../services/AttendanceSummaryService');
const isAdminOrHr = require('../middleware/requireAdminOrHr');

// GET /api/attendance/muster — one-pass month grid for every active employee
router.get('/muster', authenticateToken, isAdminOrHr, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required (format: YYYY-MM-DD).' });
        }

        const cacheKey = `muster_roll:${startDate}:${endDate}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const roll = await getMusterRoll(startDate, endDate);
        cache.set(cacheKey, roll, 20000);
        return res.json(roll);
    } catch (error) {
        console.error('[MUSTER] Failed to build muster roll:', error);
        return res.status(500).json({ error: 'Failed to build the muster roll.' });
    }
});

// GET /api/attendance/live-overview — view-only real-time attendance board (permission-gated)
router.get('/live-overview', authenticateToken, requireLiveAttendanceAccess, async (req, res) => {
    try {
        const leaveRange = req.query.leaveRange || 'today';
        const cacheKey = `live_attendance_overview:${leaveRange}`;
        const cached = cache.get(cacheKey);
        if (cached !== null) {
            return res.json(cached);
        }

        const overview = await getLiveAttendanceOverview({ leaveRange });
        cache.set(cacheKey, overview, 15000);
        return res.json(overview);
    } catch (error) {
        console.error('Error fetching live attendance overview:', error);
        return res.status(500).json({ error: 'Failed to fetch live attendance overview.' });
    }
});

// GET /api/attendance/status
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { date } = req.query;

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ error: 'A valid `date` query parameter is required in YYYY-MM-DD format.' });
        }

        // PHASE 3 OPTIMIZATION: Safe server-side caching
        // Cache key: status:userId:date
        // TTL: 30 seconds (short enough to prevent stale data, long enough to reduce load)
        const cacheKey = `status:${userId}:${date}`;
        const cached = cache.get(cacheKey);
        
        if (cached !== null) {
            return res.json(cached);
        }

        const dailyStatus = await getUserDailyStatus(userId, date);
        
        // Cache the result (30 second TTL)
        cache.set(cacheKey, dailyStatus, 30000);
        
        return res.json(dailyStatus);
    } catch (error) {
        console.error("Error fetching status:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/clock-in', authenticateToken, geofencingMiddleware, async (req, res) => {
    const { userId } = req.user;
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    const todayStr = getAttendanceDate(userId);
    const todayStart = startOfISTDay(todayStr);
    const todayEnd = endOfISTDay(todayStr);
    try {
        const [user, todayLog, GRACE_PERIOD_MINUTES, approvedHalfDayLeaveDoc] = await Promise.all([
            User.findById(userId).populate('shiftGroup'),
            AttendanceLog.findOne({ user: userId, attendanceDate: todayStr }),
            getGracePeriodMinutes(),
            LeaveRequest.findOne({
                employee: userId,
                status: 'Approved',
                leaveType: { $in: ['Half Day - First Half', 'Half Day - Second Half'] },
                leaveDates: { $elemMatch: { $gte: todayStart, $lte: todayEnd } }
            }).select('_id leaveType').lean()
        ]);

        if (!user) { return res.status(404).json({ error: 'User not found.' }); }
        if (!user.shiftGroup) { return res.status(400).json({ error: 'Cannot clock in. You have no shift assigned.' }); }

        const shiftDurationMinutes = user.shiftGroup.durationHours != null
            ? Number(user.shiftGroup.durationHours) * 60
            : NaN;
        if (!Number.isFinite(shiftDurationMinutes) || shiftDurationMinutes < 0) {
            console.error('[Clock-In] Invalid shift duration for user:', userId, 'durationHours:', user.shiftGroup.durationHours);
            return res.status(400).json({ error: 'Cannot clock in. Invalid shift configuration.' });
        }
        
        // PHASE 6: Block check-in only for approved FULL-DAY leave (half-day employees work the other half)
        if (todayLog && todayLog.attendanceStatus === 'Leave') {
            if (todayLog.leaveRequest) {
                const leaveRequest = await LeaveRequest.findById(todayLog.leaveRequest).select('status leaveType').lean();
                if (leaveRequest && leaveRequest.status === 'Approved' && !isHalfDayLeaveType(leaveRequest.leaveType)) {
                    return res.status(400).json({
                        error: 'Cannot clock in. You have an approved leave for today. Please contact HR if you need to work on a leave day.'
                    });
                }
            }
        }
        
        let attendanceLog = todayLog;
        if (!attendanceLog) {
            try {
                const createPayload = {
                    user: userId,
                    attendanceDate: todayStr,
                    clockInTime: getISTNow(),
                    shiftDurationMinutes,
                    penaltyMinutes: 0,
                    paidBreakMinutesTaken: 0,
                    unpaidBreakMinutesTaken: 0,
                };
                if (approvedHalfDayLeaveDoc?._id) {
                    createPayload.leaveRequest = approvedHalfDayLeaveDoc._id;
                }
                attendanceLog = await AttendanceLog.create(createPayload);
            } catch (createErr) {
                if (createErr.code === 11000) {
                    // Duplicate key: another request created the log (race). Reload and continue.
                    attendanceLog = await AttendanceLog.findOne({ user: userId, attendanceDate: todayStr });
                    if (!attendanceLog) {
                        console.error('[Clock-In] Duplicate key but log not found:', createErr.message);
                        return res.status(500).json({ error: 'Internal server error' });
                    }
                } else {
                    console.error('[Clock-In] AttendanceLog.create failed:', createErr.name, createErr.message, createErr.code || '');
                    if (createErr.name === 'ValidationError') {
                        console.error('[Clock-In] Validation errors:', JSON.stringify(createErr.errors || {}));
                    }
                    return res.status(500).json({ error: 'Internal server error' });
                }
            }
        }
        
        const activeSession = await AttendanceSession.findOne({ attendanceLog: attendanceLog._id, endTime: null });
        if (activeSession) { return res.status(400).json({ error: 'You are already clocked in.' }); }

        const priorSessionCount = await AttendanceSession.countDocuments({ attendanceLog: attendanceLog._id });
        const isFirstCheckIn = priorSessionCount === 0;
        
        let newSession;
        try {
            newSession = await AttendanceSession.create({
                attendanceLog: attendanceLog._id,
                startTime: getISTNow()
            });
        } catch (sessionErr) {
            console.error('[Clock-In] AttendanceSession.create failed:', sessionErr.name, sessionErr.message, sessionErr.code || '');
            if (sessionErr.name === 'ValidationError') {
                console.error('[Clock-In] Session validation errors:', JSON.stringify(sessionErr.errors || {}));
            }
            return res.status(500).json({ error: 'Internal server error' });
        }

        const clockInTime = newSession.startTime;

        // --- ANALYTICS: Check for late login and update status ---
        // CRITICAL FIX: Use FIRST check-in time for late calculation, not latest
        let clockInTimeForLateCalc;
        
        if (isFirstCheckIn) {
            clockInTimeForLateCalc = getISTNow();
        } else {
            // Subsequent check-in: get first session's startTime (authoritative first check-in)
            const allSessions = await AttendanceSession.find({ 
                attendanceLog: attendanceLog._id 
            }).sort({ startTime: 1 }).limit(1).lean();
            
            if (allSessions.length > 0 && allSessions[0].startTime) {
                // Use first session's startTime (the actual first check-in of the day)
                clockInTimeForLateCalc = new Date(allSessions[0].startTime);
            } else {
                // Fallback: use stored clockInTime (should not happen, but defensive)
                clockInTimeForLateCalc = attendanceLog.clockInTime ? new Date(attendanceLog.clockInTime) : getISTNow();
            }
        }
        
        // Use the proper timezone-aware function to get shift start time
        const shiftStartTime = getShiftDateTimeIST(clockInTimeForLateCalc, user.shiftGroup.startTime);
        
        let lateMinutes = Math.max(0, Math.floor((clockInTimeForLateCalc - shiftStartTime) / (1000 * 60)));
        
        let isLate = false;
        let isHalfDay = false;
        let attendanceStatus = 'On-time';

        if (process.env.NODE_ENV !== 'production') console.log(`[Grace Period] Using grace period: ${GRACE_PERIOD_MINUTES} minutes for clock-in (lateMinutes: ${lateMinutes}, isFirstCheckIn: ${isFirstCheckIn})`);

        // FIXED PRIORITY LOGIC:
        // At clock-in, we don't know working hours yet, so we apply grace period logic
        // The insufficient hours check will happen at clock-out and may override this
        // CRITICAL: Only recalculate late status if this is the FIRST check-in
        // Subsequent check-ins should NOT affect late/half-day status
        let halfDayReasonCode = null;
        let halfDayReasonText = '';
        let halfDaySource = null;
        
        if (isFirstCheckIn) {
            // Only calculate late status for first check-in.
            // RULE: Do not mark half-day until checkout. Today before checkout -> always Present (On-time).
            if (lateMinutes <= GRACE_PERIOD_MINUTES) {
                isLate = false;
                isHalfDay = false;
                attendanceStatus = 'On-time';
                halfDayReasonCode = null;
                halfDayReasonText = '';
                halfDaySource = null;
            } else {
                // Beyond grace period: track late for clock-out, but do NOT mark half-day until checkout
                isLate = true;
                isHalfDay = false;
                attendanceStatus = 'On-time';
                halfDayReasonCode = null;
                halfDayReasonText = '';
                halfDaySource = null;
            }
            
            const updateData = {
                clockInTime,
                isLate,
                isHalfDay,
                lateMinutes,
                attendanceStatus
            };
            if (!attendanceLog.shiftDurationMinutes) {
                updateData.shiftDurationMinutes = shiftDurationMinutes;
            }
            if (!attendanceLog.leaveRequest && approvedHalfDayLeaveDoc?._id) {
                updateData.leaveRequest = approvedHalfDayLeaveDoc._id;
            }
            if (!attendanceLog.overriddenByAdmin) {
                updateData.halfDayReasonCode = null;
                updateData.halfDayReasonText = '';
                updateData.halfDaySource = null;
            }
            await AttendanceLog.findByIdAndUpdate(attendanceLog._id, updateData);
        } else {
            // Subsequent check-in: Do NOT update late/half-day status
            // The status should remain based on the first check-in
            // Use existing values from the log
            isLate = attendanceLog.isLate || false;
            isHalfDay = attendanceLog.isHalfDay || false;
            attendanceStatus = attendanceLog.attendanceStatus || 'On-time';
            lateMinutes = attendanceLog.lateMinutes || 0;
            if (process.env.NODE_ENV !== 'production') console.log(`[Clock-In] Subsequent check-in detected. Preserving existing late status: ${attendanceStatus} (lateMinutes: ${lateMinutes})`);
        }

        // Track late login for weekly monitoring
        // PHASE 2 OPTIMIZATION: Parallelize late tracking queries
        let weeklyLateInfo = null;
        if (isLate) {
            try {
                const { trackLateLogin, getWeeklyLateStats } = require('../services/weeklyLateTrackingService');
                // Parallelize tracking and stats fetch
                const [trackingRecord, stats] = await Promise.all([
                    trackLateLogin(userId, todayStr),
                    getWeeklyLateStats(userId)
                ]);
                weeklyLateInfo = {
                    currentWeekLateCount: stats.currentWeekLateCount,
                    lateDates: stats.lateDates
                };
            } catch (error) {
                console.error('Error tracking late login:', error);
                // Don't fail the clock-in if tracking fails
            }
        }

        // Send email notification if late
        if (isLate) {
            try {
                const { sendLateLoginNotification } = require('../services/analyticsEmailService');
                await sendLateLoginNotification(user, {
                    attendanceDate: todayStr,
                    clockInTime: clockInTime,
                    lateMinutes: lateMinutes,
                    isHalfDay: isHalfDay
                });
            } catch (error) {
                console.error('Error sending late login notification:', error);
            }
        }
        
        // --- NOTIFICATION ---
        // Notify admins about user clock-in using the new service
        NewNotificationService.notifyCheckIn(userId, user.fullName)
            .catch(err => console.error('Error sending clock-in notification to admins:', err));
        
        // Send confirmation notification to the user
        NewNotificationService.createAndEmitNotification({
            message: `You have successfully clocked in at ${formatISTTime(clockInTime, { hour12: true })}.`,
            type: 'success',
            userId,
            userName: user.fullName,
            recipientType: 'user',
            category: 'attendance',
            priority: 'medium',
        }).catch(err => console.error('Error sending clock-in confirmation to user:', err));
        
        const responsePayload = { 
            message: 'Clocked in successfully!', 
            session: newSession,
            analytics: {
                isLate,
                isHalfDay,
                lateMinutes,
                attendanceStatus
            }
        };

        // If weeklyLateInfo indicates user has been late 3 or more times this week,
        // include a flag so frontend can show a warning popup (do NOT lock the account).
        if (weeklyLateInfo && weeklyLateInfo.currentWeekLateCount >= 3) {
            responsePayload.weeklyLateWarning = {
                showPopup: true,
                lateCount: weeklyLateInfo.currentWeekLateCount,
                lateDates: weeklyLateInfo.lateDates
            };
        }

        // PHASE 4 OPTIMIZATION: Cache invalidation on mutation
        // Invalidate status cache for this user and date
        const cacheKey = `status:${userId}:${todayStr}`;
        cache.delete(cacheKey);
        // Also invalidate dashboard summary cache (utils/cache)
        cache.deletePattern(`dashboard-summary:*`);
        cache.deletePattern('live_attendance_overview:*');
        // CRITICAL: Invalidate real dashboard cache (cacheService stores dashboard_${date})
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(todayStr);

        // Emit Socket.IO event for real-time updates (replaces polling)
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: attendanceLog._id,
                    userId: userId,
                    attendanceDate: todayStr,
                    attendanceStatus: attendanceStatus,
                    isHalfDay: isHalfDay,
                    isLate: isLate,
                    lateMinutes: lateMinutes,
                    clockInTime: newSession.startTime,
                    clockOutTime: null,
                    timestamp: getISTNow().toISOString(),
                    message: `${user.fullName} clocked in`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for clock-in ${attendanceLog._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        cache.delete(`employee_dashboard:${userId}:${todayStr}`);

        try {
            const { autoDismissTeaBreakIfIneligible } = require('../services/teaBreakService');
            await autoDismissTeaBreakIfIneligible(userId);
        } catch (teaBreakErr) {
            console.error('[Clock-In] Tea break eligibility check failed:', teaBreakErr.message);
        }

        res.status(201).json(responsePayload);
    } catch (error) {
        // Safe logging: no stack in production; always return JSON
        console.error('[Clock-In] Error:', error.name || 'Error', error.message || String(error));
        if (error.code) console.error('[Clock-In] Code:', error.code);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

router.post('/clock-out', authenticateToken, async (req, res) => {
    const { userId } = req.user;
    const today = getAttendanceDate(userId);
    try {
        // PHASE 2 OPTIMIZATION: Parallelize independent queries
        // Batch 1: Log + Breaks check (can run in parallel)
        const log = await AttendanceLog.findOne({ user: userId, attendanceDate: today });
        if (!log) return res.status(400).json({ error: 'Cannot find attendance log. You must clock in first.' });
        
        const [activeBreak, activeAutoBreak] = await Promise.all([
            BreakLog.findOne({ attendanceLog: log._id, endTime: null }),
            BreakLog.findOne({ 
                userId, 
                endTime: null, 
                isAutoBreak: true 
            })
        ]);
        
        if (activeBreak) return res.status(400).json({ error: 'You must end your break before clocking out.' });
        if (activeAutoBreak) return res.status(400).json({ error: 'You must end your auto-break before clocking out.' });

        // HARD BLOCK: If current_time < required_logout_time, checkout MUST NOT occur. No exception.
        // Only way to checkout early is via EarlyCheckoutRequest + admin approval.
        const todayStart = startOfISTDay(today);
        const todayEnd = endOfISTDay(today);
        const [sessionsForLogout, breaksForLogout, userWithShift, approvedHalfDayLeaveDoc] = await Promise.all([
            AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 }),
            BreakLog.find({ attendanceLog: log._id }),
            User.findById(userId).populate('shiftGroup').lean(),
            LeaveRequest.findOne({
                employee: userId,
                status: 'Approved',
                leaveType: { $in: ['Half Day - First Half', 'Half Day - Second Half'] },
                leaveDates: { $elemMatch: { $gte: todayStart, $lte: todayEnd } }
            }).lean()
        ]);
        const approvedHalfDayLeave = !!approvedHalfDayLeaveDoc;
        const logoutResult = computeCalculatedLogoutTime(sessionsForLogout, breaksForLogout, log, userWithShift?.shiftGroup || null, null, approvedHalfDayLeave);
        const now = getISTNow();
        if (logoutResult) {
            const requiredAt = new Date(logoutResult.requiredLogoutTime);
            if (now.getTime() < requiredAt.getTime()) {
                return res.status(400).json({
                    error: 'Early checkout is not allowed. You must submit an early checkout request and wait for admin approval.',
                    code: 'EARLY_CHECKOUT_APPROVAL_REQUIRED'
                });
            }
        }

        const { earlyCheckoutNote } = req.body || {};
        const clockOutTime = now;
        const updatedSession = await AttendanceSession.findOneAndUpdate(
            { attendanceLog: log._id, endTime: null },
            { 
                $set: { 
                    endTime: clockOutTime,
                    logoutType: 'MANUAL' // Mark as manual logout
                } 
            },
            { new: true, sort: { startTime: -1 } }
        );
        if (!updatedSession) return res.status(400).json({ error: 'You are not currently clocked in.' });
        
        // PHASE 2 OPTIMIZATION: Parallelize independent queries
        // Batch 2: Sessions + Breaks (for calculations) - can run in parallel
        const [sessions, breaks] = await Promise.all([
            AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 }),
            BreakLog.find({ attendanceLog: log._id })
        ]);
        
        let totalWorkingMinutes = 0;
        let totalBreakMinutes = 0;
        
        // Calculate total session time
        sessions.forEach(session => {
            if (session.endTime) {
                totalWorkingMinutes += (session.endTime - session.startTime) / (1000 * 60);
            }
        });
        
        // Calculate total break time
        breaks.forEach(breakLog => {
            if (breakLog.endTime) {
                totalBreakMinutes += (breakLog.endTime - breakLog.startTime) / (1000 * 60);
            }
        });
        
        // Net working hours (excluding breaks) - kept for backward compatibility
        const netWorkingMinutes = Math.max(0, totalWorkingMinutes - totalBreakMinutes);
        const totalWorkingHours = netWorkingMinutes / 60;
        
        // NEW SHIFT MODEL: Calculate elapsed shift time (clockOutTime - clockInTime, includes breaks)
        const elapsedShiftMinutes = (clockOutTime - new Date(log.clockInTime)) / (1000 * 60);
        const elapsedShiftHours = elapsedShiftMinutes / 60;
        
        // Policy: < 5 hrs elapsed = Absent; >= 5 hrs AND < 9 hrs elapsed = Half-day; >= 9 hrs elapsed = Full day
        const { MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY, MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY } = require('../config/shiftPolicy');
        
        const updateData = {
            clockOutTime: clockOutTime,
            totalWorkingHours: totalWorkingHours, // Keep for backward compatibility
            logoutType: 'MANUAL',
            autoLogoutReason: null
        };

        // Get current log to check override status — reuse the already-fetched `log` document
        // PERFORMANCE FIX: Removed redundant AttendanceLog.findById(log._id) call here.
        // The `log` variable already holds the document from the query above.
        const currentLog = log;
        
        if (!currentLog?.overriddenByAdmin) {
            const GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
            const withinGracePeriod = (currentLog?.lateMinutes || 0) <= GRACE_PERIOD_MINUTES;
            
            // Use elapsed shift time for status determination
            if (elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY) {
                // Less than 5 hrs elapsed → Absent
                updateData.isHalfDay = false;
                updateData.isLate = false;
                updateData.attendanceStatus = 'Absent';
                updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                updateData.halfDayReasonText = `Less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours total shift time (${elapsedShiftHours.toFixed(1)} hours elapsed). Minimum ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs for half-day, ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hrs for full day.`;
                updateData.halfDaySource = 'AUTO';
                if (process.env.NODE_ENV !== 'production') console.log(`[CLOCK-OUT] Marked Absent for user ${userId} (${elapsedShiftHours.toFixed(1)} hours elapsed < ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs)`);
            } else if (elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY) {
                // 5 to < 9 hrs elapsed → Half-day
                if (withinGracePeriod) {
                    updateData.isHalfDay = true;
                    updateData.isLate = false;
                    updateData.attendanceStatus = 'Half-day';
                    updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                    updateData.halfDayReasonText = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
                    updateData.halfDaySource = 'AUTO';
                } else if (!currentLog?.isHalfDay) {
                    updateData.isHalfDay = true;
                    updateData.attendanceStatus = 'Half-day';
                    updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                    updateData.halfDayReasonText = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
                    updateData.halfDaySource = 'AUTO';
                } else {
                    updateData.isHalfDay = true;
                    updateData.attendanceStatus = 'Half-day';
                }
            }
        }
        
        await AttendanceLog.findByIdAndUpdate(log._id, { $set: updateData });
        
        // PERFORMANCE FIX: Removed redundant AttendanceLog.findById(log._id) call.
        // We already have all updated values in `updateData`; use it directly below.
        
        // --- NOTIFICATION ---
        // PERFORMANCE FIX: Removed redundant User.findById(userId) call — 
        // fetch user in parallel with the update instead.
        const [updatedUser] = await Promise.all([
            User.findById(userId).lean()
        ]);
        const user = updatedUser;
        if (user) {
            // Notify admins about user clock-out
            NewNotificationService.notifyCheckOut(userId, user.fullName)
                .catch(err => console.error('Error sending clock-out notification to admins:', err));
            
            // Send confirmation to the user
            let message = `You have successfully clocked out at ${formatISTTime(clockOutTime, { hour12: true })}. Total shift time: ${elapsedShiftHours.toFixed(1)}h`;
            if (updateData.attendanceStatus === 'Absent') {
                message += ` (Marked as Absent - less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours elapsed)`;
            } else if (updateData.isHalfDay) {
                message += ` (Marked as half-day due to insufficient shift time)`;
            }
            
            NewNotificationService.createAndEmitNotification({
                message: message,
                type: (updateData.attendanceStatus === 'Absent' || updateData.isHalfDay) ? 'warning' : 'success',
                userId,
                userName: user.fullName,
                recipientType: 'user',
                category: 'attendance',
                priority: 'medium',
            }).catch(err => console.error('Error sending clock-out confirmation to user:', err));
        }
        
        // PHASE 4 OPTIMIZATION: Cache invalidation on mutation
        // Invalidate status cache for this user and date
        const cacheKey = `status:${userId}:${today}`;
        cache.delete(cacheKey);
        // Also invalidate dashboard summary cache (utils/cache)
        cache.deletePattern(`dashboard-summary:*`);
        cache.deletePattern('live_attendance_overview:*');
        // CRITICAL: Invalidate real dashboard cache (cacheService stores dashboard_${date})
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(today);

        // Emit Socket.IO event for real-time updates (replaces polling)
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: userId,
                    attendanceDate: today,
                    attendanceStatus: updateData.attendanceStatus || log.attendanceStatus,
                    isHalfDay: updateData.isHalfDay ?? log.isHalfDay,
                    isLate: updateData.isLate ?? log.isLate,
                    clockInTime: log.clockInTime,
                    clockOutTime: clockOutTime,
                    totalWorkingHours: totalWorkingHours,
                    halfDayReason: updateData.halfDayReasonText || null,
                    timestamp: getISTNow().toISOString(),
                    message: updateData.isHalfDay ? `Clocked out - Marked as half-day (insufficient hours)` : `Clocked out successfully`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted attendance_log_updated event for clock-out ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        cache.delete(`employee_dashboard:${userId}:${today}`);
        res.json({
            message: 'Clocked out successfully!',
            session: updatedSession,
            totalWorkingHours: totalWorkingHours
        });
    } catch (error) {
        console.error('Clock-out Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/attendance/early-checkout-request - Create early checkout request (employee; no checkout until approved)
router.post('/early-checkout-request', authenticateToken, async (req, res) => {
    const { userId } = req.user;
    const today = getAttendanceDate(userId);
    const { reason } = req.body || {};
    const note = typeof reason === 'string' ? reason.trim() : '';
    if (!note || note.length < 25) {
        return res.status(400).json({ error: 'Early checkout reason must be at least 25 characters.' });
    }
    try {
        const [log, activeBreak] = await Promise.all([
            AttendanceLog.findOne({ user: userId, attendanceDate: today }),
            BreakLog.findOne({ userId, endTime: null })
        ]);
        if (!log) return res.status(400).json({ error: 'Cannot find attendance log. You must clock in first.' });
        if (activeBreak) return res.status(400).json({ error: 'You must end your break before requesting early checkout.' });
        const todayStart = startOfISTDay(today);
        const todayEnd = endOfISTDay(today);
        const [sessionsForLogout, breaksForLogout, userWithShift, approvedHalfDayLeaveDoc] = await Promise.all([
            AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 }),
            BreakLog.find({ attendanceLog: log._id }),
            User.findById(userId).populate('shiftGroup').lean(),
            LeaveRequest.findOne({
                employee: userId,
                status: 'Approved',
                leaveType: { $in: ['Half Day - First Half', 'Half Day - Second Half'] },
                leaveDates: { $elemMatch: { $gte: todayStart, $lte: todayEnd } }
            }).lean()
        ]);
        const approvedHalfDayLeave = !!approvedHalfDayLeaveDoc;
        const logoutResult = computeCalculatedLogoutTime(sessionsForLogout, breaksForLogout, log, userWithShift?.shiftGroup || null, null, approvedHalfDayLeave);
        if (!logoutResult) return res.status(400).json({ error: 'Could not calculate required logout time.' });
        const requiredAt = new Date(logoutResult.requiredLogoutTime);
        const now = getISTNow();
        if (now.getTime() >= requiredAt.getTime()) {
            return res.status(400).json({ error: 'You have reached required logout time. Use Check Out directly.' });
        }
        const existing = await EarlyCheckoutRequest.findOne({ attendanceLog: log._id, status: 'Pending' });
        if (existing) return res.status(400).json({ error: 'You already have a pending early checkout request for today.' });
        const remainingMs = requiredAt.getTime() - now.getTime();
        const remainingTimeMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
        const request = await EarlyCheckoutRequest.create({
            employee: userId,
            attendanceLog: log._id,
            reason: note,
            requestedAt: now,
            requiredLogoutTime: requiredAt,
            remainingTimeMinutes,
            status: 'Pending'
        });
        const user = await User.findById(userId).select('fullName').lean();
        const reasonPreview = note.length > 80 ? note.slice(0, 80) + '…' : note;
        await NewNotificationService.notifyEarlyCheckoutRequest(userId, user?.fullName || 'Employee', {
            requestId: request._id.toString(),
            date: today,
            remainingTimeMinutes,
            reasonPreview
        });
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(today);
        cache.delete(`employee_dashboard:${userId}:${today}`);
        res.status(201).json({
            message: 'Early checkout request sent for admin approval.',
            request: {
                _id: request._id,
                status: request.status,
                requestedAt: request.requestedAt,
                requiredLogoutTime: request.requiredLogoutTime,
                remainingTimeMinutes: request.remainingTimeMinutes
            }
        });
    } catch (err) {
        console.error('Early checkout request error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// GET /api/attendance/early-checkout-request/mine - Get current user's pending early checkout request for a date
router.get('/early-checkout-request/mine', authenticateToken, async (req, res) => {
    const { userId } = req.user;
    const date = req.query.date || getAttendanceDate(userId);
    try {
        const log = await AttendanceLog.findOne({ user: userId, attendanceDate: date });
        if (!log) return res.json({ request: null });
        const request = await EarlyCheckoutRequest.findOne({ attendanceLog: log._id }).sort({ createdAt: -1 }).lean();
        res.json({ request: request || null });
    } catch (err) {
        console.error('Early checkout request mine error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/my-weekly-log', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        if (!mongoose.Types.ObjectId.isValid(userId)) { return res.status(400).json({ error: "Invalid user ID." }); }
        
        let { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            const today = getISTNow();
            const dayOfWeek = today.getDay();
            const firstDayOfWeek = new Date(today);
            firstDayOfWeek.setDate(today.getDate() - dayOfWeek);
            const lastDayOfWeek = new Date(firstDayOfWeek);
            lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
            startDate = getISTDateString(firstDayOfWeek);
            endDate = getISTDateString(lastDayOfWeek);
        }

        const logs = await AttendanceLog.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId), attendanceDate: { $gte: startDate, $lte: endDate } } },
            { $lookup: { from: 'attendancesessions', localField: '_id', foreignField: 'attendanceLog', as: 'sessions' } },
            { $lookup: { from: 'breaklogs', localField: '_id', foreignField: 'attendanceLog', as: 'breaks' } },
            { $project: { _id: 1, attendanceDate: 1, status: 1, clockInTime: 1, clockOutTime: 1, notes: 1, paidBreakMinutesTaken: 1, unpaidBreakMinutesTaken: 1, penaltyMinutes: 1, sessions: { $map: { input: "$sessions", as: "s", in: { startTime: "$$s.startTime", endTime: "$$s.endTime" } } }, breaks: { $map: { input: "$breaks", as: "b", in: { startTime: "$$b.startTime", endTime: "$$b.endTime", durationMinutes: "$$b.durationMinutes", breakType: "$$b.breakType" } } } } },
            { $sort: { attendanceDate: 1 } }
        ]);
        res.json(logs);
    } catch (error) {
        console.error("Error fetching weekly log:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

// Attendance notes: read-only for employees; only Admin/HR may create or update (RBAC enforced).
// Employees CANNOT create, edit, or delete notes for any attendance record.
router.patch('/log/:logId/note', authenticateToken, async (req, res) => {
    const { logId } = req.params;
    const { notes } = req.body;
    let { role } = req.user;
    const userId = req.user.userId;

    try {
        if (!mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({ error: 'Invalid log ID.' });
        }

        if (!role && userId) {
            const u = await User.findById(userId).select('role').lean();
            if (u) role = u.role;
        }
        const isAdminOrHr = role === 'Admin' || role === 'HR';
        if (!isAdminOrHr) {
            return res.status(403).json({
                error: 'Only Admin or HR can add or edit attendance notes. Notes are read-only for employees.'
            });
        }

        const log = await AttendanceLog.findOne({ _id: logId });
        if (!log) {
            return res.status(404).json({ error: 'Attendance log not found.' });
        }

        log.notes = typeof notes === 'string' ? notes : '';
        await log.save();

        res.json({ message: 'Note updated successfully.', log });
    } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/attendance/auto-break - Start automatic unpaid break due to inactivity
router.post('/auto-break', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { type = 'Auto-Unpaid-Break', reason = 'Inactivity detected' } = req.body;
        const today = getAttendanceDate(userId);

        console.log(`[AUTO-BREAK] Request from user ${userId}, reason: ${reason}`);

        // Check if user is already on a break
        const activeBreak = await BreakLog.findOne({
            userId,
            endTime: null
        });

        if (activeBreak) {
            console.log(`[AUTO-BREAK] User already on break: ${activeBreak._id}`);
            return res.status(400).json({ 
                error: 'User is already on a break.',
                success: false 
            });
        }

        // Check if user is checked in - need to find attendance log first
        const attendanceLog = await AttendanceLog.findOne({ 
            user: userId, 
            attendanceDate: today 
        });

        if (!attendanceLog) {
            console.log(`[AUTO-BREAK] No attendance log found for user ${userId} on ${today}`);
            return res.status(400).json({ 
                error: 'User must be checked in to start a break.',
                success: false 
            });
        }

        console.log(`[AUTO-BREAK] Found attendance log: ${attendanceLog._id}`);

        // Check for active session using attendanceLog
        const activeSession = await AttendanceSession.findOne({
            attendanceLog: attendanceLog._id,
            endTime: null
        });

        if (!activeSession) {
            console.log(`[AUTO-BREAK] No active session found for attendance log ${attendanceLog._id}`);
            return res.status(400).json({ 
                error: 'User must be checked in to start a break.',
                success: false 
            });
        }

        console.log(`[AUTO-BREAK] Found active session: ${activeSession._id}`);

        // Create auto-break log
        const breakLog = new BreakLog({
            userId,
            attendanceLog: attendanceLog._id,
            type,
            breakType: 'Unpaid', // Set for backward compatibility
            startTime: getISTNow(),
            reason,
            isAutoBreak: true
        });

        await breakLog.save();

        console.log(`[AUTO-BREAK] Break log created: ${breakLog._id}`);
        
        // Log to activity tracker (with error handling)
        try {
            await logAction(userId, 'AUTO_BREAK_START', {
                breakId: breakLog._id,
                reason,
                startTime: breakLog.startTime,
                type: type
            });
            console.log(`[AUTO-BREAK] Activity logged successfully`);
        } catch (logError) {
            console.error('[AUTO-BREAK] Failed to log activity:', logError.message);
            // Don't fail the request if logging fails
        }

        // Send notifications to user and admins
        try {
            const user = await User.findById(userId);
            if (user) {
                await NewNotificationService.notifyAutoBreakStart(userId, user.fullName, reason);
                console.log(`[AUTO-BREAK] Notifications sent successfully`);
            }
        } catch (notificationError) {
            console.error('[AUTO-BREAK] Failed to send notifications:', notificationError.message);
            // Don't fail the request if notifications fail
        }

        res.json({
            success: true,
            message: 'Auto-break started successfully.',
            breakId: breakLog._id,
            startTime: breakLog.startTime
        });

    } catch (error) {
        console.error('[AUTO-BREAK] Error starting auto-break:', error);
        res.status(500).json({ 
            error: 'Failed to start auto-break.',
            success: false,
            details: error.message
        });
    }
});

// GET /api/attendance/current-status - Get current attendance and break status
router.get('/current-status', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const today = getAttendanceDate(userId);

        // Find today's attendance log
        const attendanceLog = await AttendanceLog.findOne({ 
            user: userId, 
            attendanceDate: today 
        });

        // Get current attendance session
        let activeSession = null;
        if (attendanceLog) {
            activeSession = await AttendanceSession.findOne({
                attendanceLog: attendanceLog._id,
                endTime: null
            });
        }

        // Get current break
        const activeBreak = await BreakLog.findOne({
            userId,
            endTime: null
        });

        res.json({
            isCheckedIn: !!activeSession,
            isOnBreak: !!activeBreak,
            breakType: activeBreak?.type || null,
            breakStartTime: activeBreak?.startTime || null,
            sessionStartTime: activeSession?.startTime || null
        });

    } catch (error) {
        console.error('Error getting current status:', error);
        res.status(500).json({ error: 'Failed to get current status.' });
    }
});

// PUT /api/attendance/end-break - End current break (including auto-break)
router.put('/end-break', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const today = getAttendanceDate(userId);

        console.log(`[END-BREAK] Request from user ${userId}`);

        // Find active break by userId (for auto-breaks) or by attendanceLog (for regular breaks)
        let activeBreak = await BreakLog.findOne({
            userId,
            endTime: null
        }).sort({ startTime: -1 });

        // If not found by userId alone, try finding by attendanceLog
        if (!activeBreak) {
            console.log('[END-BREAK] No break found by userId, checking attendanceLog...');
            const attendanceLog = await AttendanceLog.findOne({ 
                user: userId, 
                attendanceDate: today 
            });
            
            if (attendanceLog) {
                activeBreak = await BreakLog.findOne({
                    attendanceLog: attendanceLog._id,
                    endTime: null
                }).sort({ startTime: -1 });
            }
        }

        if (!activeBreak) {
            console.log('[END-BREAK] No active break found');
            return res.status(400).json({ 
                error: 'No active break found.',
                success: false 
            });
        }

        console.log(`[END-BREAK] Found active break: ${activeBreak._id}, isAutoBreak: ${activeBreak.isAutoBreak}`);

        // End the break
        const breakEndTime = getISTNow();
        const currentBreakDuration = Math.round((breakEndTime - new Date(activeBreak.startTime)) / (1000 * 60));

        await BreakLog.findByIdAndUpdate(activeBreak._id, {
            $set: {
                endTime: breakEndTime,
                durationMinutes: currentBreakDuration
            }
        });

        console.log(`[END-BREAK] Break ended successfully. Duration: ${currentBreakDuration} minutes`);

        // If it's an auto-break, log the event
        if (activeBreak.isAutoBreak) {
            console.log(`[END-BREAK] Processing auto-break end actions...`);
            
            // Log to activity tracker (with error handling)
            try {
                await logAction(userId, 'AUTO_BREAK_END', {
                    breakId: activeBreak._id,
                    endTime: breakEndTime,
                    duration: currentBreakDuration,
                    type: activeBreak.type,
                    reason: activeBreak.reason
                });
                console.log(`[END-BREAK] Activity logged successfully`);
            } catch (logError) {
                console.error('[END-BREAK] Failed to log activity:', logError.message);
                // Don't fail the request if logging fails
            }
            
            // Send notifications to user and admins
            try {
                const user = await User.findById(userId);
                if (user) {
                    await NewNotificationService.notifyAutoBreakEnd(userId, user.fullName, currentBreakDuration);
                    console.log(`[END-BREAK] Notifications sent successfully`);
                }
            } catch (notificationError) {
                console.error('[END-BREAK] Failed to send notifications:', notificationError.message);
                // Don't fail the request if notifications fail
            }
        }

        res.json({
            success: true,
            message: 'Break ended successfully.',
            breakId: activeBreak._id,
            endTime: breakEndTime,
            duration: currentBreakDuration,
            wasAutoBreak: activeBreak.isAutoBreak || false
        });

    } catch (error) {
        console.error('[END-BREAK] Error ending break:', error);
        res.status(500).json({ 
            error: 'Failed to end break.',
            success: false,
            details: error.message
        });
    }
});

/**
 * Helper function to get working dates for a month
 * Excludes: Sundays, Alternate Saturdays (based on employee policy), Holidays
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @param {Object} employee - Employee object with alternateSaturdayPolicy
 * @returns {Promise<Array<string>>} Array of working dates in YYYY-MM-DD format
 */
const getWorkingDatesForMonth = async (month, year, employee) => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const holidays = await Holiday.find({
        date: { $gte: monthStart, $lte: monthEnd, $ne: null },
        isTentative: { $ne: true }
    }).lean();
    const holidayDates = new Set(
        holidays
            .filter(h => h.date && !h.isTentative)
            .map(h => {
                const d = new Date(h.date);
                return isNaN(d.getTime()) ? null : getISTDateString(d);
            })
            .filter(Boolean)
    );
    return getWorkingDatesForMonthInMemory(month, year, holidayDates, employee?.alternateSaturdayPolicy || 'All Saturdays Working');
};

/**
 * Pure in-memory: working dates for a month given holiday set and Saturday policy.
 * No DB calls. Used by actual-work-days batch path.
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @param {Set<string>} holidayDateSet - Set of YYYY-MM-DD holiday dates
 * @param {string} alternateSaturdayPolicy - e.g. 'All Saturdays Working'
 * @returns {Array<string>} Working dates in YYYY-MM-DD format
 */
function getWorkingDatesForMonthInMemory(month, year, holidayDateSet, alternateSaturdayPolicy) {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const workingDates = [];
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dateStr = getISTDateString(d);
        if (dayOfWeek === 0) continue;
        if (dayOfWeek === 6 && LeavePolicyService.isSaturdayOff(d, alternateSaturdayPolicy)) continue;
        if (holidayDateSet.has(dateStr)) continue;
        workingDates.push(dateStr);
    }
    return workingDates;
}

/**
 * GET /api/attendance/actual-work-days
 * Calculate Actual Worked Days (Present Days) for employee(s) in a given month
 * 
 * Query Params:
 * - employeeId (optional): Specific employee ID. If not provided, returns data for all employees (Admin/HR only)
 * - month (required): Month (1-12)
 * - year (required): Year
 * 
 * Response:
 * Single employee: {
 *   employeeId: string,
 *   month: number,
 *   year: number,
 *   totalWorkingDays: number,
 *   actualWorkedDays: number,
 *   absentDays: number
 * }
 * 
 * Multiple employees: Array of above objects
 */
router.get('/actual-work-days', authenticateToken, async (req, res) => {
    const routeStart = Date.now();
    let dbQueriesCount = 0;
    try {
        const { employeeId, month, year } = req.query;
        const { userId, role } = req.user;

        // Validate required params
        if (!month || !year) {
            return res.status(400).json({
                error: 'Month and year are required query parameters.'
            });
        }

        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);

        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                error: 'Month must be a number between 1 and 12.'
            });
        }

        if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
            return res.status(400).json({
                error: 'Year must be a valid year.'
            });
        }

        // Access control: Employee can only see their own data
        if (employeeId) {
            if (!mongoose.Types.ObjectId.isValid(employeeId)) {
                return res.status(400).json({ error: 'Invalid employee ID format.' });
            }
            if (role !== 'Admin' && role !== 'HR' && employeeId !== userId) {
                return res.status(403).json({
                    error: 'You do not have permission to view this employee\'s data.'
                });
            }
        } else {
            if (role !== 'Admin' && role !== 'HR') {
                return res.status(403).json({
                    error: 'Only Admin and HR can view all employees\' data.'
                });
            }
        }

        const monthIndex = monthNum - 1;
        const firstDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        const lastDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // --- Batch: 1 query for users ---
        const t0 = Date.now();
        let employeesToProcess;
        if (employeeId) {
            const employee = await User.findById(employeeId).select('_id fullName employeeCode alternateSaturdayPolicy role').lean();
            if (!employee) {
                return res.status(404).json({ error: 'Employee not found.' });
            }
            employeesToProcess = [employee];
        } else {
            employeesToProcess = await User.find({ isActive: true })
                .select('_id fullName employeeCode alternateSaturdayPolicy role')
                .lean();
        }
        dbQueriesCount += 1;
        const dbFetchUsersMs = Date.now() - t0;

        // --- Batch: 1 query for holidays (shared for all employees) ---
        const t1 = Date.now();
        const monthStart = new Date(yearNum, monthIndex, 1);
        const monthEnd = new Date(yearNum, monthIndex + 1, 0, 23, 59, 59, 999);
        const holidays = await Holiday.find({
            date: { $gte: monthStart, $lte: monthEnd, $ne: null },
            isTentative: { $ne: true }
        }).select('date').lean();
        dbQueriesCount += 1;
        const dbFetchHolidaysMs = Date.now() - t1;

        const holidayDateSet = new Set(
            holidays
                .filter(h => h.date && !h.isTentative)
                .map(h => {
                    const d = new Date(h.date);
                    return isNaN(d.getTime()) ? null : getISTDateString(d);
                })
                .filter(Boolean)
        );

        // --- In-memory: working dates per policy (no DB) ---
        const policiesSeen = new Set();
        const policyToWorkingDates = new Map();
        for (const emp of employeesToProcess) {
            const policy = emp.alternateSaturdayPolicy || 'All Saturdays Working';
            if (!policiesSeen.has(policy)) {
                policiesSeen.add(policy);
                policyToWorkingDates.set(policy, getWorkingDatesForMonthInMemory(monthIndex, yearNum, holidayDateSet, policy));
            }
        }

        const employeeIds = employeesToProcess.map(e => e._id);

        // --- Batch: 1 query for all attendance logs in month for these users ---
        const t2 = Date.now();
        const attendanceLogs = await AttendanceLog.find({
            user: { $in: employeeIds },
            attendanceDate: { $gte: firstDateStr, $lte: lastDateStr },
            clockInTime: { $exists: true, $ne: null }
        }).select('user attendanceDate').lean();
        dbQueriesCount += 1;
        const dbFetchAttendanceMs = Date.now() - t2;

        // --- In-memory: group by user -> Set of present dates, then build results (no DB) ---
        const computeStart = Date.now();
        const presentByUser = new Map();
        for (const log of attendanceLogs) {
            const uid = log.user && log.user.toString ? log.user.toString() : String(log.user);
            if (!presentByUser.has(uid)) presentByUser.set(uid, new Set());
            presentByUser.get(uid).add(log.attendanceDate);
        }

        // --- In-memory: build result per employee ---
        const results = employeesToProcess.map((employee) => {
            const policy = employee.alternateSaturdayPolicy || 'All Saturdays Working';
            const workingDates = policyToWorkingDates.get(policy) || [];
            const totalWorkingDays = workingDates.length;
            const presentSet = presentByUser.get(employee._id.toString()) || new Set();
            const workingDateSet = new Set(workingDates);
            let actualWorkedDays = 0;
            for (const d of presentSet) {
                if (workingDateSet.has(d)) actualWorkedDays++;
            }
            const absentDays = totalWorkingDays - actualWorkedDays;
            return {
                employeeId: employee._id.toString(),
                employeeName: employee.fullName,
                employeeCode: employee.employeeCode,
                month: monthNum,
                year: yearNum,
                totalWorkingDays,
                actualWorkedDays,
                absentDays
            };
        });
        const computeMs = Date.now() - computeStart;
        const totalMs = Date.now() - routeStart;

        if (process.env.NODE_ENV !== 'test') {
            console.log(
                `[ACTUAL_WORK_DAYS] db_fetch_ms=users:${dbFetchUsersMs} holidays:${dbFetchHolidaysMs} attendance:${dbFetchAttendanceMs} total_db=${dbFetchUsersMs + dbFetchHolidaysMs + dbFetchAttendanceMs} compute_ms=${computeMs} total_ms=${totalMs} users_processed=${results.length} db_queries=${dbQueriesCount}`
            );
        }

        if (employeeId) {
            res.json(results[0]);
        } else {
            res.json(results);
        }
    } catch (error) {
        console.error('Error calculating actual work days:', error);
        res.status(500).json({
            error: 'Internal server error while calculating actual work days.',
            details: error.message
        });
    }
});

/**
 * GET /api/attendance/summary
 * Unified endpoint for attendance summary with FULL STATUS RESOLUTION.
 * This is the SINGLE SOURCE OF TRUTH - backend resolves ALL statuses.
 * 
 * Query params:
 * - startDate (required): YYYY-MM-DD
 * - endDate (required): YYYY-MM-DD
 * - userId (optional, admin only): Specific user ID, defaults to current user
 * - includeHolidays (optional): Include holidays in response
 * 
 * Returns: Array of attendance entries for ALL dates in range, with resolved status.
 * Status precedence: Holiday > Approved Leave > Weekly Off > Present > Half-day > Absent
 */
router.get('/summary', authenticateToken, async (req, res) => {
    try {
        const { startDate, endDate, userId, includeHolidays } = req.query;
        const { userId: currentUserId, role } = req.user;

        // Validate date range
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

        // Determine which user's data to fetch
        let targetUserId = currentUserId;
        if (userId) {
            // Admin/HR can view any user's data
            if (role !== 'Admin' && role !== 'HR') {
                return res.status(403).json({ 
                    error: 'Only Admin and HR can view other users\' attendance.' 
                });
            }
            if (!mongoose.Types.ObjectId.isValid(userId)) {
                return res.status(400).json({ error: 'Invalid user ID format.' });
            }
            targetUserId = userId;
        }

        const { resolveAttendanceStatus, generateDateRange } = require('../utils/attendanceStatusResolver');
        const { getGracePeriodMinutes } = require('../utils/gracePeriod');

        const dateRange = generateDateRange(startDate, endDate);
        const shouldIncludeHolidays = includeHolidays === 'true' || includeHolidays === true;
        const [employee, logs, holidays, leaveRequests, gracePeriodMinutes, userWithShift] = await Promise.all([
            // Fetch employee to get Saturday policy
            User.findById(targetUserId).select('alternateSaturdayPolicy').lean(),
            // Fetch attendance logs for date range
            // CRITICAL: Include user and shiftGroup for lateMinutes recalculation
            AttendanceLog.aggregate([
            { 
                $match: { 
                    user: new mongoose.Types.ObjectId(targetUserId), 
                    attendanceDate: { $gte: startDate, $lte: endDate } 
                } 
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            {
                $unwind: {
                    path: '$userData',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'shiftgroups',
                    localField: 'userData.shiftGroup',
                    foreignField: '_id',
                    as: 'shiftGroupData'
                }
            },
            {
                $unwind: {
                    path: '$shiftGroupData',
                    preserveNullAndEmptyArrays: true
                }
            },
            { 
                $lookup: { 
                    from: 'attendancesessions', 
                    localField: '_id', 
                    foreignField: 'attendanceLog', 
                    as: 'sessions' 
                } 
            },
            { 
                $lookup: { 
                    from: 'breaklogs', 
                    localField: '_id', 
                    foreignField: 'attendanceLog', 
                    as: 'breaks' 
                } 
            },
            { 
                $project: { 
                    _id: 1, 
                    attendanceDate: 1, 
                    attendanceStatus: 1,
                    clockInTime: 1, 
                    clockOutTime: 1, 
                    notes: 1, 
                    isLate: 1,
                    isHalfDay: 1,
                    halfDayReasonCode: 1,
                    halfDayReasonText: 1,
                    halfDaySource: 1,
                    overriddenByAdmin: 1,
                    overriddenAt: 1,
                    overriddenBy: 1,
                    overrideReason: 1,
                    overrideType: 1,
                    adminOverride: 1,
                    lateMinutes: 1,
                    totalWorkingHours: 1,
                    paidBreakMinutesTaken: 1,
                    unpaidBreakMinutesTaken: 1,
                    penaltyMinutes: 1,
                    logoutType: 1,
                    autoLogoutReason: 1,
                    earlyCheckoutNote: 1,
                    user: {
                        _id: '$userData._id',
                        shiftGroup: {
                            _id: '$shiftGroupData._id',
                            startTime: '$shiftGroupData.startTime'
                        }
                    },
                    sessions: { 
                        $map: { 
                            input: "$sessions", 
                            as: "s", 
                            in: { 
                                startTime: "$$s.startTime", 
                                endTime: "$$s.endTime" 
                            } 
                        } 
                    }, 
                    breaks: { 
                        $map: { 
                            input: "$breaks", 
                            as: "b", 
                            in: { 
                                startTime: "$$b.startTime", 
                                endTime: "$$b.endTime", 
                                durationMinutes: "$$b.durationMinutes", 
                                breakType: "$$b.breakType" 
                            } 
                        } 
                    } 
                } 
            },
            { $sort: { attendanceDate: 1 } }
            ]),
            // Fetch holidays filtered by date range (IST)
            shouldIncludeHolidays ? (async () => {
                const startDateIST = parseISTDate(startDate);
                const endDateIST = parseISTDate(endDate);
                const holidays = await Holiday.find({
                    date: {
                        $gte: startDateIST,
                        $lte: endDateIST
                    },
                    isTentative: { $ne: true }
                }).sort({ date: 1 }).lean();
                return holidays;
            })() : Promise.resolve([]),
            // Fetch all approved leave requests for the date range
            // LeaveRequest uses leaveDates array, so we need to check if any leaveDate falls within range
            LeaveRequest.find({
                employee: new mongoose.Types.ObjectId(targetUserId),
                status: 'Approved',
                leaveDates: {
                    $elemMatch: {
                        $gte: parseISTDate(startDate),
                        $lte: parseISTDate(endDate + 'T23:59:59+05:30')
                    }
                }
            }).sort({ createdAt: 1 }).lean(),
            getGracePeriodMinutes(),
            // Fetch user with shiftGroup for lateMinutes recalculation
            User.findById(targetUserId).populate('shiftGroup').lean()
        ]);

        // Get Saturday policy (from User.alternateSaturdayPolicy field)
        if (!employee) {
            console.error(`[ATTENDANCE SUMMARY] Employee not found for userId: ${targetUserId}`);
            return res.status(404).json({ error: 'Employee not found.' });
        }
        let saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
        
        // Defensive check: Validate saturdayPolicy value
        const validPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
        if (!validPolicies.includes(saturdayPolicy)) {
            console.warn(`[ATTENDANCE SUMMARY] Invalid saturdayPolicy for userId ${targetUserId}: ${saturdayPolicy}, defaulting to 'All Saturdays Working'`);
            saturdayPolicy = 'All Saturdays Working';
        }

        // Create maps for quick lookup
        const logsMap = new Map();
        logs.forEach(log => {
            logsMap.set(log.attendanceDate, log);
        });

        const leaveRequestsMap = new Map();
        // CRITICAL FIX: Only map leaves that are actually approved and exist
        // This ensures deleted leaves don't appear in the summary
        leaveRequests.forEach(leave => {
            // Double-check: Only process approved leaves (query already filters, but defensive check)
            if (!leave || leave.status !== 'Approved') {
                return; // Skip non-approved or null leaves
            }
            
            // LeaveRequest model uses leaveDates array (not startDate/endDate)
            if (Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
                leave.leaveDates.forEach(leaveDate => {
                    const leaveDateStr = getISTDateString(leaveDate);
                    if (leaveDateStr >= startDate && leaveDateStr <= endDate) {
                        // If multiple leaves overlap, keep the first one (or most recent)
                        if (!leaveRequestsMap.has(leaveDateStr)) {
                            leaveRequestsMap.set(leaveDateStr, leave);
                        }
                    }
                });
            }
        });
        
        // CRITICAL FIX: Clean up attendance logs that reference deleted leaves
        // Check all logs and remove leaveRequest references if the leave no longer exists
        const validLeaveIds = new Set(leaveRequests.map(l => l._id.toString()));
        const logsToCleanup = [];
        
        for (const log of logs) {
            const leaveRefId = log.leaveRequest?.toString();
            const hasOrphanedLeaveRef = leaveRefId && !validLeaveIds.has(leaveRefId);
            const hasLeaveStatusButNoLeave = log.attendanceStatus === 'Leave' && !leaveRequestsMap.has(log.attendanceDate);
            
            if (hasOrphanedLeaveRef || hasLeaveStatusButNoLeave) {
                // This log references a deleted leave or has Leave status but no valid leave exists
                console.log(`[ATTENDANCE_SUMMARY] Found orphaned leave reference in log ${log._id} for date ${log.attendanceDate}`);
                
                // Clean up the log object for this response
                log.leaveRequest = null;
                if (!log.clockInTime && !log.clockOutTime && log.attendanceStatus === 'Leave') {
                    // No attendance data and status is Leave - set to Absent
                    log.attendanceStatus = 'Absent';
                    log.isLate = false;
                    log.isHalfDay = false;
                    log.lateMinutes = 0;
                }
                
                // Queue for async cleanup in database
                logsToCleanup.push({
                    logId: log._id,
                    hasClockIn: !!log.clockInTime,
                    currentStatus: log.attendanceStatus
                });
            }
        }
        
        // Async cleanup of orphaned references in database (don't block response)
        if (logsToCleanup.length > 0) {
            Promise.all(logsToCleanup.map(({ logId, hasClockIn, currentStatus }) => {
                const updateData = { leaveRequest: null };
                if (!hasClockIn && currentStatus === 'Absent') {
                    updateData.attendanceStatus = 'Absent';
                    updateData.isLate = false;
                    updateData.isHalfDay = false;
                    updateData.lateMinutes = 0;
                }
                return AttendanceLog.findByIdAndUpdate(logId, updateData).catch(err => {
                    console.error(`[ATTENDANCE_SUMMARY] Failed to cleanup orphaned leave reference in log ${logId}:`, err);
                });
            })).catch(err => {
                console.error('[ATTENDANCE_SUMMARY] Error during batch cleanup of orphaned leave references:', err);
            });
        }

        // Process each date in the range and resolve status
        const resolvedLogs = dateRange.map(attendanceDate => {
            const log = logsMap.get(attendanceDate) || null;
            let leaveRequest = leaveRequestsMap.get(attendanceDate) || null;
            
            // CRITICAL FIX: If log has leaveRequest reference, verify it's still valid
            // This prevents showing deleted leaves in the summary
            if (log && log.leaveRequest && !leaveRequest) {
                // Log has leaveRequest reference but it's not in our approved leaves map
                // This means the leave was deleted - ignore the reference
                console.log(`[ATTENDANCE_SUMMARY] Log ${log._id} has orphaned leaveRequest reference for date ${attendanceDate}`);
                leaveRequest = null; // Don't use the orphaned reference
            }

            const statusInfo = resolveAttendanceStatus({
                attendanceDate,
                attendanceLog: log,
                holidays: holidays || [],
                leaveRequest, // Will be null if leave was deleted
                saturdayPolicy,
                gracePeriodMinutes
            });

            // ROBUST: Half-day leave with no check-in → treat as Full Day LOP for display and payable hours.
            // Only show "Half Day" when there is an attendance log with a clock-in for that day.
            // CRITICAL: Do NOT treat as "no check-in" when clock-in was voided due to leave approval (AUTO-VOID in notes).
            // CRITICAL FIX: If employee has actual attendance data (check-in), show Half Day even if leave was converted to LOP
            let effectiveLeaveInfo = statusInfo.leaveInfo;
            const isHalfDayLeaveDoc = leaveRequest && (leaveRequest.leaveType === 'Half Day - First Half' || leaveRequest.leaveType === 'Half Day - Second Half');
            const wasVoidedByLeaveApproval = log?.notes && String(log.notes).includes('AUTO-VOID');
            const hasActualCheckIn = log && log.clockInTime != null && !wasVoidedByLeaveApproval;
            const hasNoCheckIn = !log || (log.clockInTime == null && !wasVoidedByLeaveApproval);
            
            // Only convert to Full Day LOP if there's truly no check-in
            // If employee has attendance data, respect the original half-day leave type
            if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasNoCheckIn) {
                // No clock-in → effective Full Day LOP for display
                effectiveLeaveInfo = {
                    ...effectiveLeaveInfo,
                    leaveType: 'Full Day',
                    requestType: 'Loss of Pay',
                };
            } else if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasActualCheckIn && leaveRequest.autoConvertedToLOP) {
                // Employee has check-in but leave was auto-converted to LOP (should be reverted)
                // Show original half-day type instead of converted Full Day LOP
                effectiveLeaveInfo = {
                    ...effectiveLeaveInfo,
                    leaveType: leaveRequest.originalLeaveType || leaveRequest.leaveType,
                    requestType: leaveRequest.originalRequestType || 'Planned',
                };
            }
            const effectiveIsHalfDayLeave = effectiveLeaveInfo && (effectiveLeaveInfo.leaveType === 'Half Day - First Half' || effectiveLeaveInfo.leaveType === 'Half Day - Second Half');

            // Build the response object
            const result = {
                attendanceDate,
                // FINAL resolved status (backend is single source of truth)
                attendanceStatus: statusInfo.status,
                // Status flags (for leave days: use effective half-day so no-check-in half-day → full-day LOP)
                isWorkingDay: statusInfo.isWorkingDay,
                isHoliday: statusInfo.isHoliday,
                isWeeklyOff: statusInfo.isWeeklyOff,
                isLeave: statusInfo.isLeave,
                isAbsent: statusInfo.isAbsent,
                isHalfDay: statusInfo.isLeave ? effectiveIsHalfDayLeave : statusInfo.isHalfDay,
                // Status reasons (for display)
                statusReason: statusInfo.statusReason || null,
                halfDayReason: statusInfo.halfDayReason || null,
                halfDayReasonCode: statusInfo.halfDayReasonCode || null,
                halfDaySource: statusInfo.halfDaySource || null,
                overriddenByAdmin: statusInfo.overriddenByAdmin || false,
                overrideReason: log?.overrideReason || null,
                overrideType: log?.overrideType || null,
                adminOverride: log?.adminOverride || null,
                overriddenAt: log?.overriddenAt || null,
                overriddenBy: log?.overriddenBy || null,
                leaveReason: statusInfo.leaveReason || null,
                // Holiday/Leave info (effective: half-day with no check-in → Full Day LOP)
                holidayInfo: statusInfo.holidayInfo,
                leaveInfo: effectiveLeaveInfo,
                // Attendance log data (if exists)
                _id: log?._id || null,
                clockInTime: log?.clockInTime || null,
                clockOutTime: log?.clockOutTime || null,
                notes: log?.notes || null,
                isLate: log?.isLate || false,
                lateMinutes: log?.lateMinutes || 0,
                penaltyMinutes: log?.penaltyMinutes || 0,
                logoutType: log?.logoutType || null,
                autoLogoutReason: log?.autoLogoutReason || null,
                // Early checkout note (only when checkout before required logout and employee submitted a note)
                earlyCheckoutNote: (log?.earlyCheckoutNote && String(log.earlyCheckoutNote).trim()) ? String(log.earlyCheckoutNote).trim() : null,
                hasEarlyCheckoutNote: !!(log?.earlyCheckoutNote && String(log.earlyCheckoutNote).trim()),
                // Half-day leave for date (only when there is a clock-in; no check-in → effective full-day LOP)
                hasHalfDayLeave: !!effectiveIsHalfDayLeave,
                // Sessions and breaks
                sessions: log?.sessions || [],
                breaks: Array.isArray(log?.breaks) ? log.breaks : [],
                breaksSummary: {
                    paid: log?.paidBreakMinutesTaken || 0,
                    unpaid: log?.unpaidBreakMinutesTaken || 0,
                    total: (log?.paidBreakMinutesTaken || 0) + (log?.unpaidBreakMinutesTaken || 0)
                },
                // Computed fields
                firstIn: null,
                lastOut: null,
                totalWorkedMinutes: log?.totalWorkingHours ? Math.round(log.totalWorkingHours * 60) : 0,
                // Payable minutes based on resolved status
                payableMinutes: (() => {
                    const { SHIFT_WORKING_MINUTES, MINIMUM_WORKING_HOURS } = require('../config/shiftPolicy');
                    const FULL_DAY_MINUTES = SHIFT_WORKING_MINUTES; // 8.5 hours = 510 minutes
                    const HALF_DAY_MINUTES = Math.round(SHIFT_WORKING_MINUTES / 2); // 4.25 hours = 255 minutes
                    const HALF_DAY_LEAVE_MINUTES = 270; // 4.5 hours = 270 minutes for half day leave
                    
                    if (statusInfo.status === 'Holiday' || statusInfo.status === 'Weekly Off') {
                        return 0;
                    }
                    if (statusInfo.status === 'Leave') {
                        if (statusInfo.isHalfDay) {
                            return HALF_DAY_LEAVE_MINUTES;
                        }
                        return 0; // Full day leave = 0 payable
                    }
                    if (statusInfo.status === 'Half-day' || statusInfo.isHalfDay) {
                        return HALF_DAY_MINUTES;
                    }
                    if (statusInfo.status === 'Absent') {
                        return 0;
                    }
                    // Present or other status - full day
                    return FULL_DAY_MINUTES; // 8.5 hours = 510 minutes for full day
                })()
            };

            // Compute firstIn and lastOut from sessions
            // CRITICAL FIX: Also recalculate lateMinutes from FIRST check-in, not stored value
            if (log?.sessions && Array.isArray(log.sessions) && log.sessions.length > 0) {
                const sortedSessions = [...log.sessions].sort((a, b) => 
                    new Date(a.startTime) - new Date(b.startTime)
                );
                
                if (sortedSessions[0]?.startTime) {
                    result.firstIn = sortedSessions[0].startTime;
                }
                
                const sessionsWithEnd = sortedSessions.filter(s => s.endTime);
                if (sessionsWithEnd.length > 0) {
                    const lastSession = sessionsWithEnd[sessionsWithEnd.length - 1];
                    result.lastOut = lastSession.endTime;
                }
                
                // RULE: Today + no checkout -> do not mark half-day; show Present (On-time) in all views
                const todayIST = getISTDateString();
                const noCheckout = sessionsWithEnd.length === 0;
                if (attendanceDate === todayIST && noCheckout && (result.isHalfDay || result.attendanceStatus === 'Half-day')) {
                    result.attendanceStatus = 'On-time';
                    result.isHalfDay = false;
                    result.halfDayReasonCode = null;
                    result.halfDayReasonText = null;
                    result.halfDayReason = null;
                    result.halfDaySource = null;
                    const { SHIFT_WORKING_MINUTES } = require('../config/shiftPolicy');
                    result.payableMinutes = SHIFT_WORKING_MINUTES; // full day
                }
                
                // STATUS RECALCULATION: Only run when NOT overridden
                // For overridden logs, firstIn and lastOut are still populated above (timeline display works),
                // but status fields retain what was set during result construction from statusInfo
                if (!log.overriddenByAdmin) {
                    // CRITICAL: Recalculate lateMinutes from FIRST check-in time
                    // This ensures we always use the actual first check-in, even if stored lateMinutes is wrong
                    // Use userWithShift fetched above (already populated with shiftGroup)
                    const userShiftGroup = (log.user && log.user.shiftGroup && log.user.shiftGroup.startTime) 
                        ? log.user.shiftGroup 
                        : (userWithShift && userWithShift.shiftGroup) 
                            ? userWithShift.shiftGroup 
                            : null;
                    
                    if (userShiftGroup && userShiftGroup.startTime) {
                        try {
                            const { getShiftDateTimeIST } = require('../utils/istTime');
                            const firstCheckInTime = new Date(sortedSessions[0].startTime);
                            const shiftStartTime = getShiftDateTimeIST(firstCheckInTime, userShiftGroup.startTime);
                            const recalculatedLateMinutes = Math.max(0, Math.floor((firstCheckInTime - shiftStartTime) / (1000 * 60)));
                            
                            // Override stored lateMinutes with recalculated value from first check-in
                            result.lateMinutes = recalculatedLateMinutes;
                            
                            // NEW SHIFT MODEL: Use elapsed shift time (clockOutTime - clockInTime) for attendance status
                            // Policy: < 5 hrs elapsed = Absent; >= 5 hrs AND < 9 hrs elapsed = Half-day; >= 9 hrs elapsed = Full day
                            const { MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY, MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY } = require('../config/shiftPolicy');
                            
                            // Calculate elapsed shift time (includes breaks)
                            const shiftEnded = !!(log.clockInTime && log.clockOutTime);
                            let elapsedShiftHours = null;
                            if (shiftEnded) {
                                const elapsedShiftMinutes = (new Date(log.clockOutTime) - new Date(log.clockInTime)) / (1000 * 60);
                                elapsedShiftHours = elapsedShiftMinutes / 60;
                            }
                            
                            const hasCheckedOut = shiftEnded;
                            const belowHalfDayMinimum = hasCheckedOut && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY; // < 5 hrs elapsed (includes 0)
                            const hasHalfDayHours = hasCheckedOut && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY; // 5 to < 9 hrs elapsed
                            const hasFullDayHours = elapsedShiftHours != null && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY; // >= 9 hrs elapsed
                            const withinGracePeriod = recalculatedLateMinutes <= gracePeriodMinutes;
                            
                            if (belowHalfDayMinimum) {
                                result.isLate = false;
                                result.isHalfDay = false;
                                result.attendanceStatus = 'Absent';
                                result.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                                result.halfDayReason = `Less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours total shift time (${elapsedShiftHours.toFixed(1)} hours elapsed). Minimum ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs for half-day, ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hrs for full day.`;
                                result.payableMinutes = 0; // Absent = 0 payable
                            } else if (withinGracePeriod && hasFullDayHours) {
                                result.isLate = false;
                                result.isHalfDay = false;
                                result.attendanceStatus = 'On-time';
                                result.halfDayReasonCode = null;
                                result.halfDayReason = null;
                            } else if (hasHalfDayHours) {
                                result.isLate = false;
                                result.isHalfDay = true;
                                result.attendanceStatus = 'Half-day';
                                result.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                                result.halfDayReason = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
                            } else if (hasFullDayHours) {
                                result.isLate = true;
                                const lateArrivalMarksHalfDay = !!(userWithShift && userWithShift.featurePermissions && userWithShift.featurePermissions.lateArrivalMarksHalfDay);
                                if (lateArrivalMarksHalfDay) {
                                    result.isHalfDay = true;
                                    result.attendanceStatus = 'Half-day';
                                    result.halfDayReasonCode = 'LATE_LOGIN';
                                    result.halfDayReason = `Late login beyond ${gracePeriodMinutes} min grace period (logged at ${firstCheckInTime.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true, hour: '2-digit', minute: '2-digit' })}, ${recalculatedLateMinutes} minutes late)`;
                                } else {
                                    result.isHalfDay = false;
                                    result.attendanceStatus = 'On-time';
                                    result.halfDayReasonCode = null;
                                    result.halfDayReason = null;
                                }
                            } else {
                                result.isLate = !withinGracePeriod;
                                result.isHalfDay = false;
                                result.attendanceStatus = 'On-time';
                                result.halfDayReasonCode = null;
                                result.halfDayReason = null;
                            }
                            
                            console.log(`[Attendance Summary] ✅ Recalculated for ${log.attendanceDate}: lateMinutes ${log.lateMinutes} → ${recalculatedLateMinutes}, status: ${log.attendanceStatus} → ${result.attendanceStatus}, isHalfDay: ${log.isHalfDay} → ${result.isHalfDay}, halfDayReasonCode: ${log.halfDayReasonCode} → ${result.halfDayReasonCode}`);
                        } catch (err) {
                            console.error(`[Attendance Summary] ❌ Error recalculating lateMinutes for log ${log._id}: ${err.message}`, err);
                            // Fallback to stored value if recalculation fails
                        }
                    } else {
                        console.warn(`[Attendance Summary] ⚠️ Cannot recalculate lateMinutes for log ${log._id}: Missing user or shiftGroup data. log.user: ${!!log.user}, userWithShift: ${!!userWithShift}`);
                    }
                }
            }

            return result;
        });

        // Return response with holidays if requested
        if (shouldIncludeHolidays) {
            res.json({
                logs: resolvedLogs,
                holidays: (holidays || []).map(h => ({
                    _id: h._id,
                    name: h.name,
                    date: h.date,
                    isTentative: h.isTentative || false
                }))
            });
        } else {
            res.json(resolvedLogs);
        }
    } catch (error) {
        console.error('Error fetching attendance summary:', error);
        res.status(500).json({ error: 'Internal server error while fetching attendance summary.' });
    }
});

// =================================================================
// AGGREGATE ENDPOINT: /api/dashboard/employee
// Combines: /attendance/status, /attendance/my-weekly-log, /leaves/my-requests
// AUDIT: Single aggregation + limit(10) leaves; status from cache (30s); optional full-response cache (45s); invalidated on clock-in/out and break start/end.
// =================================================================
router.get('/dashboard/employee', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const { date } = req.query;
        const localDate = date || getISTDateString();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
            return res.status(400).json({ error: 'A valid `date` query parameter is required in YYYY-MM-DD format.' });
        }

        // Optional short-term response cache (45s) - key by userId + date; cache only successful payload
        const dashboardCacheKey = `employee_dashboard:${userId}:${localDate}`;
        const cachedResponse = cache.get(dashboardCacheKey);
        if (cachedResponse !== null) {
            return res.json(cachedResponse);
        }

        // Calculate weekly date range for weekly logs
        const today = parseISTDate(localDate);
        const dayOfWeek = today.getDay();
        const firstDayOfWeek = new Date(today);
        firstDayOfWeek.setDate(today.getDate() - dayOfWeek);
        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
        const startDate = getISTDateString(firstDayOfWeek);
        const endDate = getISTDateString(lastDayOfWeek);

        // Parallelize data fetches (including early checkout approval setting and pending request)
        const [dailyStatus, weeklyLogs, leaveRequests, enforceLogoutSetting, requireApprovalSetting, pendingEarlyCheckoutRequest] = await Promise.all([
            // 1. Daily status (reuse existing logic with caching)
            (async () => {
                const cacheKey = `status:${userId}:${localDate}`;
                const cached = cache.get(cacheKey);
                if (cached !== null) {
                    return cached;
                }
                const status = await getUserDailyStatus(userId, localDate);
                cache.set(cacheKey, status, 30000);
                return status;
            })(),
            // 2. Weekly logs (reuse existing logic)
            AttendanceLog.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(userId), attendanceDate: { $gte: startDate, $lte: endDate } } },
                { $lookup: { from: 'attendancesessions', localField: '_id', foreignField: 'attendanceLog', as: 'sessions' } },
                { $lookup: { from: 'breaklogs', localField: '_id', foreignField: 'attendanceLog', as: 'breaks' } },
                { $project: { _id: 1, attendanceDate: 1, status: 1, attendanceStatus: 1, leaveRequest: 1, clockInTime: 1, clockOutTime: 1, notes: 1, paidBreakMinutesTaken: 1, unpaidBreakMinutesTaken: 1, penaltyMinutes: 1, sessions: { $map: { input: "$sessions", as: "s", in: { startTime: "$$s.startTime", endTime: "$$s.endTime" } } }, breaks: { $map: { input: "$breaks", as: "b", in: { startTime: "$$b.startTime", endTime: "$$b.endTime", durationMinutes: "$$b.durationMinutes", breakType: "$$b.breakType" } } } } },
                { $sort: { attendanceDate: 1 } }
            ]),
            // 3. Leave requests (reuse existing logic; limit 30 so today's approved half-day is included when present)
            LeaveRequest.find({ employee: userId })
                .sort({ createdAt: -1 })
                .limit(30)
                .select('status leaveType leaveDates')
                .lean(),
            // 4. Feature toggle: enforce required logout before checkout (single read, no N+1)
            Setting.findOne({ key: 'enforceRequiredLogoutBeforeCheckout' }).lean(),
            // 5. Feature toggle: require admin approval for early checkout
            Setting.findOne({ key: 'requireAdminApprovalForEarlyCheckout' }).lean(),
            // 6. Pending early checkout request for today (disables checkout until approved/rejected)
            (async () => {
                const log = await AttendanceLog.findOne({ user: userId, attendanceDate: localDate }).select('_id').lean();
                if (!log) return null;
                return EarlyCheckoutRequest.findOne({ attendanceLog: log._id, status: 'Pending' }).lean();
            })()
        ]);

        // Half-day leave aware: derive from already-fetched leave (no extra query)
        const hasHalfDayLeave = Array.isArray(leaveRequests) && leaveRequests.some(l =>
            l.status === 'Approved' &&
            (l.leaveType === 'Half Day - First Half' || l.leaveType === 'Half Day - Second Half') &&
            Array.isArray(l.leaveDates) &&
            l.leaveDates.some(d => getISTDateString(new Date(d)) === localDate)
        );

        // Required logout: when half-day leave, use 5 hrs base; otherwise from dailyStatus (single pass, no recompute in UI)
        let requiredLogoutAt = dailyStatus?.calculatedLogoutTime || null;
        if (hasHalfDayLeave && dailyStatus?.sessions?.length && dailyStatus?.shift) {
            const halfDayLogout = computeCalculatedLogoutTime(
                dailyStatus.sessions,
                dailyStatus.breaks,
                dailyStatus.attendanceLog,
                dailyStatus.shift,
                dailyStatus.activeBreak || null,
                true
            );
            if (halfDayLogout) requiredLogoutAt = halfDayLogout.requiredLogoutTime;
        }
        const requiredWorkMinutes = hasHalfDayLeave ? 300 : (dailyStatus?.logoutBreakdown?.requiredWorkingMinutes ?? 510);

        const enforceRequiredLogout = !!enforceLogoutSetting?.value;
        const requireAdminApprovalForEarlyCheckout = !!requireApprovalSetting?.value;
        const isClockedIn = dailyStatus?.status === 'Clocked In' || dailyStatus?.status === 'On Break' || dailyStatus?.status === 'On Auto-Break';
        const nowMs = getISTNow().getTime();
        const requiredAtMs = requiredLogoutAt ? new Date(requiredLogoutAt).getTime() : null;
        let canCheckout = !enforceRequiredLogout || !isClockedIn || !requiredLogoutAt
            ? true
            : (nowMs >= requiredAtMs);
        if (pendingEarlyCheckoutRequest) canCheckout = false;
        const remainingTime = (!canCheckout && requiredAtMs != null) ? Math.max(0, Math.ceil((requiredAtMs - nowMs) / 60000)) : null;

        // Today's Shift card uses dailyStatus.calculatedLogoutTime: send half-day–aware value when applicable (no cache mutation)
        const dailyStatusForPayload = {
            ...dailyStatus,
            calculatedLogoutTime: requiredLogoutAt ?? dailyStatus?.calculatedLogoutTime ?? null
        };

        const payload = {
            dailyStatus: dailyStatusForPayload,
            weeklyLogs: Array.isArray(weeklyLogs) ? weeklyLogs : [],
            leaveRequests: Array.isArray(leaveRequests) ? leaveRequests.slice(0, 10) : [],
            requiredLogoutAt: requiredLogoutAt || null,
            canCheckout,
            remainingTime,
            hasHalfDayLeave: !!hasHalfDayLeave,
            requiredWorkMinutes,
            requireAdminApprovalForEarlyCheckout,
            pendingEarlyCheckoutRequest: pendingEarlyCheckoutRequest ? {
                _id: pendingEarlyCheckoutRequest._id,
                status: pendingEarlyCheckoutRequest.status,
                requestedAt: pendingEarlyCheckoutRequest.requestedAt,
                requiredLogoutTime: pendingEarlyCheckoutRequest.requiredLogoutTime,
                remainingTimeMinutes: pendingEarlyCheckoutRequest.remainingTimeMinutes
            } : null
        };
        cache.set(dashboardCacheKey, payload, 45000); // 45s TTL
        res.json(payload);
    } catch (error) {
        console.error("Error fetching employee dashboard data:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// =================================================================
// ENHANCED: /api/attendance/summary (includes holidays)
// Purpose: Include holidays in response to reduce frontend calls
// =================================================================
// Note: The existing /summary endpoint is above. We'll enhance it inline.
// For backward compatibility, we'll add a new query param ?includeHolidays=true
// But we'll also update the response to always include holidays when requested

module.exports = router;
