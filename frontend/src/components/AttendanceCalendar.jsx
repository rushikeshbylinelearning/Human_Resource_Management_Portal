// src/components/AttendanceCalendar.jsx - IST-ENFORCED, BACKEND-DRIVEN
import React, { useMemo, memo } from 'react';
import { Typography, Box } from '@mui/material';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import { 
    getISTNow, 
    getISTDateString, 
    parseISTDate, 
    getISTDateParts,
    isSameISTDay
} from '../utils/istTime';
import {
    formatDuration,
    getDisplayStatus,
    isTodayIST
} from '../utils/attendanceRenderUtils';
import '../styles/AttendanceCalendar.css';

// Memoized calendar day cell component to prevent unnecessary re-renders
// Only re-renders when day-specific props change (status, log, etc.)
const OVERRIDE_ELIGIBLE_STATUSES = new Set(['absent', 'present', 'half-day']);

const DayCell = memo(({ day, onDayClick, onDayContextMenu, holiday, leave }) => {
    const isFutureDate = day.date > getISTNow() && !day.log && day.status !== 'holiday' && day.status !== 'leave' && day.status !== 'weekend' && day.status !== 'week-off';
    const hasNoAttendanceData = !day.log || !day.log.sessions || day.log.sessions.length === 0;
    const isNotHolidayOrLeave = !day.status || (!day.status.startsWith('holiday') && !day.status.startsWith('leave') && day.status !== 'comp-off' && day.status !== 'swap-leave');
    // CRITICAL FIX: Prevent opening modal for absent/week-off/weekend when there's no log
    const isAbsentWeekOffOrWeekend = day.status === 'absent' || day.status === 'week-off' || day.status === 'weekend';
    const shouldPreventClick = isAbsentWeekOffOrWeekend && hasNoAttendanceData && !day.leave && !day.holiday;
    const isClickable = !(isFutureDate && hasNoAttendanceData && isNotHolidayOrLeave) && !shouldPreventClick;
    // Right-click override: allow on absent/present/half-day even when left-click is blocked (no log).
    const isPastOrToday = !(day.date > getISTNow());
    const canContextOverride = typeof onDayContextMenu === 'function'
        && day.isCurrentMonth
        && isPastOrToday
        && OVERRIDE_ELIGIBLE_STATUSES.has(day.status);

    // ROBUST: Only show "Half Day" when there is an attendance log with a clock-in for that day.
    // If half-day leave but no log or no clock-in → show Full Day (LOP). Backend may send effective leaveInfo; frontend is defensive.
    // CRITICAL: Treat as "had check-in" when clock-in was voided by leave approval (AUTO-VOID in notes) so we don't show Full Day LOP incorrectly.
    const rawHalfDayLeave = leave?.leaveType && leave.leaveType.startsWith('Half Day');
    const hadClockInVoidedByLeave = day.log?.notes && String(day.log.notes).includes('AUTO-VOID');
    const hasCheckInForLeaveDay = day.log?.clockInTime != null || hadClockInVoidedByLeave;
    const isHalfDayLeave = rawHalfDayLeave && hasCheckInForLeaveDay;
    const isEffectiveFullDayLOP = rawHalfDayLeave && !hasCheckInForLeaveDay;
    // Use leaveInfo from backend (already applies effective Full Day LOP when no check-in); fallback to leave prop
    const effectiveLeaveType = isEffectiveFullDayLOP ? 'Full Day' : (day.log?.leaveInfo?.leaveType || leave?.leaveType);
    const effectiveRequestType = isEffectiveFullDayLOP ? 'Loss of Pay' : (day.log?.leaveInfo?.requestType || leave?.requestType);
    const leaveTypeText = effectiveRequestType
        ? formatLeaveRequestType(effectiveRequestType)
        : effectiveLeaveType
            ? formatLeaveRequestType(effectiveLeaveType)
            : 'Leave';

    const lateMinutes = Number(day.log?.lateMinutes || 0);
    // halfDayReasonCode (LATE_LOGIN vs INSUFFICIENT_WORKING_HOURS) drives secondary label in summary
    const hasEarlyCheckoutNote = day.log?.hasEarlyCheckoutNote === true;
    const earlyCheckoutNoteText = (day.log?.earlyCheckoutNote && String(day.log.earlyCheckoutNote).trim()) || '';
    const earlyCheckoutTooltip = earlyCheckoutNoteText
        ? `Early Checkout Reason:\n${earlyCheckoutNoteText}`
        : '';

    // Strict override check: show override UI ONLY when explicit admin override AND valid note exists.
    // Do NOT infer from status, hours, or half-day. Guard against null/empty/legacy.
    const overrideNote = day.log?.overrideReason;
    const hasValidOverride = day.log?.overriddenByAdmin === true
        && typeof overrideNote === 'string'
        && overrideNote.trim().length > 0;

    const dayData = {
        log: day.log,
        date: day.date,
        status: day.status,
        holiday,
        leave,
        hoursWorked: day.hoursWorked
    };

    const handleContextMenu = (e) => {
        if (!canContextOverride) return;
        e.preventDefault();
        e.stopPropagation();
        onDayContextMenu(e, dayData);
    };

    return (
        <div 
            className={`calendar-day ${day.status} ${day.isToday ? 'today' : ''} ${!day.isCurrentMonth ? 'other-month' : ''} ${!isClickable ? 'non-clickable' : ''}${canContextOverride ? ' context-override-eligible' : ''}`}
            onClick={isClickable ? () => onDayClick(dayData) : undefined}
            onContextMenu={canContextOverride ? handleContextMenu : undefined}
        >
            <div className="day-number-wrapper">
                <div className="day-number">{day.dayNumber}</div>
            </div>
            
            {day.status === 'present' && (
                <div className="attendance-status present">
                    <div className="status-label">Present</div>
                    {hasValidOverride && (
                        <div className="override-note-primary" style={{ fontSize: '0.65rem', marginTop: '2px', color: '#856404', fontWeight: 700 }} title={overrideNote.trim()}>
                            {overrideNote.trim().length > 36 ? `${overrideNote.trim().slice(0, 36)}…` : overrideNote.trim()}
                        </div>
                    )}
                    {day.hoursWorked != null && day.hoursWorked !== '' && (
                        <div className={`hours-worked ${hasValidOverride ? 'override-hours-secondary' : ''}`} style={hasValidOverride ? { fontSize: '0.7rem', color: 'rgba(0,0,0,0.6)', marginTop: '2px' } : undefined}>
                            {day.hoursWorked}
                        </div>
                    )}
                    {hasEarlyCheckoutNote && (
                        <span className="early-checkout-nt-badge" title={earlyCheckoutTooltip}>ECN</span>
                    )}
                </div>
            )}
            
            {day.status === 'half-day' && (
                <div className="attendance-status half-day">
                    {hasValidOverride ? (
                        <>
                            <div className="override-note-primary" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#856404' }} title={overrideNote.trim()}>
                                {overrideNote.trim().length > 40 ? `${overrideNote.trim().slice(0, 40)}…` : overrideNote.trim()}
                            </div>
                            {day.hoursWorked != null && day.hoursWorked !== '' && (
                                <div className="override-hours-secondary" style={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.6)', marginTop: '2px' }}>{day.hoursWorked}</div>
                            )}
                            {hasEarlyCheckoutNote && (
                                <span className="early-checkout-nt-badge" title={earlyCheckoutTooltip}>ECN</span>
                            )}
                        </>
                    ) : (
                        <>
                            {day.hoursWorked != null && day.hoursWorked !== '' && (
                                <div className="status-meta status-meta-top">{day.hoursWorked}</div>
                            )}
                            <div className="status-badge">Half Day</div>
                            {day.log?.halfDayReasonCode === 'LATE_LOGIN' ? (
                                <>
                                    <div className="status-primary">Late Arrival</div>
                                    <div className="status-secondary">Late by {lateMinutes} minutes</div>
                                </>
                            ) : (
                                <div className="status-secondary">Incomplete hours</div>
                            )}
                            {hasEarlyCheckoutNote && (
                                <span className="early-checkout-nt-badge" title={earlyCheckoutTooltip}>ECR</span>
                            )}
                        </>
                    )}
                </div>
            )}
            
            {day.status === 'absent' && (
                <div className="attendance-status absent">
                    <div className="status-label">Absent</div>
                </div>
            )}
            
            {day.status === 'weekend' && (
                <div className="attendance-status weekend">
                    <div className="status-label">Weekend</div>
                </div>
            )}
            
            {day.status === 'week-off' && (
                <div className="attendance-status week-off">
                    <div className="status-label">Week Off</div>
                </div>
            )}
            
            {day.status === 'working-day' && (
                <div className="attendance-status working-day">
                    <div className="status-label">Working Day</div>
                </div>
            )}
            
            {day.status === 'holiday' && (
                <div className="attendance-status holiday">
                    <div className="holiday-name">{holiday?.name}</div>
                </div>
            )}
            
            {day.status === 'leave' && (
                <div className={`attendance-status leave ${isHalfDayLeave ? 'half-day-leave' : 'full-day-leave'}`} title={leave?.reason || day.log?.leaveReason || day.log?.leaveInfo?.reason || ''}>
                    {/* Half-day leave: show only leave type, not the full reason */}
                    {isHalfDayLeave ? (
                        <>
                            {day.hoursWorked && (
                                <div className="status-meta status-meta-top">{day.hoursWorked}</div>
                            )}
                            <div className="status-badge">Half Day</div>
                            <div className="status-secondary">Leave — {leaveTypeText}</div>
                        </>
                    ) : (
                        <>
                            {/* Full-day leave: show only "Full Day — Leave — <Leave Type>" format, reason only in tooltip and log detail */}
                            <div className="status-primary">Full Day — Leave</div>
                            <div className="status-secondary">{leaveTypeText}</div>
                        </>
                    )}
                </div>
            )}
            
            {day.status === 'comp-off' && (
                <div className="attendance-status comp-off">
                    <div className="status-label">⚙️ Comp Off</div>
                    <div className="comp-off-type">Comp Off</div>
                </div>
            )}
            
            {day.status === 'swap-leave' && (
                <div className="attendance-status swap-leave">
                    <div className="status-label">🔁 Swap Leave</div>
                    <div className="swap-leave-type">Swap Leave</div>
                </div>
            )}
        </div>
    );
});

