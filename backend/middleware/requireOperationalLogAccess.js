const User = require('../models/User');

/**
 * Activity / operational logs for Admin and delegated HR / IT operators.
 */
async function requireOperationalLogAccess(req, res, next) {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (req.user.role === 'Admin') {
            return next();
        }

        const dbUser = await User.findById(req.user.userId)
            .select('featurePermissions isActive role')
            .lean();

        if (!dbUser || dbUser.isActive === false) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const fp = dbUser.featurePermissions || {};
        if (
            fp.canManageHRQueries === true
            || fp.canManageITSupport === true
            || ['HR'].includes(dbUser.role)
        ) {
            return next();
        }

        return res.status(403).json({ error: 'Access denied. Operational log access is not enabled for your account.' });
    } catch (error) {
        console.error('[requireOperationalLogAccess] Error:', error.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = requireOperationalLogAccess;
