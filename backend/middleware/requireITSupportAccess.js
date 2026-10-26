// backend/middleware/requireITSupportAccess.js
const User = require('../models/User');

const hasITViewAccess = (user) => {
    if (!user || user.isActive === false) return false;
    if (user.role === 'Admin') return true;
    const fp = user.featurePermissions || {};
    // Write implies view; keep legacy canManageITSupport-only grants working
    return fp.canViewITSupport === true || fp.canManageITSupport === true;
};

const hasITWriteAccess = (user) => {
    if (!user || user.isActive === false) return false;
    if (user.role === 'Admin') return true;
    return user.featurePermissions?.canManageITSupport === true;
};

/**
 * Read access: Admin, or canViewITSupport / canManageITSupport.
 * Used for listing tickets, assignees, export, and viewing details.
 */
const requireITSupportAccess = async (req, res, next) => {
    try {
        if (req.user.role === 'Admin') {
            return next();
        }

        const user = await User.findById(req.user.userId)
            .select('featurePermissions isActive role')
            .lean();

        if (!hasITViewAccess(user)) {
            return res.status(403).json({
                error: 'Access denied. You do not have permission to view IT support tickets.'
            });
        }

        req.itSupportAccess = {
            canView: true,
            canWrite: hasITWriteAccess(user)
        };
        return next();
    } catch (error) {
        console.error('Error in requireITSupportAccess middleware:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * Write access: Admin or canManageITSupport only.
 * Used for assign / status / priority updates.
 */
const requireITSupportWriteAccess = async (req, res, next) => {
    try {
        if (req.user.role === 'Admin') {
            req.itSupportAccess = { canView: true, canWrite: true };
            return next();
        }

        const user = await User.findById(req.user.userId)
            .select('featurePermissions isActive role')
            .lean();

        if (!hasITWriteAccess(user)) {
            return res.status(403).json({
                error: 'Access denied. You have read-only IT ticket access and cannot assign or update tickets.'
            });
        }

        req.itSupportAccess = { canView: true, canWrite: true };
        return next();
    } catch (error) {
        console.error('Error in requireITSupportWriteAccess middleware:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

module.exports = requireITSupportAccess;
module.exports.requireITSupportAccess = requireITSupportAccess;
module.exports.requireITSupportWriteAccess = requireITSupportWriteAccess;
module.exports.hasITViewAccess = hasITViewAccess;
module.exports.hasITWriteAccess = hasITWriteAccess;
