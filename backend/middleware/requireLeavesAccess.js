const User = require('../models/User');
const { isLeavesSectionEnabled } = require('../utils/leavesSectionSetting');

const STAFF_ROLES = new Set(['Admin', 'HR']);

/**
 * Employee leave APIs: Admin/HR always pass.
 * Employees/Interns need the global leave section enabled and featurePermissions.leaves.
 */
async function requireLeavesAccess(req, res, next) {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (STAFF_ROLES.has(req.user.role)) {
            return next();
        }

        // Operations is restricted to attendance marking, attendance summary
        // and the Operational Dashboard — no leave access.
        if (req.user.role === 'Operations') {
            return res.status(403).json({
                error: 'Access denied. Operations accounts do not have access to the leave section.',
            });
        }

        const enabled = await isLeavesSectionEnabled();
        if (!enabled) {
            return res.status(403).json({
                error: 'The leave section is currently disabled.',
            });
        }

        const dbUser = await User.findById(req.user.userId)
            .select('featurePermissions isActive')
            .lean();

        if (!dbUser || dbUser.isActive === false) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (dbUser.featurePermissions?.leaves === false) {
            return res.status(403).json({
                error: 'You do not have access to the leave section.',
            });
        }

        return next();
    } catch (error) {
        console.error('[requireLeavesAccess] Error:', error.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = requireLeavesAccess;
