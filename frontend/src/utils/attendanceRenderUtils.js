/**
 * SHARED ATTENDANCE RENDERING UTILITIES
 * Used by both Admin and Employee views for consistency
 */

import { formatISTTime, formatISTDate, getISTDateString, getISTNow } from './istTime';
import { getStatusColor } from '../constants/attendanceColors';

/**
 * Format time for display (IST)
 * @param {Date|string} dateTime - DateTime to format
 * @returns {string} Formatted time string (HH:MM AM/PM)
 */
export const formatTimeForDisplay = (dateTime) => {
    if (!dateTime) return '--:--';
    return formatISTTime(dateTime, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

/**
 * Format date for display (IST). Uses centralized IST utility.
 * @param {Date|string} date - Date to format (backend ISO or Date)
 * @param {object} options - Formatting options (merged with IST defaults)
 * @returns {string} Formatted date string in IST
 */
export const formatDateForDisplay = (date, options = {}) => {
    if (!date) return 'N/A';
    return formatISTDate(date, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        weekday: 'short',
        ...options
    });
};

/**
 * Check if a date is today in IST
 * @param {Date|string} date - Date to check
 * @returns {boolean} True if date is today
 */
export const isTodayIST = (date) => {
    if (!date) return false;
    const todayIST = getISTDateString(getISTNow());
    const checkDateIST = getISTDateString(date);
    return todayIST === checkDateIST;
};

/**
 * Get display status from backend log data
 * Backend is single source of truth - frontend only formats for display
 * Backend now provides: attendanceStatus, isHoliday, isWeeklyOff, isLeave, isAbsent
 * 
 * @param {object} log - Attendance log from backend (with resolved status)
 * @param {object} holidayInfo - Holiday info from backend (if applicable)
 * @param {object} leaveInfo - Leave info from backend (if applicable)
 * @returns {object} { status: string, color: string, bgColor: string }
 */
export const getDisplayStatus = (log, holidayInfo = null, leaveInfo = null) => {
    // CRITICAL: Backend has already resolved status with precedence
    // Frontend must NEVER override or recalculate
    
    if (!log) {
        // No log - backend should still provide status, but fallback to Absent
        return {
            status: 'Absent',
            color: getStatusColor('Absent'),
            bgColor: getStatusColor('Absent')
        };
    }
    
    // Use backend resolved status (already enforces precedence)
    const backendStatus = log.attendanceStatus || 'Absent';
    
    // Format status for display based on backend flags
    let displayStatus = backendStatus;
    
    // Holiday takes highest priority (backend already resolved this)
    if (log.isHoliday || holidayInfo) {
        const holidayName = holidayInfo?.name || 'Holiday';
        return {
            status: `Holiday - ${holidayName}`,
            color: '#9c27b0',
            bgColor: '#f3e5f5'
        };
    }
    
    // Weekly Off (backend already resolved this)
    if (log?.isWeeklyOff || backendStatus === 'Weekly Off') {
        return {
            status: 'Weekly Off',
            color: '#ffd43b',
            bgColor: '#fff8e1'
        };
    }
    
    // Leave (backend already resolved this)
    if (log?.isLeave || leaveInfo) {
        const leaveType = leaveInfo?.requestType || leaveInfo?.leaveType || 'Leave';
        let displayStatus = 'Leave';
        
        if (leaveType && leaveType.includes('Compensatory')) {
            displayStatus = 'Comp Off';
        } else if (leaveType && leaveType.includes('Swap')) {
            displayStatus = 'Swap Leave';
        } else {
            // Use backend statusReason if available, otherwise construct from leaveType
            displayStatus = log?.statusReason || `Leave - ${leaveType}`;
        }
        
        return {
            status: displayStatus,
            color: '#74c0fc',
            bgColor: '#e3f2fd',
            leaveInfo
        };
    }
    
    // Map backend status to display status
    if (backendStatus === 'On-time' || backendStatus === 'Present') {
        displayStatus = 'Present';
    } else if (backendStatus === 'Half-day' || backendStatus === 'Half Day') {
        displayStatus = 'Half-day';
    } else if (backendStatus === 'Weekly Off') {
        displayStatus = 'Weekly Off';
    }
    
    return {
        status: displayStatus,
        color: getStatusColor(displayStatus),
        bgColor: getStatusColor(displayStatus)
    };
};

/**
 * Format duration from minutes to HH:MM
 * @param {number} totalMinutes - Total minutes
 * @returns {string} Formatted duration (HH:MM)
 */
export const formatDuration = (totalMinutes) => {
    if (!totalMinutes || isNaN(totalMinutes) || totalMinutes < 0) {
        return '00:00';
    }
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Format duration from minutes to "N Min(s)" (short form)
 * @param {number} totalMinutes - Total minutes
 * @returns {string} Formatted duration (e.g. "45 Min(s)")
 */
export const formatDurationShort = (totalMinutes) => {
    if (!totalMinutes || isNaN(totalMinutes) || totalMinutes < 0) return '0 Min(s)';
    const mins = Math.round(totalMinutes);
    return `${mins} Min(s)`;
};

/**
 * Format duration from minutes to HH:MM:SS
 * @param {number} totalMinutes - Total minutes
 * @returns {string} Formatted duration (HH:MM:SS)
 */
export const formatDurationWithSeconds = (totalMinutes) => {
    if (!totalMinutes || isNaN(totalMinutes) || totalMinutes < 0) {
        return '00:00:00';
    }
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    const seconds = Math.round((totalMinutes % 1) * 60);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** Matches the fixed labels on the attendance summary time axis (10 AM – 7 PM). */
export const TIMELINE_AXIS_START_HOUR = 10;
export const TIMELINE_AXIS_END_HOUR = 19;
export const TIMELINE_AXIS_DURATION_HOURS = TIMELINE_AXIS_END_HOUR - TIMELINE_AXIS_START_HOUR;

/**
 * Decimal hour-of-day in IST (e.g. 14.5 = 2:30 PM).
 */
export const getISTDecimalHours = (dateTime) => {
    if (!dateTime) return 0;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
    }).formatToParts(new Date(dateTime));

    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return hour + minute / 60;
};

/**
 * Map an IST clock time to a percentage on the 10 AM – 7 PM summary axis.
 * Times before 10 AM clamp to 0%; times after 7 PM can exceed 100%.
 */
export const timeToTimelinePercentage = (dateTime) => {
    if (!dateTime || TIMELINE_AXIS_DURATION_HOURS <= 0) return 0;
    const decimalHours = getISTDecimalHours(dateTime);
    const percentage = ((decimalHours - TIMELINE_AXIS_START_HOUR) / TIMELINE_AXIS_DURATION_HOURS) * 100;
    return Math.max(0, percentage);
};

