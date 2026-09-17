// backend/routes/admin/dashboard.js
// Admin dashboard summary, pending leaves, and card employee lists.
// Mounted at /api/admin via routes/admin/index.js

const express = require('express');
const router = express.Router();

const authenticateToken = require('../../middleware/authenticateToken');
const isAdminOrHr = require('../../middleware/requireAdminOrHr');

const User = require('../../models/User');
const AttendanceLog = require('../../models/AttendanceLog');
const AttendanceSession = require('../../models/AttendanceSession');
const LeaveRequest = require('../../models/LeaveRequest');
const ExtraBreakRequest = require('../../models/ExtraBreakRequest');
const EarlyCheckoutRequest = require('../../models/EarlyCheckoutRequest');
const BreakLog = require('../../models/BreakLog');
const { computeCalculatedLogoutTime } = require('../../services/dailyStatusService');
const { getTodayISTKey, parseISTDate, startOfISTDay, endOfISTDay, getShiftDateTimeIST } = require('../../utils/istTime');
const { perfLog, verboseLog } = require('../../utils/logLevel');
const { fetchAbsentTodayEmployees } = require('../../services/dashboardEmployeeLists');

// --- DASHBOARD & LOGS ROUTES ---

// Lightweight endpoint for delta updates: pending leaves only (used by socket-driven refresh).
// Optional cache: TTL 45s; invalidated on leave create/approve/reject/delete.
router.get('/dashboard-pending-leaves', [authenticateToken, isAdminOrHr], async (req, res) => {
    const today = getTodayISTKey();
    try {
        const cacheService = require('../../services/cacheService');
        const cached = cacheService.getPendingLeaves(today);
        if (cached && Array.isArray(cached)) {
            return res.json({ pendingLeaveRequests: cached });
        }
        const pendingLeaveRequests = await LeaveRequest.find({
            status: 'Pending',
            requestType: { $ne: 'YEAR_END' }
        })
            .populate('employee', 'fullName employeeCode')
            .sort({ createdAt: 1 })
            .lean();
        const list = Array.isArray(pendingLeaveRequests) ? pendingLeaveRequests : [];
        try {
            cacheService.setPendingLeaves(today, list, 45);
        } catch (e) {
            // Cache set failure must not break response
        }
        return res.json({ pendingLeaveRequests: list });
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[dashboard-pending-leaves] Error:', error?.message);
        }
        res.status(500).json({ error: 'Failed to fetch pending leave requests.' });
    }
});

// STEP 1 BASELINE: Optimized sections marked below; all response fields preserved (some values null/deferred).
// OPTIMIZED: Cache is effective because base summary is cached without pending leaves;
// when includePendingLeaves=true we return cached base + fetch only pending leaves (no full recompute).
// Policy: Required Log Out minimum 7:00 PM IST for dashboard Who's In (applied to cached and fresh data)
function normalizeWhosInListLogoutTo7PM(whosInList, today) {
    if (!Array.isArray(whosInList) || !today) return whosInList || [];
    const dayStart = startOfISTDay(today);
    const dayEnd = endOfISTDay(today);
    const sevenPM = getShiftDateTimeIST(parseISTDate(today), '19:00');
    return whosInList.map(emp => {
        const logout = emp?.calculatedLogoutTime;
        if (!logout) return emp;
        const t = new Date(logout);
        if (isNaN(t.getTime())) return emp;
        if (t >= dayStart && t <= dayEnd && t < sevenPM) {
            return { ...emp, calculatedLogoutTime: sevenPM.toISOString() };
        }
        return emp;
    });
}

