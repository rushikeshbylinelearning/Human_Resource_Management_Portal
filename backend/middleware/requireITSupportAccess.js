// backend/middleware/requireITSupportAccess.js
const User = require('../models/User');

/**
 * Three IT ticket access tiers (cascading):
 * 1. View  — canViewITSupport
 * 2. Write — canManageITSupport  (implies view): update status/priority/comments
 * 3. Assign — canAssignITSupport (implies write+view): assign tickets to IT staff
 * Admin always has all three.
 */
const hasITViewAccess = (user) => {
    if (!user || user.isActive === false) return false;
    if (user.role === 'Admin') return true;
    const fp = user.featurePermissions || {};
    return (
        fp.canViewITSupport === true
        || fp.canManageITSupport === true
        || fp.canAssignITSupport === true
    );
};

const hasITWriteAccess = (user) => {
    if (!user || user.isActive === false) return false;
    if (user.role === 'Admin') return true;
    const fp = user.featurePermissions || {};
    return fp.canManageITSupport === true || fp.canAssignITSupport === true;
};

const hasITAssignAccess = (user) => {
    if (!user || user.isActive === false) return false;
    if (user.role === 'Admin') return true;
    return user.featurePermissions?.canAssignITSupport === true;
};

const attachAccess = (req, user) => {
    req.itSupportAccess = {
        canView: hasITViewAccess(user),
        canWrite: hasITWriteAccess(user),
        canAssign: hasITAssignAccess(user),
    };
};

/** Read access for listing / viewing tickets. */
const requireITSupportAccess = async (req, res, next) => {
    try {
        if (req.user.role === 'Admin') {
            req.itSupportAccess = { canView: true, canWrite: true, canAssign: true };
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

        attachAccess(req, user);
        return next();
    } catch (error) {
        console.error('Error in requireITSupportAccess middleware:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/** Write access for status / priority / IT staff comments. */
const requireITSupportWriteAccess = async (req, res, next) => {
    try {
        if (req.user.role === 'Admin') {
            req.itSupportAccess = { canView: true, canWrite: true, canAssign: true };
            return next();
        }

        const user = await User.findById(req.user.userId)
            .select('featurePermissions isActive role')
            .lean();

        if (!hasITWriteAccess(user)) {
            return res.status(403).json({
                error: 'Access denied. You need IT Ticket Write access to update tickets.'
            });
        }

        attachAccess(req, user);
        return next();
    } catch (error) {
        console.error('Error in requireITSupportWriteAccess middleware:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/** Assign access for assigning tickets to IT staff. */
const requireITSupportAssignAccess = async (req, res, next) => {
    try {
        if (req.user.role === 'Admin') {
            req.itSupportAccess = { canView: true, canWrite: true, canAssign: true };
            return next();
        }

        const user = await User.findById(req.user.userId)
            .select('featurePermissions isActive role')
            .lean();

        if (!hasITAssignAccess(user)) {
            return res.status(403).json({
                error: 'Access denied. You need IT Ticket Assign access to assign tickets.'
            });
        }

        attachAccess(req, user);
        return next();
    } catch (error) {
        console.error('Error in requireITSupportAssignAccess middleware:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

module.exports = requireITSupportAccess;
module.exports.requireITSupportAccess = requireITSupportAccess;
module.exports.requireITSupportWriteAccess = requireITSupportWriteAccess;
module.exports.requireITSupportAssignAccess = requireITSupportAssignAccess;
module.exports.hasITViewAccess = hasITViewAccess;
module.exports.hasITWriteAccess = hasITWriteAccess;
module.exports.hasITAssignAccess = hasITAssignAccess;
