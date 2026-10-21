/**
 * ATTENDANCE SUMMARY SERVICE
 * 
 * SINGLE SOURCE OF TRUTH for attendance summary logic.
 * Extracted from /api/attendance/summary route to be reusable across the application.
 * 
 * This service provides resolved attendance status for employees over a date range,
 * applying the same logic as the Admin Attendance Summary page.
 * 
 * STATUS PRECEDENCE (enforced by attendanceStatusResolver):
 * 1. Holiday
 * 2. Approved Leave
 * 3. Weekly Off (Saturday/Sunday based on policy)
 * 4. Present (has attendance sessions)
 * 5. Half-day (marked as half-day)
 * 6. Absent (working day with no attendance)
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const { resolveAttendanceStatus, generateDateRange } = require('../utils/attendanceStatusResolver');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const { getISTDateString, parseISTDate, getShiftDateTimeIST } = require('../utils/istTime');
const {
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY,
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY,
} = require('../config/shiftPolicy');

/**
 * Get employee attendance summary with full status resolution
 * 
 * @param {string|ObjectId} employeeId - Employee user ID
 * @param {string|Date} startDate - Start date (YYYY-MM-DD or Date object)
 * @param {string|Date} endDate - End date (YYYY-MM-DD or Date object)
 * @param {Object} [sharedData=null] - Optional pre-fetched shared data to avoid duplicate queries
 * @param {Array} [sharedData.holidays] - Pre-fetched holidays array
 * @param {number} [sharedData.gracePeriodMinutes] - Pre-fetched grace period in minutes
 * @returns {Promise<Array>} Array of attendance summary objects with resolved status
 * 
 * Each object contains:
 * - date: 'YYYY-MM-DD'
 * - finalStatus: 'Present' | 'Half-day' | 'Absent' | 'Holiday' | 'Weekly Off' | 'Leave'
 * - isHalfDay: boolean
 * - isHoliday: boolean
 * - isWeeklyOff: boolean
 * - isLeave: boolean
 * - isAbsent: boolean
 * - halfDayReasonCode: string | null
 * - halfDayReasonText: string | null
 * - totalWorkingHours: number (in hours, includes admin overrides)
 */
