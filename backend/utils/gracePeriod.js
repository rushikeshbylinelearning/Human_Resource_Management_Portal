/**
 * Grace period (lateGraceMinutes) – single source of truth.
 * Value is stored in Setting key 'lateGraceMinutes', configurable by admin in Manage section.
 * Used universally for late vs on-time and half-day reason (Incomplete Hours vs Late Arrival).
 */

const Setting = require('../models/Setting');

/** Fallback only when Setting is missing or invalid. Admin should configure in Manage section. */
const FALLBACK_GRACE_MINUTES = 30;

// Module-level cache — persists for the life of the Node.js process
let _cachedValue = null;
let _cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns grace period in minutes from Setting (lateGraceMinutes).
 * Use this everywhere grace is needed; do not hardcode.
 * @returns {Promise<number>} Grace period minutes (≥ 0).
 */
async function getGracePeriodMinutes() {
    const now = Date.now();
    
    // Return cached value if still fresh
    if (_cachedValue !== null && now < _cacheExpiresAt) {
        return _cachedValue;
    }
    
    // Cache miss — fetch from DB
    try {
        const row = await Setting.findOne({ key: 'lateGraceMinutes' }).lean();
        if (!row || row.value == null) {
            _cachedValue = FALLBACK_GRACE_MINUTES;
        } else {
            const n = parseInt(Number(row.value), 10);
            _cachedValue = (!isNaN(n) && n >= 0) ? n : FALLBACK_GRACE_MINUTES;
        }
        _cacheExpiresAt = now + CACHE_TTL_MS;
        return _cachedValue;
    } catch (e) {
        console.error('[gracePeriod] Failed to fetch lateGraceMinutes, using fallback:', e.message);
        // Return cached value if available, otherwise fallback
        return _cachedValue !== null ? _cachedValue : FALLBACK_GRACE_MINUTES;
    }
}

module.exports = { getGracePeriodMinutes };
