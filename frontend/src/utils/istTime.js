/**
 * FRONTEND IST TIME UTILITY
 * 
 * SINGLE SOURCE OF TRUTH for all timezone operations in frontend.
 * All business logic MUST use these functions.
 * 
 * Rules:
 * - IST (Asia/Kolkata) is the ONLY timezone for business logic
 * - UTC is ONLY used as storage/transmission format
 * - NO browser timezone usage
 * - Mirrors backend/utils/istTime.js for consistency
 */

/**
 * Get current date/time in IST
 * @returns {Date} Date object representing current time in IST
 */
export const getISTNow = () => {
    // Get current UTC time
    const now = new Date();
    
    // Convert to IST using Intl.DateTimeFormat
    // This ensures we get the correct IST time regardless of browser timezone
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = istFormatter.formatToParts(now);
    const partsMap = {};
    parts.forEach(part => {
        partsMap[part.type] = part.value;
    });
    
    // Create Date object in IST (using UTC constructor with IST values)
    // Format: YYYY-MM-DDTHH:mm:ss+05:30
    const istISOString = `${partsMap.year}-${partsMap.month}-${partsMap.day}T${partsMap.hour}:${partsMap.minute}:${partsMap.second}+05:30`;
    return new Date(istISOString);
};

/**
 * Get current date as YYYY-MM-DD string in IST
 * This is the ONLY way to generate attendanceDate
 * @param {Date} date - Optional date, defaults to now
 * @returns {string} Date string in YYYY-MM-DD format (IST)
 */