async function getEmployeeAttendanceSummary(employeeId, startDate, endDate, sharedData = null) {
    // Normalize dates to YYYY-MM-DD format
    const startDateStr = typeof startDate === 'string' ? startDate : getISTDateString(startDate);
    const endDateStr = typeof endDate === 'string' ? endDate : getISTDateString(endDate);
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }
    
    // Validate employee ID
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        throw new Error('Invalid employee ID format.');
    }
    
    const dateRange = generateDateRange(startDateStr, endDateStr);
    
    // Fetch all required data in parallel
    const [employee, logs, leaveRequests, userWithShift] = await Promise.all([
        // Fetch employee to get Saturday policy
        User.findById(employeeId).select('alternateSaturdayPolicy').lean(),
        
        // Fetch attendance logs for date range with sessions and breaks
        AttendanceLog.aggregate([
            { 
                $match: { 
                    user: new mongoose.Types.ObjectId(employeeId), 
                    attendanceDate: { $gte: startDateStr, $lte: endDateStr } 
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
                    lateMinutes: 1,
                    totalWorkingHours: 1,
                    leaveRequest: 1,
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
                    }
                } 
            },
            { $sort: { attendanceDate: 1 } }
        ]),
        
        // Fetch all approved leave requests for the date range
        LeaveRequest.find({
            employee: new mongoose.Types.ObjectId(employeeId),
            status: 'Approved',
            leaveDates: {
                $elemMatch: {
                    $gte: parseISTDate(startDateStr),
                    $lte: parseISTDate(endDateStr + 'T23:59:59+05:30')
                }
            }
        }).sort({ createdAt: 1 }).lean(),
        
        // Fetch user with shiftGroup for lateMinutes recalculation
        User.findById(employeeId).populate('shiftGroup').lean()
    ]);
    
    // Use shared data if available, otherwise fetch
    const holidays = sharedData?.holidays || await (async () => {
        const startDateIST = parseISTDate(startDateStr);
        const endDateIST = parseISTDate(endDateStr);
        return Holiday.find({
            date: {
                $gte: startDateIST,
                $lte: endDateIST
            },
            isTentative: { $ne: true }
        }).sort({ date: 1 }).lean();
    })();
    
    const gracePeriodMinutes = sharedData?.gracePeriodMinutes !== undefined 
        ? sharedData.gracePeriodMinutes 
        : await getGracePeriodMinutes();
    
    // Validate employee exists
    if (!employee) {
        throw new Error(`Employee not found for ID: ${employeeId}`);
    }
    
    // Get Saturday policy (from User.alternateSaturdayPolicy field)
    let saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
    
    // Defensive check: Validate saturdayPolicy value
    const validPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
    if (!validPolicies.includes(saturdayPolicy)) {
        console.warn(`[AttendanceSummaryService] Invalid saturdayPolicy for userId ${employeeId}: ${saturdayPolicy}, defaulting to 'All Saturdays Working'`);
        saturdayPolicy = 'All Saturdays Working';
    }
    
    // Create maps for quick lookup
    const logsMap = new Map();
    logs.forEach(log => {
        logsMap.set(log.attendanceDate, log);
    });
    
    const leaveRequestsMap = new Map();
    // Only map leaves that are actually approved
    leaveRequests.forEach(leave => {
        if (!leave || leave.status !== 'Approved') {
            return; // Skip non-approved or null leaves
        }
        
        if (Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
            leave.leaveDates.forEach(leaveDate => {
                const leaveDateStr = getISTDateString(leaveDate);
                if (leaveDateStr >= startDateStr && leaveDateStr <= endDateStr) {
                    if (!leaveRequestsMap.has(leaveDateStr)) {
                        leaveRequestsMap.set(leaveDateStr, leave);
                    }
                }
            });
        }
    });
    
    // Clean up attendance logs that reference deleted leaves
    const validLeaveIds = new Set(leaveRequests.map(l => l._id.toString()));
    
    for (const log of logs) {
        const leaveRefId = log.leaveRequest?.toString();
        const hasOrphanedLeaveRef = leaveRefId && !validLeaveIds.has(leaveRefId);
        const hasLeaveStatusButNoLeave = log.attendanceStatus === 'Leave' && !leaveRequestsMap.has(log.attendanceDate);
        
        if (hasOrphanedLeaveRef || hasLeaveStatusButNoLeave) {
            // Clean up the log object for this response
            log.leaveRequest = null;
            if (!log.clockInTime && !log.clockOutTime && log.attendanceStatus === 'Leave') {
                log.attendanceStatus = 'Absent';
                log.isLate = false;
                log.isHalfDay = false;
                log.lateMinutes = 0;
            }
        }
    }
    
    // Process each date in the range and resolve status
    const resolvedLogs = dateRange.map(attendanceDate => {
        const log = logsMap.get(attendanceDate) || null;
        let leaveRequest = leaveRequestsMap.get(attendanceDate) || null;
        
        // If log has leaveRequest reference, verify it's still valid
        if (log && log.leaveRequest && !leaveRequest) {
            leaveRequest = null; // Don't use the orphaned reference
        }
        
        const statusInfo = resolveAttendanceStatus({
            attendanceDate,
            attendanceLog: log,
            holidays: holidays || [],
            leaveRequest,
            saturdayPolicy,
            gracePeriodMinutes
        });
        
        // Handle half-day leave with no check-in
        let effectiveLeaveInfo = statusInfo.leaveInfo;
        const isHalfDayLeaveDoc = leaveRequest && (leaveRequest.leaveType === 'Half Day - First Half' || leaveRequest.leaveType === 'Half Day - Second Half');
        const wasVoidedByLeaveApproval = log?.notes && String(log.notes).includes('AUTO-VOID');
        const hasActualCheckIn = log && log.clockInTime != null && !wasVoidedByLeaveApproval;
        const hasNoCheckIn = !log || (log.clockInTime == null && !wasVoidedByLeaveApproval);
        
        if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasNoCheckIn) {
            effectiveLeaveInfo = {
                ...effectiveLeaveInfo,
                leaveType: 'Full Day',
                requestType: 'Loss of Pay',
            };
        } else if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasActualCheckIn && leaveRequest.autoConvertedToLOP) {
            effectiveLeaveInfo = {
                ...effectiveLeaveInfo,
                leaveType: leaveRequest.originalLeaveType || leaveRequest.leaveType,
                requestType: leaveRequest.originalRequestType || 'Planned',
            };
        }
        const effectiveIsHalfDayLeave = effectiveLeaveInfo && (effectiveLeaveInfo.leaveType === 'Half Day - First Half' || effectiveLeaveInfo.leaveType === 'Half Day - Second Half');
        
        // Build simplified response object for probation tracker
        return {
            date: attendanceDate,
            finalStatus: statusInfo.status,
            isHalfDay: statusInfo.isLeave ? effectiveIsHalfDayLeave : statusInfo.isHalfDay,
            isHoliday: statusInfo.isHoliday,
            isWeeklyOff: statusInfo.isWeeklyOff,
            isLeave: statusInfo.isLeave,
            isAbsent: statusInfo.isAbsent,
            halfDayReasonCode: statusInfo.halfDayReasonCode || null,
            halfDayReasonText: statusInfo.halfDayReason || null,
            overriddenByAdmin: statusInfo.overriddenByAdmin || false,
            totalWorkingHours: log?.totalWorkingHours || 0  // Include working hours for Analytics
        };
    });
    
    return resolvedLogs;
}

