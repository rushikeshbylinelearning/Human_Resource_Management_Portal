// backend/config/shiftPolicy.js

/**
 * SHIFT POLICY CONFIGURATION - PURE STATIC DEFINITIONS
 *
 * This file contains ONLY static configuration and constants.
 * NO runtime logic, NO imports of moment/dayjs, NO calculations.
 * All calculations are performed in backend/services/requiredLogoutService.js
 *
 * POLICY DEFINITION:
 * - Shift working time: 8 hours 30 minutes (510 minutes)
 * - Allowed paid break: 30 minutes
 * - Shift total duration: 9 hours (540 minutes)
 *
 * BREAK RULES:
 * 1. Paid breaks up to 30 minutes are included in the 9-hour shift
 * 2. Paid breaks beyond 30 minutes → excess extends logout time
 * 3. All unpaid break time MUST extend required logout time
 */

// --------------------
// CORE SHIFT CONSTANTS
// --------------------

const SHIFT_WORKING_MINUTES = 510; // 8.5 hours
const SHIFT_TOTAL_MINUTES = 540; // 9 hours

// Break policy constants
const PAID_BREAK_ALLOWANCE_MINUTES = 30;
const UNPAID_BREAK_ALLOWANCE_MINUTES = 10; // penalty tracking only
const EXTRA_BREAK_ALLOWANCE_MINUTES = 10; // penalty tracking only

// --------------------
// LEGACY / COMPAT CONSTANTS
// --------------------

const MINIMUM_WORKING_HOURS = 8.5;
const MINIMUM_WORKING_MINUTES = 510;

const MINIMUM_HOURS_FOR_HALF_DAY = 4.5;

const MINIMUM_TOTAL_HOURS_FOR_HALF_DAY = 5;
const MINIMUM_TOTAL_MINUTES_FOR_HALF_DAY = 300;

// --------------------
// NEW ELAPSED SHIFT MODEL
// --------------------

const MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY = 9;

const MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY = 5;

// Half-day leave requirement
const HALF_DAY_WORKING_MINUTES = 270;

// ===================================================================
// SHIFT DEFINITIONS (STATIC CONFIGURATION)
// ===================================================================

/**
 * Shift configuration for 10 AM shift (General Shift 1 / General Shift_1)
 */
const SHIFT_10AM_CONFIG = {
    names: ['General Shift 1', 'General Shift_1', 'General_Shift_1'],
    workHours: 9,
    workMinutes: 540,
    paidBreakMinutes: 30,
    minRequiredLogoutHour: 19, // 7 PM (19:00)
    minRequiredLogoutMinute: 0,
    earlyCheckInAllowed: true,
    enforceMinLogout: true, // HARD FLOOR - always enforce 7 PM minimum
    description: '10:00 AM - 07:00 PM shift with hard 7 PM logout floor'
};

/**
 * Shift configuration for 11 AM shift (General Shift 2 / General Shift_2)
 */
const SHIFT_11AM_CONFIG = {
    names: ['General Shift 2', 'General Shift_2', 'General_Shift_2'],
    workHours: 9,
    workMinutes: 540,
    paidBreakMinutes: 30,
    flexibleLogicEnabled: true,
    earlyBoundaryHour: 10, // 10:00 AM
    earlyBoundaryMinute: 0,
    minRequiredLogoutWhenEarlyHour: 19, // 7 PM (19:00)
    minRequiredLogoutWhenEarlyMinute: 0,
    description: '11:00 AM - 08:00 PM shift with conditional 7 PM floor (only if check-in < 10 AM)'
};

/**
 * Pure helper function to normalize shift names for comparison
 * (handles underscores, extra spaces, case variations)
 */
function normalizeShiftName(shiftName) {
    if (!shiftName || typeof shiftName !== 'string') return '';
    return shiftName.replace(/_/g, ' ').trim().toLowerCase();
}

/**
 * Pure helper function to check if a shift matches a configuration
 */
function isShiftMatch(shift, config) {
    if (!shift || !shift.shiftName || !config || !config.names) return false;
    const normalized = normalizeShiftName(shift.shiftName);
    return config.names.some(name => 
        normalizeShiftName(name) === normalized || shift.shiftName === name
    );
}

// ===================================================================
// EXPORTS (PURE CONFIGURATION ONLY)
// ===================================================================

module.exports = {
    // Core constants
    SHIFT_WORKING_MINUTES,
    SHIFT_TOTAL_MINUTES,
    PAID_BREAK_ALLOWANCE_MINUTES,
    UNPAID_BREAK_ALLOWANCE_MINUTES,
    EXTRA_BREAK_ALLOWANCE_MINUTES,

    // Legacy / compatibility
    MINIMUM_WORKING_HOURS,
    MINIMUM_WORKING_MINUTES,
    MINIMUM_HOURS_FOR_HALF_DAY,
    MINIMUM_TOTAL_HOURS_FOR_HALF_DAY,
    MINIMUM_TOTAL_MINUTES_FOR_HALF_DAY,
    HALF_DAY_WORKING_MINUTES,

    // Elapsed shift model
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY,
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY,

    // Shift configurations
    SHIFT_10AM_CONFIG,
    SHIFT_11AM_CONFIG,

    // Pure helper functions (no execution, no side effects)
    isShiftMatch
};