DayCell.displayName = 'DayCell';

// Status resolution is backend-driven; calendar only renders resolved data.
// All status logic (holidays, weekly offs, leaves, attendance) is determined by backend API.
const AttendanceCalendar = ({ logs, currentDate, onDayClick, onDayContextMenu }) => {
    
    // Generate calendar data for the current month in IST
    const calendarData = useMemo(() => {
        const parts = getISTDateParts(currentDate);
        const year = parts.year;
        const monthIndex = parts.monthIndex;
        
        // Get first day of month and last day of month in IST
        const firstDay = parseISTDate(`${year}-${String(parts.month).padStart(2, '0')}-01`);
        // Note: new Date(year, monthIndex + 1, 0) uses browser timezone temporarily
        // This is immediately converted to IST string and parsed back for safety
        const lastDay = new Date(year, monthIndex + 1, 0);
        const lastDayIST = parseISTDate(getISTDateString(lastDay));
        
        // Get first Sunday of the calendar view in IST
        const firstDayWeekday = firstDay.getDay();
        // Temporary Date object for calculation - immediately converted to IST
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDayWeekday);
        const startDateIST = parseISTDate(getISTDateString(startDate));
        
        // Get last Saturday of the calendar view in IST
        const lastDayWeekday = lastDayIST.getDay();
        // Temporary Date object for calculation - immediately converted to IST
        const endDate = new Date(lastDayIST);
        endDate.setDate(endDate.getDate() + (6 - lastDayWeekday));
        const endDateIST = parseISTDate(getISTDateString(endDate));
        
        const days = [];
        const logMap = new Map((logs || []).map(log => [log.attendanceDate, log]));
        const todayIST = getISTNow();
        const todayStr = getISTDateString(todayIST);
        
        // Iterate through calendar days in IST
        // Start with IST date, but use temporary Date for iteration
        // Each iteration converts to IST string then parses back to ensure IST correctness
        let current = new Date(startDateIST);
        while (current <= endDateIST) {
            // CRITICAL: Convert to IST string then parse to ensure IST timezone
            const currentIST = parseISTDate(getISTDateString(current));
            const dateKey = getISTDateString(currentIST);
            const log = logMap.get(dateKey);
            
            // Determine if this day is in current month
            const currentParts = getISTDateParts(currentIST);
            const isCurrentMonth = currentParts.monthIndex === monthIndex;
            
            // Determine if this is today in IST
            const isToday = dateKey === todayStr;
            
            // Get status from backend via shared utility
            const statusInfo = getDisplayStatus(log, log?.holidayInfo, log?.leaveInfo);
            let status = 'blank';
            let hoursWorked = '';
            
            if (isCurrentMonth) {
                // Map status to calendar status codes
                if (statusInfo.status.startsWith('Holiday -')) {
                    status = 'holiday';
                } else if (statusInfo.status === 'Comp Off') {
                    status = 'comp-off';
                } else if (statusInfo.status === 'Swap Leave') {
                    status = 'swap-leave';
                } else if (statusInfo.status.startsWith('Leave -') || statusInfo.status === 'Leave' || statusInfo.status === 'On Leave') {
                    status = 'leave';
                    // UI-only: if backend indicates a half-day leave, display elapsed shift time
                    const isHalfDayLeave = log?.leaveInfo?.leaveType && String(log.leaveInfo.leaveType).startsWith('Half Day');
                    if (isHalfDayLeave && log?.clockInTime && log?.clockOutTime) {
                        const elapsedShiftMinutes = (new Date(log.clockOutTime) - new Date(log.clockInTime)) / (1000 * 60);
                        hoursWorked = formatDuration(Math.floor(elapsedShiftMinutes)) + ' Hrs';
                    }
                } else if (statusInfo.status === 'Weekly Off' || statusInfo.status === 'Week Off' || statusInfo.status === 'Day Off') {
                    status = 'week-off';
                } else if (statusInfo.status === 'Weekend') {
                    status = 'weekend';
                } else if (statusInfo.status === 'Working Day') {
                    status = 'working-day';
                } else if (statusInfo.status === 'Absent') {
                    status = 'absent';
                } else if (statusInfo.status === 'Present' || statusInfo.status === 'On-time' || statusInfo.status === 'Late') {
                    status = 'present';
                    // NEW SHIFT MODEL: Show total shift time (elapsedShiftTime = clockOutTime - clockInTime, includes breaks)
                    // For current day: show elapsed time so far if not clocked out yet
                    // For past days: show total elapsed shift time
                    if (log?.clockInTime) {
                        const clockIn = new Date(log.clockInTime);
                        let elapsedShiftMinutes = 0;
                        
                        if (log?.clockOutTime) {
                            // Past day or clocked out: calculate total elapsed shift time
                            elapsedShiftMinutes = (new Date(log.clockOutTime) - clockIn) / (1000 * 60);
                        } else if (isToday) {
                            // Current day, not clocked out: show elapsed time so far
                            const now = getISTNow();
                            elapsedShiftMinutes = (now - clockIn) / (1000 * 60);
                        }
                        
                        if (elapsedShiftMinutes > 0) {
                            hoursWorked = formatDuration(Math.floor(elapsedShiftMinutes)) + ' Hrs';
                        }
                    }
                } else if (statusInfo.status === 'Half-day') {
                    status = 'half-day';
                    // NEW SHIFT MODEL: Show total shift time (elapsedShiftTime = clockOutTime - clockInTime, includes breaks)
                    if (log?.clockInTime) {
                        const clockIn = new Date(log.clockInTime);
                        let elapsedShiftMinutes = 0;
                        
                        if (log?.clockOutTime) {
                            // Past day or clocked out: calculate total elapsed shift time
                            elapsedShiftMinutes = (new Date(log.clockOutTime) - clockIn) / (1000 * 60);
                        } else if (isToday) {
                            // Current day, not clocked out: show elapsed time so far
                            const now = getISTNow();
                            elapsedShiftMinutes = (now - clockIn) / (1000 * 60);
                        }
                        
                        if (elapsedShiftMinutes > 0) {
                            hoursWorked = formatDuration(Math.floor(elapsedShiftMinutes)) + ' Hrs';
                        }
                    }
                } else {
                    status = 'absent';
                }
                
                // CRITICAL: Backend has already resolved status for ALL dates
                // If no log exists for a date, backend still provides status
                // Frontend must use backend status - NO RECALCULATION
                
                // Defensive check: If backend says it's a holiday/weekly off but status is absent, log warning
                if (process.env.NODE_ENV === 'development' && log) {
                    if ((log.isHoliday || log.isWeeklyOff) && log.attendanceStatus === 'Absent') {
                        console.warn(`[STATUS MISMATCH] Date ${dateKey}: Backend flags indicate holiday/weekly off but status is Absent`, {
                            isHoliday: log.isHoliday,
                            isWeeklyOff: log.isWeeklyOff,
                            attendanceStatus: log.attendanceStatus
                        });
                    }
                }
            }
            
            days.push({
                date: currentIST,
                dayNumber: currentParts.day,
                status,
                hoursWorked,
                isCurrentMonth,
                isToday,
                log,
                // CRITICAL FIX: Get leaveInfo from log - backend always sends leaveInfo in log object
                // even when there's no attendance log (backend creates log entry for each date)
                leave: log?.leaveInfo || null,
                holiday: log?.holidayInfo || null
            });
            
            current.setDate(current.getDate() + 1);
        }
        
        // Remove trailing empty rows: find the last day of the current month and trim after its week ends
        // This prevents showing extra empty rows when the month doesn't fill all 6 weeks
        let lastCurrentMonthIndex = -1;
        for (let i = days.length - 1; i >= 0; i--) {
            if (days[i].isCurrentMonth) {
                lastCurrentMonthIndex = i;
                break;
            }
        }
        
        // If we found a last day, trim to end of that week (keep only complete weeks)
        if (lastCurrentMonthIndex >= 0) {
            const daysInWeek = 7;
            const lastWeekEnd = Math.ceil((lastCurrentMonthIndex + 1) / daysInWeek) * daysInWeek;
            return days.slice(0, lastWeekEnd);
        }
        
        return days;
    }, [logs, currentDate]); // Backend provides all resolved status data - no local props needed

    const monthName = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'long',
        year: 'numeric'
    }).format(parseISTDate(getISTDateString(currentDate)));
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className="attendance-calendar-container">
            <div className="calendar-header">
                <Typography variant="h5" className="calendar-title">
                    {monthName}
                </Typography>
            </div>
            
            <div className="calendar-grid">
                <div className="calendar-header-row">
                    {dayNames.map(day => (
                        <div key={day} className="calendar-day-header">
                            {day}
                        </div>
                    ))}
                </div>
                
                <div className="calendar-days">
                    {calendarData.map((day, index) => (
                        <DayCell
                            key={day.log?.attendanceDate || `day-${index}`}
                            day={day}
                            onDayClick={onDayClick}
                            onDayContextMenu={onDayContextMenu}
                            holiday={day.holiday}
                            leave={day.leave}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AttendanceCalendar;