/**
 * Fetch holidays for a date range
 * 
 * @param {string|Date} startDate - Start date (YYYY-MM-DD or Date object)
 * @param {string|Date} endDate - End date (YYYY-MM-DD or Date object)
 * @returns {Promise<Array>} Array of holiday objects
 */
async function fetchHolidaysForDateRange(startDate, endDate) {
    const startDateStr = typeof startDate === 'string' ? startDate : getISTDateString(startDate);
    const endDateStr = typeof endDate === 'string' ? endDate : getISTDateString(endDate);
    
    const startDateIST = parseISTDate(startDateStr);
    const endDateIST = parseISTDate(endDateStr);
    
    const holidays = await Holiday.find({
        date: {
            $gte: startDateIST,
            $lte: endDateIST
        },
        isTentative: { $ne: true }
    }).sort({ date: 1 }).lean();
    
    return holidays;
}

const HALF_DAY_LEAVE_TYPES = ['Half Day - First Half', 'Half Day - Second Half'];

const musterCodeFromResolved = (entry, dateKey, employee, todayKey) => {
    if (dateKey > todayKey) return 'N/A';

    const startSource = employee?.joiningDate || employee?.createdAt;
    if (startSource) {
        const startKey = getISTDateString(new Date(startSource));
        if (dateKey < startKey) return 'N/A';
    }

    if (!entry) return dateKey < todayKey ? 'A' : 'N/A';

    const leaveType = entry.leaveInfo?.leaveType || '';
    const requestType = entry.leaveInfo?.requestType || '';
    const halfDayLeave = entry.hasHalfDayLeave
        || HALF_DAY_LEAVE_TYPES.includes(leaveType)
        || String(leaveType).startsWith('Half Day');

    if (entry.isHoliday || entry.attendanceStatus === 'Holiday') return 'HL';
    if (entry.isWeeklyOff || entry.attendanceStatus === 'Weekly Off') return 'W';
    if (halfDayLeave) return 'HF';
    if (entry.isLeave || entry.attendanceStatus === 'Leave') {
        if (String(requestType).toLowerCase().includes('loss of pay')) return 'LOP';
        if (leaveType === 'Full Day') return 'FF';
        return 'L';
    }
    if (entry.isHalfDay || entry.attendanceStatus === 'Half-day' || entry.attendanceStatus === 'Half Day') return 'HD';
    if (entry.attendanceStatus === 'On-time' || entry.attendanceStatus === 'Late' || entry.attendanceStatus === 'Present') return 'P';
    if (entry.isAbsent || entry.attendanceStatus === 'Absent') return 'A';
    return 'N/A';
};

/**
 * Same post-resolution rules the summary route applies after resolveAttendanceStatus:
 * elapsed shift hours decide Present / Half-day / Absent, and an open shift today stays Present.
 */