export const getISTDateString = (date = null) => {
    const targetDate = date || getISTNow();
    
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    const parts = istFormatter.formatToParts(targetDate);
    const partsMap = {};
    parts.forEach(part => {
        partsMap[part.type] = part.value;
    });
    
    return `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
};

/**
 * Parse a YYYY-MM-DD date string as IST date
 * This safely parses date strings as IST, avoiding UTC parsing issues
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object representing IST midnight of that date
 */
export const parseISTDate = (dateString) => {
    if (!dateString) {
        throw new Error('Date string is required');
    }
    
    // If already a Date object, return as is (assume it's already in correct timezone context)
    if (dateString instanceof Date) {
        return dateString;
    }
    
    // Parse YYYY-MM-DD as IST midnight
    if (typeof dateString === 'string') {
        // Handle ISO datetime strings
        if (dateString.includes('T')) {
            // Already has timezone info, parse directly
            return new Date(dateString);
        }
        
        // Handle YYYY-MM-DD format - parse as IST midnight
        const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
            const [, year, month, day] = dateMatch;
            // Create IST midnight: YYYY-MM-DDTHH:mm:ss+05:30
            const istISOString = `${year}-${month}-${day}T00:00:00+05:30`;
            return new Date(istISOString);
        }
        
        // Fallback: try standard Date parsing
        return new Date(dateString);
    }
    
    throw new Error(`Invalid date string format: ${dateString}`);
};

/**
 * Get start of day (00:00:00) in IST for a given date
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {Date} Date object representing IST midnight
 */
export const startOfISTDay = (date = null) => {
    const targetDate = date ? (typeof date === 'string' ? parseISTDate(date) : date) : getISTNow();
    const dateString = getISTDateString(targetDate);
    return parseISTDate(dateString);
};

/**
 * Convert a Date object to IST time string for display
 * @param {Date} date - Date object (assumed to be in correct timezone context)
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted time string in IST
 */
export const formatISTTime = (date, options = { hour12: true, hour: '2-digit', minute: '2-digit' }) => {
    if (!date) return '';
    return new Date(date).toLocaleTimeString('en-US', {
        timeZone: 'Asia/Kolkata',
        ...options
    });
};

/**
 * Convert a Date object to IST date string for display
 * @param {Date} date - Date object
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string in IST
 */
export const formatISTDate = (date, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-GB', {
        timeZone: 'Asia/Kolkata',
        ...options
    });
};

/**
 * Get IST date parts (year, month, day) from a date
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {object} Object with year, month, day, monthIndex (0-based)
 */
export const getISTDateParts = (date = null) => {
    const targetDate = date ? (typeof date === 'string' ? parseISTDate(date) : date) : getISTNow();
    const dateString = getISTDateString(targetDate);
    const [year, month, day] = dateString.split('-').map(Number);
    return {
        year,
        month, // 1-based month (1-12)
        monthIndex: month - 1, // 0-based month (0-11)
        day
    };
};

/**
 * Check if two dates are on the same IST day
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} True if both dates are on the same IST day
 */
export const isSameISTDay = (date1, date2) => {
    const d1 = typeof date1 === 'string' ? parseISTDate(date1) : date1;
    const d2 = typeof date2 === 'string' ? parseISTDate(date2) : date2;
    return getISTDateString(d1) === getISTDateString(d2);
};

/**
 * Get week range (Sunday to Saturday) for a given date in IST
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {object} { startDate: Date, endDate: Date, startDateStr: string, endDateStr: string }
 */
export const getISTWeekRange = (date = null) => {
    const targetDate = date ? (typeof date === 'string' ? parseISTDate(date) : date) : getISTNow();
    
    // Get IST date string
    const dateStr = getISTDateString(targetDate);
    const dateObj = parseISTDate(dateStr);
    
    // Get day of week in IST using Intl.DateTimeFormat
    const istFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long'
    });
    const weekdayName = istFormatter.format(dateObj);
    const dayOfWeekMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };
    const dayOfWeek = dayOfWeekMap[weekdayName] || 0;
    
    // Calculate start of week (Sunday) in IST
    // Create date at midnight IST for the target date
    const [year, month, day] = dateStr.split('-').map(Number);
    const targetDateMidnight = parseISTDate(dateStr);
    
    // Calculate milliseconds difference for days
    const daysFromSunday = dayOfWeek;
    const startDateMs = targetDateMidnight.getTime() - (daysFromSunday * 24 * 60 * 60 * 1000);
    const startDate = parseISTDate(getISTDateString(new Date(startDateMs)));
    
    // Calculate end of week (Saturday) - 6 days after Sunday
    const endDateMs = startDateMs + (6 * 24 * 60 * 60 * 1000);
    const endDate = parseISTDate(getISTDateString(new Date(endDateMs)));
    
    return {
        startDate,
        endDate,
        startDateStr: getISTDateString(startDate),
        endDateStr: getISTDateString(endDate)
    };
};

/**
 * Format a date range for display
 * @param {Date|string} date - Date within the week
 * @param {boolean} isCalendarView - If true, format as month; if false, format as week range
 * @returns {string} Formatted date range string
 */
export const formatDateRange = (date, isCalendarView = false) => {
    if (isCalendarView) {
        const parts = getISTDateParts(date);
        const monthFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Kolkata',
            month: 'long',
            year: 'numeric'
        });
        return monthFormatter.format(parseISTDate(`${parts.year}-${String(parts.month).padStart(2, '0')}-01`));
    } else {
        const weekRange = getISTWeekRange(date);
        const startStr = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(weekRange.startDate);
        const endStr = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(weekRange.endDate);
        return `${startStr} - ${endStr}`;
    }
};

/**
 * Format timestamp as IST date + time for display.
 * Accepts backend-provided ISO strings or Date only. No browser-local fallback.
 * @param {Date|string} timestamp - ISO string or Date
 * @param {object} options - Intl options (default: date + time in IST)
 * @returns {string} Formatted datetime string in IST
 */
export const formatISTDateTime = (timestamp, options = {}) => {
    if (!timestamp) return '';
    const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    if (isNaN(d.getTime())) return '';
    const defaultOpts = {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };
    return new Date(d).toLocaleString('en-GB', { ...defaultOpts, ...options });
};

/**
 * Format time as HH:mm in IST for form inputs (24h).
 * Accepts backend-provided ISO strings or Date only.
 * @param {Date|string} dateTime - ISO string or Date
 * @returns {string} "HH:mm" in IST
 */
export const formatISTTimeHHMM = (dateTime) => {
    if (!dateTime) return '';
    const d = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
    if (isNaN(d.getTime())) return '';
    return formatISTTime(d, { hour12: false, hour: '2-digit', minute: '2-digit' });
};

