/**
 * ANALYTICS CACHE SERVICE
 * 
 * Provides caching layer for analytics queries using an in-memory LRU cache.
 * 
 * Cache Strategy:
 * - Key format: analytics:{startDate}:{endDate}:{page}:{limit}:{filters}
 * - TTL: 5 minutes (300 seconds)
 * - Automatic cache invalidation on attendance updates
 */

const crypto = require('crypto');

// In-memory LRU cache implementation
class LRUCache {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    
    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }
        
        // Move to end (most recently used)
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value);
        
        return value;
    }
    
    set(key, value, ttl = 300) {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        // Store with expiration timestamp
        this.cache.set(key, {
            data: value,
            expiresAt: Date.now() + (ttl * 1000)
        });
    }
    
    has(key) {
        if (!this.cache.has(key)) {
            return false;
        }
        
        const entry = this.cache.get(key);
        
        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }
    
    delete(key) {
        this.cache.delete(key);
    }
    
    clear() {
        this.cache.clear();
    }
    
    size() {
        return this.cache.size;
    }
}

// Initialize cache
const memoryCache = new LRUCache(100);

/**
 * Generate cache key from filters
 * 
 * @param {Object} filters - Filter criteria
 * @returns {string} Cache key
 */
function generateCacheKey(filters) {
    // Handle employee-specific analytics (different structure)
    if (filters.type === 'employee-detail') {
        const keyData = {
            type: 'employee-detail',
            employeeId: filters.employeeId,
            month: filters.month,
            year: filters.year
        };
        
        const hash = crypto
            .createHash('md5')
            .update(JSON.stringify(keyData))
            .digest('hex')
            .substring(0, 16);
        
        return `analytics:employee:${filters.employeeId}:${filters.year}-${filters.month}:${hash}`;
    }
    
    // Handle general analytics (original structure)
    const keyData = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        page: filters.page || 1,
        limit: filters.limit || 50,
        department: filters.department || '',
        location: filters.location || '',
        shiftType: filters.shiftType || '',
        employmentStatus: filters.employmentStatus || '',
        search: filters.search || ''
    };
    
    // Create hash of filter data for shorter key
    const hash = crypto
        .createHash('md5')
        .update(JSON.stringify(keyData))
        .digest('hex')
        .substring(0, 16);
    
    return `analytics:${filters.startDate}:${filters.endDate}:${hash}`;
}

/**
 * Get cached analytics data
 * 
 * @param {Object} filters - Filter criteria
 * @returns {Promise<Object|null>} Cached data or null
 */
async function getCachedAnalytics(filters) {
    const key = generateCacheKey(filters);
    
    try {
        if (memoryCache.has(key)) {
            const entry = memoryCache.get(key);
            if (entry && Date.now() <= entry.expiresAt) {
                console.log(`[AnalyticsCacheService] ✅ Memory cache HIT: ${key}`);
                return entry.data;
            }
        }
        
        console.log(`[AnalyticsCacheService] ❌ Cache MISS: ${key}`);
        return null;
        
    } catch (error) {
        console.error('[AnalyticsCacheService] Error getting cached data:', error);
        return null;
    }
}

/**
 * Set cached analytics data
 * 
 * @param {Object} filters - Filter criteria
 * @param {Object} data - Analytics data to cache
 * @param {number} ttl - Time to live in seconds (default: 300)
 * @returns {Promise<void>}
 */
async function setCachedAnalytics(filters, data, ttl = 300) {
    const key = generateCacheKey(filters);
    
    try {
        memoryCache.set(key, data, ttl);
        console.log(`[AnalyticsCacheService] ✅ Stored in memory: ${key} (TTL: ${ttl}s)`);
        
    } catch (error) {
        console.error('[AnalyticsCacheService] Error setting cached data:', error);
    }
}

/**
 * Clear all analytics cache
 * 
 * @returns {Promise<void>}
 */
async function clearAnalyticsCache() {
    try {
        memoryCache.clear();
        console.log('[AnalyticsCacheService] ✅ Cleared memory cache');
        
    } catch (error) {
        console.error('[AnalyticsCacheService] Error clearing cache:', error);
    }
}

/**
 * Clear cache for specific date range
 * 
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<void>}
 */
async function clearCacheForDateRange(startDate, endDate) {
    try {
        memoryCache.clear();
        console.log(`[AnalyticsCacheService] ✅ Cleared memory cache for ${startDate} to ${endDate}`);
        
    } catch (error) {
        console.error('[AnalyticsCacheService] Error clearing cache for date range:', error);
    }
}

/**
 * Get cache statistics
 * 
 * @returns {Promise<Object>} Cache statistics
 */
async function getCacheStats() {
    return {
        memoryCache: {
            size: memoryCache.size(),
            maxSize: memoryCache.maxSize
        }
    };
}

module.exports = {
    getCachedAnalytics,
    setCachedAnalytics,
    clearAnalyticsCache,
    clearCacheForDateRange,
    getCacheStats
};