const applySummaryHoursOverride = (resolved, log, employee, gracePeriodMinutes, attendanceDate, todayKey) => {
    if (!log?.sessions?.length || !log.sessions[0]?.startTime) return resolved;

    const next = { ...resolved };
    const hasCheckout = !!(log.clockInTime && log.clockOutTime);
    if (attendanceDate === todayKey && !hasCheckout && (next.isHalfDay || next.attendanceStatus === 'Half-day')) {
        next.attendanceStatus = 'On-time';
        next.isHalfDay = false;
        next.isAbsent = false;
    }

    if (log.overriddenByAdmin) return next;

    const shiftStart = employee?.shiftGroup?.startTime;
    if (!shiftStart || gracePeriodMinutes == null) return next;

    const firstCheckInTime = new Date(log.sessions[0].startTime);
    const shiftStartTime = getShiftDateTimeIST(firstCheckInTime, shiftStart);
    const lateMinutes = Math.max(0, Math.floor((firstCheckInTime - shiftStartTime) / (1000 * 60)));
    const elapsedShiftHours = hasCheckout
        ? (new Date(log.clockOutTime) - new Date(log.clockInTime)) / (1000 * 60 * 60)
        : null;

    const belowHalfDay = hasCheckout && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY;
    const halfDayHours = hasCheckout
        && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY
        && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY;
    const fullDayHours = elapsedShiftHours != null && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY;
    const withinGrace = lateMinutes <= gracePeriodMinutes;

    if (belowHalfDay) {
        next.isHalfDay = false;
        next.isAbsent = true;
        next.attendanceStatus = 'Absent';
    } else if (withinGrace && fullDayHours) {
        next.isHalfDay = false;
        next.isAbsent = false;
        next.attendanceStatus = 'On-time';
    } else if (halfDayHours) {
        next.isHalfDay = true;
        next.isAbsent = false;
        next.attendanceStatus = 'Half-day';
    } else if (fullDayHours) {
        const lateArrivalMarksHalfDay = !!employee?.featurePermissions?.lateArrivalMarksHalfDay;
        next.isAbsent = false;
        if (lateArrivalMarksHalfDay) {
            next.isHalfDay = true;
            next.attendanceStatus = 'Half-day';
        } else {
            next.isHalfDay = false;
            next.attendanceStatus = 'On-time';
        }
    }

    return next;
};

/**
 * One-pass muster roll for every active employee in a month.
 * Status resolution stays on the backend (same resolver as the summary page).
 * Sessions are not loaded; only whether a session exists, which is all the resolver needs.
 */
