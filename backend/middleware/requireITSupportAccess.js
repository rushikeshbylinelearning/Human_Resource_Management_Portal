// backend/middleware/requireITSupportAccess.js
const User = require('../models/User');

/**
 * Middleware to check if user has access to manage IT support tickets
 * Admin always has access
 * Other users need explicit canManageITSupport permission
 */
const requireITSupportAccess = async (req, res, next) => {
    try {
        // Admin bypass
        if (req.user.role === 'Admin') {
            return next();
        }

        // Check database for latest permissions
        const user = await User.findById(req.user.userId)
            .select('featurePermissions isActive')
            .lean();

        if (!user || user.isActive === false) {
            return res.status(403).json({ 
                error: 'Access denied. Your account is inactive.' 
            });
        }

        // Check IT support management permission
        if (user.featurePermissions?.canManageITSupport === true) {
            return next();
        }

        return res.status(403).json({ 
            error: 'Access denied. You do not have permission to manage IT support tickets.' 
        });
    } catch (error) {
        console.error('Error in requireITSupportAccess middleware:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

module.exports = requireITSupportAccess;
