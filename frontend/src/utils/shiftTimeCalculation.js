/**
 * Unified time calculation model for Time Tracking with break overuse handling.
 * Single source of truth for timer, progress bar, and required logout time.
 *
 * Model:
 *   scheduledShiftDuration   = nominal shift length (e.g. 9h = 540 min)
 *   allowedPaidBreakDuration = paid break included in shift (e.g. 30 min)
 *   elapsedShiftTime         = now - clockInTime (wall-clock since clock-in)
 *   actualBreakTaken         = sum of all break intervals (paid + unpaid)
 *   actualPaidBreakTaken     = sum of paid break intervals only
 *   actualUnpaidBreakTaken   = sum of unpaid/extra break intervals
 *   extraBreakTime           = max(0, actualPaidBreakTaken - allowedPaidBreakDuration)
 *                             Break overuse extends shift so logout time is fair:
 *                             if you take more than allowed paid break, you stay longer.
 *   breakExceededMinutes     = extraBreakTime + floor(actualUnpaidBreakTaken) — total logout extension (UI warning)
 *   effectiveShiftDuration   = scheduledShiftDuration + extraBreakTime + actualUnpaidBreakTaken
 *                             Required time on the clock before logout.
 *   requiredLogoutTime       = clockInTime + effectiveShiftDuration
 *   actualWorkTime           = elapsedShiftTime - actualBreakTaken (time excluding breaks)
 *
 * If break < allowed: shift still ends at scheduled time (effective = scheduled when no overuse).
 * If break > allowed: shift end extends proportionally (effective = scheduled + extraBreakTime + unpaid).
 */

const DEFAULT_SCHEDULED_SHIFT_MINUTES = 9 * 60; // 540
const DEFAULT_ALLOWED_PAID_BREAK_MINUTES = 30;

/**
 * Sum break minutes from breaks array. Splits by paid vs unpaid.
 * Active break (no endTime) uses now as end.
 * @param {Array} breaks - [{ startTime, endTime?, breakType }]
 * @param {Date} now
 * @returns {{ paidMinutes: number, unpaidMinutes: number, totalMinutes: number }}
 */
function aggregateBreakMinutes(breaks, now) {
    let paidMinutes = 0;
    let unpaidMinutes = 0;
    if (!breaks || !Array.isArray(breaks)) {
        return { paidMinutes: 0, unpaidMinutes: 0, totalMinutes: 0 };
    }
    for (const b of breaks) {
        if (!b?.startTime) continue;
        const start = new Date(b.startTime);
        const end = b.endTime ? new Date(b.endTime) : now;
        const durationMinutes = Math.max(0, (end - start) / 60000);
        const type = String(b.breakType || b.type || 'Unpaid').trim();
        if (type === 'Paid') {
            paidMinutes += durationMinutes;
        } else {
            unpaidMinutes += durationMinutes;
        }
    }
    return {
        paidMinutes,
        unpaidMinutes,
        totalMinutes: paidMinutes + unpaidMinutes,
    };
}

/**
 * Get unified shift time state for a single point in time.
 * All UI (timer, progress bar, required logout) should use this so values never desync.
 *
 * IMPORTANT: For requiredLogoutTime, this function now accepts a backend-calculated value
 * and only projects it forward during active breaks. The backend handles all policy logic
 * (7 PM floor for General Shift 1, etc.). Frontend never recalculates from scratch.
 *
 * @param {string|Date} clockInTime - First session start
 * @param {Array} sessions - Attendance sessions
 * @param {Array} breaks - Break records (with breakType)
 * @param {Date} now - Reference time (e.g. new Date())
 * @param {Object} options - { scheduledShiftMinutes?, allowedPaidBreakMinutes?, backendRequiredLogoutTime? }
 * @returns {Object|null} Unified state or null if no clock-in
 */
export function getUnifiedShiftTimeState(clockInTime, sessions, breaks, now, options = {}) {
    const clockIn = clockInTime ? new Date(clockInTime) : null;
    if (!clockIn || isNaN(clockIn.getTime())) return null;

    const scheduledShiftMinutes = options.scheduledShiftMinutes ?? DEFAULT_SCHEDULED_SHIFT_MINUTES;
    const allowedPaidBreakMinutes = options.allowedPaidBreakMinutes ?? DEFAULT_ALLOWED_PAID_BREAK_MINUTES;

    const scheduledShiftDuration = scheduledShiftMinutes;
    const allowedPaidBreakDuration = allowedPaidBreakMinutes;

    // Elapsed wall-clock time since clock-in
    const elapsedShiftTime = Math.max(0, (now - clockIn) / 60000); // minutes

    const { paidMinutes: actualPaidBreakTaken, unpaidMinutes: actualUnpaidBreakTaken, totalMinutes: actualBreakTaken } = aggregateBreakMinutes(breaks, now);

    // Break overuse: only paid break beyond allowance extends the shift (in whole minutes so UI and total stay in sync).
    // Unpaid break time also extends the shift (you must stay longer to make up for it).
    const extraBreakTime = Math.max(0, Math.floor(actualPaidBreakTaken - allowedPaidBreakDuration));
    const unpaidExtension = Math.floor(actualUnpaidBreakTaken);

    // Effective shift duration = scheduled + paid overuse + unpaid break (all whole minutes).
    // So required logout = clockIn + effectiveShiftDuration; no early completion if you took less break.
    const effectiveShiftDuration = scheduledShiftDuration + extraBreakTime + unpaidExtension;

    // Required logout time: USE BACKEND VALUE if provided (respects 7 PM floor and all policy logic)
    // Only fall back to frontend calculation if backend value is missing (shouldn't happen in normal flow)
    let requiredLogoutTime;
    if (options.backendRequiredLogoutTime) {
        requiredLogoutTime = new Date(options.backendRequiredLogoutTime);
    } else {
        // Fallback: simple duration-based calculation (no policy enforcement)
        requiredLogoutTime = new Date(clockIn.getTime() + effectiveShiftDuration * 60000);
    }

    // Progress: elapsed / effective (0..1). Cap at 1 when shift is done.
    const progress = effectiveShiftDuration > 0 ? Math.min(1, elapsedShiftTime / effectiveShiftDuration) : 0;

    // Active work time (excluding breaks) — for display "Active Work Time (excluding breaks)"
    const actualWorkTime = Math.max(0, elapsedShiftTime - actualBreakTaken);

    return {
        scheduledShiftDuration,
        allowedPaidBreakDuration,
        elapsedShiftTime,
        actualBreakTaken,
        actualPaidBreakTaken,
        actualUnpaidBreakTaken,
        extraBreakTime,
        effectiveShiftDuration,
        requiredLogoutTime,
        progress,
        actualWorkTime,
        // Total logout extension beyond scheduled shift (excess paid + all unpaid), for warning copy
        breakExceededMinutes: extraBreakTime + unpaidExtension,
    };
}

/**
 * Format minutes as "Xh Ym" for display.
 */
export function formatMinutesToHM(minutes) {
    if (minutes == null || isNaN(minutes) || minutes < 0) return '0h 0m';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
}