async function getMusterRoll(startDate, endDate) {
    const startDateStr = typeof startDate === 'string' ? startDate : getISTDateString(startDate);
    const endDateStr = typeof endDate === 'string' ? endDate : getISTDateString(endDate);
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }

    const dateRange = generateDateRange(startDateStr, endDateStr);
    const rangeStart = parseISTDate(startDateStr);
    const rangeEnd = parseISTDate(`${endDateStr}T23:59:59+05:30`);

    const [employees, holidays, gracePeriodMinutes, logs, leaveRequests] = await Promise.all([
        User.find({
            isActive: { $ne: false },
            role: { $in: ['Employee', 'HR', 'Intern', 'Operations'] },
        })
            .select('fullName employeeCode department alternateSaturdayPolicy joiningDate createdAt role featurePermissions')
            .populate('shiftGroup', 'startTime')
            .sort({ fullName: 1 })
            .lean(),
        Holiday.find({
            date: { $gte: rangeStart, $lte: rangeEnd },
            isTentative: { $ne: true },
        }).select('date name isTentative').lean(),
        getGracePeriodMinutes(),
        AttendanceLog.find({
            attendanceDate: { $gte: startDateStr, $lte: endDateStr },
        })
            .select('user attendanceDate clockInTime clockOutTime notes isHalfDay attendanceStatus lateMinutes logoutType autoLogoutReason overrideReason halfDayReasonCode halfDayReasonText halfDaySource overriddenByAdmin leaveRequest')
            .lean(),
        LeaveRequest.find({
            status: 'Approved',
            leaveDates: { $elemMatch: { $gte: rangeStart, $lte: rangeEnd } },
        })
            .select('employee leaveDates leaveType requestType status reason autoConvertedToLOP originalLeaveType originalRequestType')
            .lean(),
    ]);

    const employeeIds = new Set(employees.map((employee) => employee._id.toString()));
    const relevantLogs = logs.filter((log) => employeeIds.has(String(log.user)));
    const logIds = relevantLogs.map((log) => log._id);
    const sessionStats = logIds.length
        ? await AttendanceSession.aggregate([
            { $match: { attendanceLog: { $in: logIds } } },
            {
                $group: {
                    _id: '$attendanceLog',
                    firstStart: { $min: '$startTime' },
                },
            },
        ])
        : [];
    const firstSessionByLog = new Map(sessionStats.map((row) => [String(row._id), row.firstStart]));

    const logsByEmployeeDate = new Map();
    relevantLogs.forEach((log) => {
        const firstStart = firstSessionByLog.get(String(log._id));
        log.sessions = firstStart ? [{ startTime: firstStart }] : [];
        logsByEmployeeDate.set(`${log.user}|${log.attendanceDate}`, log);
    });

    const validLeaveIds = new Set(leaveRequests.map((leave) => String(leave._id)));
    const leavesByEmployeeDate = new Map();
    leaveRequests.forEach((leave) => {
        const employeeId = String(leave.employee);
        if (!employeeIds.has(employeeId) || !Array.isArray(leave.leaveDates)) return;
        leave.leaveDates.forEach((leaveDate) => {
            const leaveKey = getISTDateString(leaveDate);
            if (leaveKey < startDateStr || leaveKey > endDateStr) return;
            const mapKey = `${employeeId}|${leaveKey}`;
            if (!leavesByEmployeeDate.has(mapKey)) leavesByEmployeeDate.set(mapKey, leave);
        });
    });

    const todayKey = getISTDateString(new Date());
    const codes = {};

    employees.forEach((employee) => {
        const employeeId = String(employee._id);
        const policy = employee.alternateSaturdayPolicy || 'All Saturdays Working';
        const dayCodes = {};

        dateRange.forEach((attendanceDate) => {
            const log = logsByEmployeeDate.get(`${employeeId}|${attendanceDate}`) || null;
            let leaveRequest = leavesByEmployeeDate.get(`${employeeId}|${attendanceDate}`) || null;

            if (log?.leaveRequest && !validLeaveIds.has(String(log.leaveRequest))) {
                log.leaveRequest = null;
                if (!log.clockInTime && !log.clockOutTime && log.attendanceStatus === 'Leave') {
                    log.attendanceStatus = 'Absent';
                    log.isHalfDay = false;
                }
            }
            if (log?.leaveRequest && !leaveRequest) leaveRequest = null;

            const statusInfo = resolveAttendanceStatus({
                attendanceDate,
                attendanceLog: log,
                holidays,
                leaveRequest,
                saturdayPolicy: policy,
                gracePeriodMinutes,
            });

            let effectiveLeaveInfo = statusInfo.leaveInfo;
            const isHalfDayLeaveDoc = leaveRequest && HALF_DAY_LEAVE_TYPES.includes(leaveRequest.leaveType);
            const wasVoidedByLeaveApproval = log?.notes && String(log.notes).includes('AUTO-VOID');
            const hasActualCheckIn = log && log.clockInTime != null && !wasVoidedByLeaveApproval;
            const hasNoCheckIn = !log || (log.clockInTime == null && !wasVoidedByLeaveApproval);

            if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasNoCheckIn) {
                effectiveLeaveInfo = { ...effectiveLeaveInfo, leaveType: 'Full Day', requestType: 'Loss of Pay' };
            } else if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasActualCheckIn && leaveRequest.autoConvertedToLOP) {
                effectiveLeaveInfo = {
                    ...effectiveLeaveInfo,
                    leaveType: leaveRequest.originalLeaveType || leaveRequest.leaveType,
                    requestType: leaveRequest.originalRequestType || 'Planned',
                };
            }

            let resolved = {
                attendanceStatus: statusInfo.status,
                isHoliday: statusInfo.isHoliday,
                isWeeklyOff: statusInfo.isWeeklyOff,
                isLeave: statusInfo.isLeave,
                isAbsent: statusInfo.isAbsent,
                isHalfDay: statusInfo.isLeave
                    ? !!(effectiveLeaveInfo && HALF_DAY_LEAVE_TYPES.includes(effectiveLeaveInfo.leaveType))
                    : statusInfo.isHalfDay,
                hasHalfDayLeave: !!(effectiveLeaveInfo && HALF_DAY_LEAVE_TYPES.includes(effectiveLeaveInfo.leaveType)),
                leaveInfo: effectiveLeaveInfo,
                holidayInfo: statusInfo.holidayInfo,
            };

            if (!resolved.isHoliday && !resolved.isWeeklyOff && !resolved.isLeave) {
                resolved = applySummaryHoursOverride(resolved, log, employee, gracePeriodMinutes, attendanceDate, todayKey);
            }

            dayCodes[attendanceDate] = musterCodeFromResolved(resolved, attendanceDate, employee, todayKey);
        });

        codes[employeeId] = dayCodes;
    });

    return {
        startDate: startDateStr,
        endDate: endDateStr,
        employees: employees.map((employee) => ({
            _id: employee._id,
            fullName: employee.fullName,
            employeeCode: employee.employeeCode,
            department: employee.department,
            role: employee.role,
            joiningDate: employee.joiningDate,
            createdAt: employee.createdAt,
        })),
        codes,
    };
}

module.exports = {
    getEmployeeAttendanceSummary,
    fetchHolidaysForDateRange,
    getMusterRoll,
};