router.get('/dashboard-summary', [authenticateToken, isAdminOrHr], async (req, res) => {
    const startMs = Date.now();
    const today = getTodayISTKey();
    const { includePendingLeaves } = req.query;
    const shouldIncludePendingLeaves = includePendingLeaves === 'true' || includePendingLeaves === true;
    try {
        const cacheService = require('../../services/cacheService');
        let cachedSummary = null;
        const t0 = Date.now();
        try {
            cachedSummary = cacheService.getDashboardSummary(today) ?? null;
        } catch (cacheErr) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[dashboard-summary] Cache get failed, falling back to full computation:', cacheErr?.message);
            }
        }
        perfLog(`[ADMIN_DASHBOARD_TIMING] cache_lookup took ${Date.now() - t0}ms`);
        if (cachedSummary && !shouldIncludePendingLeaves) {
            verboseLog('[dashboard-summary] cache=hit includePendingLeaves=false ms=', Date.now() - startMs);
            let absentTodayList = cachedSummary.absentTodayList;
            if (!Array.isArray(absentTodayList)) {
                absentTodayList = await fetchAbsentTodayEmployees(today);
            }
            const normalized = {
                ...cachedSummary,
                absentCount: absentTodayList.length,
                absentTodayList,
                whosInList: normalizeWhosInListLogoutTo7PM(cachedSummary.whosInList, today)
            };
            return res.json(normalized);
        }

        // CACHE HIT + pending leaves requested: attach pending leaves to cached base (no full recompute)
        if (cachedSummary && shouldIncludePendingLeaves) {
            const t1 = Date.now();
            try {
                const pendingLeaveRequests = await LeaveRequest.find({
                    status: 'Pending',
                    requestType: { $ne: 'YEAR_END' }
                })
                    .populate('employee', 'fullName employeeCode')
                    .sort({ createdAt: 1 })
                    .lean();
                perfLog(`[ADMIN_DASHBOARD_TIMING] pending_leaves_query took ${Date.now() - t1}ms`);
                verboseLog('[dashboard-summary] cache=hit includePendingLeaves=true ms=', Date.now() - startMs);
                let absentTodayList = cachedSummary.absentTodayList;
                if (!Array.isArray(absentTodayList)) {
                    absentTodayList = await fetchAbsentTodayEmployees(today);
                }
                const normalizedSummary = {
                    ...cachedSummary,
                    absentCount: absentTodayList.length,
                    absentTodayList,
                    whosInList: normalizeWhosInListLogoutTo7PM(cachedSummary.whosInList, today)
                };
                return res.json({
                    summary: normalizedSummary,
                    pendingLeaveRequests: Array.isArray(pendingLeaveRequests) ? pendingLeaveRequests : []
                });
            } catch (leaveError) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('[dashboard-summary] Pending leaves fetch failed, returning cached summary only:', leaveError?.message);
                }
                let absentTodayList = cachedSummary.absentTodayList;
                if (!Array.isArray(absentTodayList)) {
                    absentTodayList = await fetchAbsentTodayEmployees(today);
                }
                const normalizedSummary = {
                    ...cachedSummary,
                    absentCount: absentTodayList.length,
                    absentTodayList,
                    whosInList: normalizeWhosInListLogoutTo7PM(cachedSummary.whosInList, today)
                };
                return res.json({
                    summary: normalizedSummary,
                    pendingLeaveRequests: []
                });
            }
        }

        // CACHE MISS: Compute base dashboard summary (no N+1 in Who's In)
        verboseLog('[dashboard-summary] cache=miss computing full summary');
        perfLog(`[ADMIN_DASHBOARD_TIMING] cache=miss, starting full computation`);
        // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in counts)
        const t2 = Date.now();
        const totalEmployeesPromise = User.countDocuments({ role: { $ne: 'Admin' }, isActive: true }).lean();
        const todayLogsPromise = AttendanceLog.find({ attendanceDate: today })
            .select('user isLate isHalfDay clockInTime attendanceDate')
            .lean();

        const whosInListPromise = AttendanceSession.aggregate([
            { $match: { endTime: null } },
            {
                $lookup: {
                    from: 'attendancelogs',
                    localField: 'attendanceLog',
                    foreignField: '_id',
                    as: 'attendanceLogInfo',
                    pipeline: [
                        { $match: { attendanceDate: today } },
                        { $project: { user: 1, attendanceDate: 1 } }
                    ]
                }
            },
            { $unwind: '$attendanceLogInfo' },
            { $sort: { startTime: 1 } },
            {
                $group: {
                    _id: '$attendanceLogInfo.user',
                    startTime: { $first: '$startTime' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user',
                    pipeline: [
                        { $project: { fullName: 1, designation: 1, profileImageUrl: 1 } }
                    ]
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: '$user._id',
                    fullName: '$user.fullName',
                    designation: '$user.designation',
                    startTime: '$startTime',
                    profileImageUrl: '$user.profileImageUrl'
                }
            },
            { $sort: { startTime: 1 } }
        ]);

        const recentNotesPromise = AttendanceLog.find({
            attendanceDate: today,
            notes: { $ne: null, $ne: '' }
        })
            .populate('user', 'fullName employeeCode')
            .select('notes updatedAt user')
            .sort({ updatedAt: -1 })
            .limit(5)
            .lean();

        const pendingBreaksPromise = ExtraBreakRequest.find({
            status: 'Pending'
        })
            .populate('user', 'fullName employeeCode')
            .select('reason createdAt user')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const backdatedLeavesPromise = LeaveRequest.find({
            isBackdated: true,
            status: 'Pending'
        })
            .populate('employee', 'fullName employeeCode')
            .select('reason createdAt employee')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const pendingEarlyCheckoutPromise = EarlyCheckoutRequest.find({ status: 'Pending' })
            .populate('employee', 'fullName employeeCode')
            .select('reason remainingTimeMinutes requestedAt createdAt employee attendanceLog')
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const [totalEmployees, todayLogs, whosInListRaw, recentNotes, pendingBreaks, backdatedLeaves, pendingEarlyCheckouts] = await Promise.all([
            totalEmployeesPromise,
            todayLogsPromise,
            whosInListPromise,
            recentNotesPromise,
            pendingBreaksPromise,
            backdatedLeavesPromise,
            pendingEarlyCheckoutPromise
        ]);
        perfLog(`[ADMIN_DASHBOARD_TIMING] parallel_queries took ${Date.now() - t2}ms`);

        // PERFORMANCE FIX: Batch-load all data for Who's In list to eliminate N+1 queries
        const t3 = Date.now();
        const rawList = Array.isArray(whosInListRaw) ? whosInListRaw : [];
        perfLog(`[ADMIN_DASHBOARD_TIMING] whosInList_count=${rawList.length}`);
        
        // Check cache first for all employees
        const uncachedEmployees = [];
        const whosInList = [];
        
        for (const employee of rawList) {
            const cached = cacheService.getDailyStatus(employee?._id, today);
            if (cached && (cached.calculatedLogoutTime !== undefined || cached.activeBreak !== undefined)) {
                whosInList.push({
                    _id: employee?._id,
                    fullName: employee?.fullName ?? '',
                    designation: employee?.designation ?? '',
                    startTime: employee?.startTime ?? null,
                    profileImageUrl: employee?.profileImageUrl ?? null,
                    calculatedLogoutTime: cached.calculatedLogoutTime ?? null,
                    logoutBreakdown: cached.logoutBreakdown,
                    activeBreak: cached.activeBreak ?? null
                });
            } else {
                uncachedEmployees.push(employee);
            }
        }
        
        perfLog(`[ADMIN_DASHBOARD_TIMING] cache_hits=${rawList.length - uncachedEmployees.length} cache_misses=${uncachedEmployees.length}`);
        
        // For uncached employees, batch-load all required data in 3 parallel queries
        if (uncachedEmployees.length > 0) {
            const t3a = Date.now();
            const userIds = uncachedEmployees.map(e => e._id);
            
            // Batch query 1: All attendance logs for these users today
            const attendanceLogsMap = new Map();
            const attendanceLogs = await AttendanceLog.find({
                user: { $in: userIds },
                attendanceDate: today
            }).lean();
            attendanceLogs.forEach(log => {
                attendanceLogsMap.set(log.user.toString(), log);
            });
            
            const logIds = attendanceLogs.map(log => log._id);
            // Batch queries 2–5: active breaks, users with shift, all sessions, all breaks (for logout calculation)
            const batchPromises = [
                User.find({ _id: { $in: userIds } }).populate('shiftGroup').lean(),
                logIds.length > 0 ? BreakLog.find({ attendanceLog: { $in: logIds }, endTime: null }).lean() : Promise.resolve([]),
                logIds.length > 0 ? AttendanceSession.find({ attendanceLog: { $in: logIds } }).sort({ startTime: 1 }).lean() : Promise.resolve([]),
                logIds.length > 0 ? BreakLog.find({ attendanceLog: { $in: logIds } }).sort({ startTime: 1 }).lean() : Promise.resolve([]),
            ];
            const [usersList, activeBreaksList, sessionsList, allBreaksList] = await Promise.all(batchPromises);
            
            const activeBreaksMap = new Map();
            (activeBreaksList || []).forEach(brk => {
                activeBreaksMap.set(brk.attendanceLog.toString(), brk);
            });
            const sessionsByLogId = new Map();
            (sessionsList || []).forEach(s => {
                const key = s.attendanceLog.toString();
                if (!sessionsByLogId.has(key)) sessionsByLogId.set(key, []);
                sessionsByLogId.get(key).push(s);
            });
            const breaksByLogId = new Map();
            (allBreaksList || []).forEach(b => {
                const key = b.attendanceLog.toString();
                if (!breaksByLogId.has(key)) breaksByLogId.set(key, []);
                breaksByLogId.get(key).push(b);
            });
            const usersMap = new Map();
            (usersList || []).forEach(user => {
                usersMap.set(user._id.toString(), user);
            });
            
            perfLog(`[ADMIN_DASHBOARD_TIMING] batch_queries took ${Date.now() - t3a}ms`);
            
            // Now process each uncached employee with pre-loaded data (no DB calls)
            const t3b = Date.now();
            for (const employee of uncachedEmployees) {
                const userId = employee._id.toString();
                const attendanceLog = attendanceLogsMap.get(userId);
                const user = usersMap.get(userId);
                
                let calculatedLogoutTime = null;
                let logoutBreakdown = undefined;
                let activeBreak = null;
                
                if (attendanceLog && user?.shiftGroup) {
                    const activeBreakDoc = activeBreaksMap.get(attendanceLog._id.toString());
                    if (activeBreakDoc) {
                        activeBreak = {
                            startTime: activeBreakDoc.startTime,
                            breakType: activeBreakDoc.breakType
                        };
                    }
                    const sessions = sessionsByLogId.get(attendanceLog._id.toString()) || [];
                    const breaks = breaksByLogId.get(attendanceLog._id.toString()) || [];
                    const logoutResult = computeCalculatedLogoutTime(sessions, breaks, attendanceLog, user.shiftGroup, activeBreak);
                    if (logoutResult) {
                        calculatedLogoutTime = logoutResult.requiredLogoutTime;
                        logoutBreakdown = logoutResult.breakdown;
                    }
                }
                
                const enriched = {
                    _id: employee._id,
                    fullName: employee.fullName ?? '',
                    designation: employee.designation ?? '',
                    startTime: employee.startTime ?? null,
                    profileImageUrl: employee.profileImageUrl ?? null,
                    calculatedLogoutTime,
                    logoutBreakdown,
                    activeBreak
                };
                
                whosInList.push(enriched);
                
                // Cache the result
                cacheService.setDailyStatus(employee._id, today, {
                    calculatedLogoutTime,
                    logoutBreakdown,
                    activeBreak
                });
            }
            perfLog(`[ADMIN_DASHBOARD_TIMING] uncached_processing took ${Date.now() - t3b}ms`);
        }
        
        perfLog(`[ADMIN_DASHBOARD_TIMING] whosInList_enrichment took ${Date.now() - t3}ms`);

        const t4 = Date.now();
        let presentCount = 0;
        let lateCount = 0;
        perfLog(`[ADMIN_DASHBOARD_TIMING] count_calculation_start took ${Date.now() - t4}ms`);
        perfLog(`[ADMIN_DASHBOARD_DEBUG] todayLogs.length=${(todayLogs || []).length}`);

        // Count ALL employees who clocked in as present (both on-time and late)
        // Late employees are a subset of present employees
        (todayLogs || []).forEach(log => {
            if (log?.clockInTime) {
                presentCount++; // Count all clocked-in employees
                if (log.isLate) {
                    lateCount++; // Also count late employees separately
                }
            }
        });
        
        perfLog(`[ADMIN_DASHBOARD_DEBUG] After forEach: presentCount=${presentCount}, lateCount=${lateCount}`);

        if ((todayLogs || []).length === 0) {
            const logIds = await AttendanceLog.find({ attendanceDate: today }).select('_id').lean();
            const activeSessionsCount = await AttendanceSession.countDocuments({
                endTime: null,
                attendanceLog: { $in: (logIds || []).map((l) => l._id) }
            });
            presentCount = activeSessionsCount;
        }

        if (presentCount === 0 && lateCount === 0) {
            const allClockedInCount = await AttendanceLog.countDocuments({
                attendanceDate: today,
                clockInTime: { $exists: true, $ne: null }
            });
            presentCount = allClockedInCount ?? 0;
        }

        const t5 = Date.now();
        const todayDate = new Date(today);
        const startOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
        const endOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1);

        const onLeaveCount = await LeaveRequest.countDocuments({
            status: 'Approved',
            leaveDates: {
                $elemMatch: {
                    $gte: startOfDay,
                    $lt: endOfDay
                }
            }
        });
        perfLog(`[ADMIN_DASHBOARD_TIMING] onLeaveCount_query took ${Date.now() - t5}ms`);

        const statusCounts = {
            'Present': presentCount,
            'Late': lateCount,
            'On Leave': onLeaveCount ?? 0
        };

        const mappedNotes = (recentNotes || []).map(n => ({
            _id: n._id,
            type: 'Note',
            user: n.user,
            content: n.notes,
            timestamp: n.updatedAt
        }));
        const mappedBreakRequests = (pendingBreaks || []).map(b => ({
            _id: b._id,
            type: 'ExtraBreakRequest',
            user: b.user,
            content: b.reason,
            timestamp: b.createdAt
        }));
        const mappedLeaveRequests = (backdatedLeaves || []).map(l => ({
            _id: l._id,
            type: 'BackdatedLeaveRequest',
            user: l.employee,
            content: l.reason,
            timestamp: l.createdAt
        }));
        const mappedEarlyCheckouts = (pendingEarlyCheckouts || []).map(ec => ({
            _id: ec._id,
            type: 'EarlyCheckoutRequest',
            user: ec.employee,
            content: (ec.reason && ec.reason.length > 60 ? ec.reason.slice(0, 60) + '…' : ec.reason) || '',
            timestamp: ec.createdAt,
            remainingTimeMinutes: ec.remainingTimeMinutes,
            requestedAt: ec.requestedAt
        }));

        const t6 = Date.now();
        const recentActivity = [...mappedNotes, ...mappedBreakRequests, ...mappedLeaveRequests, ...mappedEarlyCheckouts]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const absentTodayList = await fetchAbsentTodayEmployees(today);
        perfLog(`[ADMIN_DASHBOARD_TIMING] absentTodayList_count=${absentTodayList.length} took ${Date.now() - t6}ms`);

        const summary = {
            totalEmployees: totalEmployees ?? 0,
            presentCount: statusCounts['Present'],
            lateCount: statusCounts['Late'],
            onLeaveCount: statusCounts['On Leave'],
            absentCount: absentTodayList.length,
            absentTodayList,
            whosInList: normalizeWhosInListLogoutTo7PM(whosInList || [], today),
            recentActivity: recentActivity || []
        };

        try {
            cacheService.setDashboardSummary(today, summary);
        } catch (setCacheErr) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[dashboard-summary] Cache set failed:', setCacheErr?.message);
            }
        }
        perfLog(`[ADMIN_DASHBOARD_TIMING] summary_assembly_and_cache_set took ${Date.now() - t6}ms`);

        if (shouldIncludePendingLeaves) {
            try {
                const pendingLeaveRequests = await LeaveRequest.find({
                    status: 'Pending',
                    requestType: { $ne: 'YEAR_END' }
                })
                    .populate('employee', 'fullName employeeCode')
                    .sort({ createdAt: 1 })
                    .lean();
                verboseLog('[dashboard-summary] cache=miss includePendingLeaves=true ms=', Date.now() - startMs);
                return res.json({
                    summary,
                    pendingLeaveRequests: Array.isArray(pendingLeaveRequests) ? pendingLeaveRequests : []
                });
            } catch (leaveError) {
                if (process.env.NODE_ENV !== 'production') {
                    console.warn('[dashboard-summary] Pending leaves fetch failed:', leaveError?.message);
                }
                return res.json({
                    summary,
                    pendingLeaveRequests: []
                });
            }
        }

        verboseLog('[dashboard-summary] cache=miss ms=', Date.now() - startMs);
        perfLog(`[ADMIN_DASHBOARD_TIMING] TOTAL_TIME=${Date.now() - startMs}ms`);
        res.json(summary);
    } catch (error) {
        perfLog(`[ADMIN_DASHBOARD_TIMING] ERROR after ${Date.now() - startMs}ms:`, error.message);
        if (process.env.NODE_ENV !== 'production') {
            console.error('[dashboard-summary] Error:', error);
        }
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// New endpoint to get detailed employee lists for dashboard cards (supports pagination)
router.get('/dashboard-employees/:type', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { type } = req.params;
    const today = getTodayISTKey();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    try {
        let employees = [];
        let total = 0;

        switch (type) {
            case 'present':
                // Find ALL employees who are present (clocked in, including late employees)
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                const presentLogs = await AttendanceLog.find({
                    attendanceDate: today,
                    clockInTime: { $exists: true, $ne: null }
                }).populate({
                    path: 'user',
                    match: { role: { $ne: 'Admin' }, isActive: true },
                    select: 'fullName employeeCode designation department profileImageUrl'
                }).lean();

                // If no present logs found, try to find employees with active attendance sessions
                if (presentLogs.length === 0) {
                    const AttendanceSession = require('../../models/AttendanceSession');

                    const activeSessions = await AttendanceSession.aggregate([
                        { $match: { endTime: null } },
                        {
                            $lookup: {
                                from: 'attendancelogs',
                                localField: 'attendanceLog',
                                foreignField: '_id',
                                as: 'attendanceLogInfo',
                                pipeline: [
                                    { $match: { attendanceDate: today } },
                                    { $project: { user: 1, attendanceDate: 1 } }
                                ]
                            }
                        },
                        { $unwind: '$attendanceLogInfo' },
                        {
                            $lookup: {
                                from: 'users',
                                localField: 'attendanceLogInfo.user',
                                foreignField: '_id',
                                as: 'user',
                                pipeline: [
                                    // Filter: Exclude Admin role and inactive users
                                    { $match: { role: { $ne: 'Admin' }, isActive: true } },
                                    { $project: { fullName: 1, employeeCode: 1, designation: 1, department: 1, profileImageUrl: 1 } }
                                ]
                            }
                        },
                        { $unwind: '$user' },
                        {
                            $project: {
                                _id: '$user._id',
                                fullName: '$user.fullName',
                                employeeCode: '$user.employeeCode',
                                designation: '$user.designation',
                                department: '$user.department',
                                profileImageUrl: '$user.profileImageUrl',
                                clockInTime: '$startTime',
                                status: 'Present'
                            }
                        }
                    ]);


                    employees = activeSessions;
                } else {
                    // Filter out null users (from populate match filter) and inactive/Admin users
                    employees = presentLogs
                        .filter(log => log.user && log.user._id) // Remove null users from populate match
                        .map(log => ({
                            _id: log.user._id,
                            fullName: log.user.fullName,
                            employeeCode: log.user.employeeCode,
                            designation: log.user.designation,
                            department: log.user.department,
                            profileImageUrl: log.user.profileImageUrl,
                            clockInTime: log.clockInTime,
                            status: 'Present',
                            notes: log.notes
                        }));
                }
                break;

            case 'late':
                // Find employees who are late
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                const lateLogs = await AttendanceLog.find({
                    attendanceDate: today,
                    clockInTime: { $exists: true, $ne: null },
                    isLate: true
                }).populate({
                    path: 'user',
                    match: { role: { $ne: 'Admin' }, isActive: true },
                    select: 'fullName employeeCode designation department profileImageUrl'
                }).lean();


                // Filter out null users (from populate match filter)
                employees = lateLogs
                    .filter(log => log.user && log.user._id)
                    .map(log => ({
                        _id: log.user._id,
                        fullName: log.user.fullName,
                        employeeCode: log.user.employeeCode,
                        designation: log.user.designation,
                        department: log.user.department,
                        profileImageUrl: log.user.profileImageUrl,
                        clockInTime: log.clockInTime,
                        status: 'Late',
                        notes: log.notes
                    }));
                break;

            case 'on-leave':
                // Find employees who are on approved leave for today
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                const todayDate = new Date(today);
                const startOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
                const endOfDay = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1);

                const approvedLeaves = await LeaveRequest.find({
                    status: 'Approved',
                    leaveDates: {
                        $elemMatch: {
                            $gte: startOfDay,
                            $lt: endOfDay
                        }
                    }
                }).populate({
                    path: 'employee',
                    match: { role: { $ne: 'Admin' }, isActive: true },
                    select: 'fullName employeeCode designation department profileImageUrl'
                }).lean();


                // Filter out null employees (from populate match filter)
                employees = approvedLeaves
                    .filter(leave => leave.employee && leave.employee._id)
                    .map(leave => ({
                        _id: leave.employee._id,
                        fullName: leave.employee.fullName,
                        employeeCode: leave.employee.employeeCode,
                        designation: leave.employee.designation,
                        department: leave.employee.department,
                        profileImageUrl: leave.employee.profileImageUrl,
                        status: 'On Leave',
                        leaveType: leave.requestType,
                        leaveReason: leave.reason
                    }));
                break;

            case 'total':
                // Filter: Exclude Admin role and inactive users; paginate at DB level
                total = await User.countDocuments({ role: { $ne: 'Admin' }, isActive: true });
                const allEmployees = await User.find({ role: { $ne: 'Admin' }, isActive: true })
                    .select('fullName employeeCode designation department profileImageUrl role employmentStatus joiningDate')
                    .sort({ fullName: 1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();

                employees = allEmployees.map(emp => ({
                    _id: emp._id,
                    fullName: emp.fullName,
                    employeeCode: emp.employeeCode,
                    designation: emp.designation,
                    department: emp.department,
                    profileImageUrl: emp.profileImageUrl,
                    role: emp.role,
                    employmentStatus: emp.employmentStatus,
                    joiningDate: emp.joiningDate
                }));
                break;

            case 'absent':
                employees = await fetchAbsentTodayEmployees(today);
                break;

            default:
                return res.status(400).json({ error: 'Invalid employee type' });
        }

        // For present/late/on-leave, total = full list length; for total, already set from countDocuments
        if (type !== 'total') {
            total = employees.length;
        }
        const items = type === 'total' ? employees : employees.slice(skip, skip + limit);
        const hasMore = skip + items.length < total;
        return res.json({ items, page, limit, total, hasMore });
    } catch (error) {
        console.error(`Error fetching ${type} employees:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
module.exports = router;
