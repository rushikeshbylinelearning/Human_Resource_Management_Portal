// frontend/src/utils/leavesCache.js
// Leaves-specific in-memory cache with stable keys and TTL.
// Used by LeavesPage and AdminLeavesPage to avoid continuous refetches and enable instant UI on revisit.

const cache = new Map();

/** TTL in ms: 3 minutes. Data is considered fresh within this window. */
export const LEAVES_CACHE_TTL_MS = 3 * 60 * 1000;

/** Minimum interval between refetches when triggered by visibility (cooldown). */
export const LEAVES_REFETCH_COOLDOWN_MS = 60 * 1000;

/**
 * Build a stable cache key for employee Leaves dashboard.
 * Key format: leaves:{userId}:employee:{year}:{page}:{limit}
 */
export function getEmployeeLeavesCacheKey(userId, page = 1, limit = 10) {
  const year = new Date().getFullYear();
  return `leaves:${userId || 'anon'}:employee:${year}:${page}:${limit}`;
}

/**
 * Build a stable cache key for admin Leaves list (main requests list).
 * Key format: leaves:admin:{year}:{page}:{limit}
 */
export function getAdminLeavesCacheKey(page = 1, limit = 10, search = '') {
  const year = new Date().getFullYear();
  const searchKey = (search || '').trim().toLowerCase();
  return `leaves:admin:${year}:${page}:${limit}:${searchKey}`;
}

/**
 * Build a stable cache key for the leave analytics counts endpoint.
 * Key format: leaves:analytics:{role}:{year}:{month}:{leaveType}
 */
export function getAnalyticsCountsCacheKey(role, year, month, leaveType = '') {
  return `leaves:analytics:${role}:${year}:${month}:${leaveType}`;
}

/**
 * Build a stable cache key for the actual-work-days attendance endpoint.
 * Key format: leaves:workdays:{year}:{month}
 */
export function getWorkDaysCacheKey(year, month) {
  return `leaves:workdays:${year}:${month}`;
}

/**
 * Get cached value if present (returns stale entries too).
 * Returns the cache entry whether fresh or stale. Returns null only if key is absent.
 * @returns {{ data: any, timestamp: number, ttlMs: number } | null}
 */
export function getLeavesCache(key) {
  return cache.get(key) ?? null;
}

/**
 * Check if cache entry exists and is still within TTL (fresh).
 * Returns true only if entry exists AND is within TTL.
 * @returns {boolean}
 */
export function isLeavesCacheEntryFresh(key) {
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < entry.ttlMs;
}

/**
 * Store data in cache. Uses LEAVES_CACHE_TTL_MS by default.
 */
export function setLeavesCache(key, data, ttlMs = LEAVES_CACHE_TTL_MS) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttlMs,
  });
}

/**
 * Invalidate cache by key or by pattern (e.g. 'leaves:' to clear all leaves caches).
 */
export function invalidateLeavesCache(keyOrPattern) {
  if (!keyOrPattern) {
    cache.clear();
    return;
  }
  if (keyOrPattern.includes('*') || keyOrPattern === 'leaves:') {
    const prefix = keyOrPattern.replace(/\*/g, '');
    for (const k of cache.keys()) {
      if (k.startsWith(prefix)) cache.delete(k);
    }
    return;
  }
  cache.delete(keyOrPattern);
}

