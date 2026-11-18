// backend/controllers/publicFormController.js
const publicFormService = require('../services/publicFormService');
const { resolvePublicFormBaseUrl } = require('../utils/frontendUrl');

const SESSION_COOKIE = 'pf_session';
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function sessionCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/api/public',
  };
  if (isProd) opts.domain = '.bylinelms.com';
  return opts;
}

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
  };
}

class PublicFormController {
  /**
   * Validate token and get employee data
   * GET /api/public/validate?token=xxx
   */
  async validateToken(req, res) {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token is required'
        });
      }

      const result = await publicFormService.inspectLink(token);

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
          expired: result.expired,
          alreadyUsed: result.alreadyUsed,
          submittedAt: result.submittedAt
        });
      }

      const session = await publicFormService.employeeFromSession(req.cookies?.[SESSION_COOKIE], token);
      if (!session) {
        return res.json({
          success: true,
          requiresAuth: true,
          linkType: result.linkType,
          tokenInfo: result.tokenInfo
        });
      }

      return res.json({
        success: true,
        requiresAuth: false,
        linkType: result.linkType,
        employee: publicFormService.presentEmployee(session.employee),
        tokenInfo: result.tokenInfo
      });
    } catch (error) {
      console.error('Error validating token:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to validate token'
      });
    }
  }

  /**
   * Submit profile data
   * POST /api/public/submit
   */
  async submitProfile(req, res) {
    try {
      const { token, personalDetails, identityDetails } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'Token is required'
        });
      }

      const result = await publicFormService.submitProfile(
        token,
        { personalDetails, identityDetails },
        requestMeta(req),
        req.profileEmployee
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error) {
      console.error('Error submitting profile:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to submit profile'
      });
    }
  }

  /**
   * Generate token (Admin only)
   * POST /api/admin/public-form/generate-link
   */
  async generateToken(req, res) {
    try {
      const { employeeId, expiryHours, allowMultipleSubmissions } = req.body;

      if (!employeeId) {
        return res.status(400).json({
          success: false,
          error: 'Employee ID is required'
        });
      }

      const generatedBy = req.user?._id || req.user?.id;

      const result = await publicFormService.generateToken(
        employeeId,
        generatedBy,
        {
          expiryHours: expiryHours || 48,
          allowMultipleSubmissions: allowMultipleSubmissions || false,
          forceNew: req.body.forceNew || false
        }
      );

      const baseUrl = resolvePublicFormBaseUrl(req);
      const formUrl = `${baseUrl}/public-form?token=${result.token}`;

      return res.json({
        success: true,
        token: result.token,
        url: formUrl,
        expiresAt: result.expiresAt,
        employee: result.employee,
        isExisting: result.isExisting
      });
    } catch (error) {
      console.error('Error generating token:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate token'
      });
    }
  }

  /**
   * Bulk generate tokens (Admin only)
   * POST /api/admin/public-form/bulk-generate
   */
  async bulkGenerateTokens(req, res) {
    try {
      const { employeeIds, expiryHours, allowMultipleSubmissions } = req.body;

      if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Employee IDs array is required'
        });
      }

      const generatedBy = req.user?._id || req.user?.id;

      const results = await publicFormService.bulkGenerateTokens(
        employeeIds,
        generatedBy,
        {
          expiryHours: expiryHours || 48,
          allowMultipleSubmissions: allowMultipleSubmissions || false
        }
      );

      const baseUrl = resolvePublicFormBaseUrl(req);

      const resultsWithUrls = results.map(r => ({
        ...r,
        url: r.success ? `${baseUrl}/public-form?token=${r.token}` : null
      }));

      return res.json({
        success: true,
        results: resultsWithUrls,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      });
    } catch (error) {
      console.error('Error bulk generating tokens:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to generate tokens'
      });
    }
  }

  /**
   * Get token status (Admin only)
   * GET /api/admin/public-form/status/:employeeId
   */
  async getTokenStatus(req, res) {
    try {
      const { employeeId } = req.params;

      const status = await publicFormService.getTokenStatus(employeeId);

      return res.json({
        success: true,
        ...status
      });
    } catch (error) {
      console.error('Error getting token status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get token status'
      });
    }
  }

  /**
   * Get all pending submissions (Admin only)
   * GET /api/admin/public-form/pending
   */
  async getPendingSubmissions(req, res) {
    try {
      const EmployeePublicToken = require('../models/EmployeePublicToken');
      const User = require('../models/User');

      const pendingTokens = await EmployeePublicToken.find({
        expiresAt: { $gt: new Date() },
        isUsed: false,
        linkType: { $ne: 'shared' }
      }).sort({ createdAt: -1 });

      const employeeIds = pendingTokens.map(t => t.employeeId);
      const employees = await User.find({ 
        employeeCode: { $in: employeeIds } 
      }).select('employeeCode fullName email department designation');

      const employeeMap = employees.reduce((acc, emp) => {
        acc[emp.employeeCode] = emp;
        return acc;
      }, {});

      const pending = pendingTokens.map(token => ({
        employeeId: token.employeeId,
        employee: employeeMap[token.employeeId],
        tokenCreated: token.createdAt,
        expiresAt: token.expiresAt,
        status: 'pending'
      }));

      return res.json({
        success: true,
        pending,
        count: pending.length
      });
    } catch (error) {
      console.error('Error getting pending submissions:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get pending submissions'
      });
    }
  }

  /**
   * Sign in with the employee's own email and password.
   * POST /api/public/unlock
   */
  async unlock(req, res) {
    try {
      if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
        return res.status(403).json({ success: false, error: 'Request blocked.' });
      }

      const { token, email, password } = req.body || {};
      if (!token) {
        return res.status(400).json({ success: false, error: 'Token is required' });
      }

      const result = await publicFormService.unlock(token, email, password, requestMeta(req));
      if (!result.ok) {
        return res.status(result.status || 401).json({
          success: false,
          error: result.error,
          expired: result.expired,
          alreadyUsed: result.alreadyUsed
        });
      }

      res.cookie(SESSION_COOKIE, result.sessionToken, sessionCookieOptions());
      return res.json({
        success: true,
        linkType: result.linkType,
        employee: result.employee,
        tokenInfo: result.tokenInfo
      });
    } catch (error) {
      console.error('Error unlocking profile form:', error);
      return res.status(500).json({ success: false, error: 'Failed to sign in.' });
    }
  }

  /**
   * One link for every employee. Admin or HR only.
   * POST /api/admin/public-form/generate-shared-link
   */
  async generateSharedToken(req, res) {
    try {
      if (!['Admin', 'HR'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, error: 'Access denied.' });
      }

      const { expiryHours } = req.body || {};
      const generatedBy = req.user?._id || req.user?.id || req.user?.userId;
      const result = await publicFormService.generateSharedToken(generatedBy, {
        expiryHours: expiryHours || 168,
        forceNew: req.body?.forceNew || false
      });

      const baseUrl = resolvePublicFormBaseUrl(req);
      return res.json({
        success: true,
        token: result.token,
        url: `${baseUrl}/public-form?token=${result.token}`,
        expiresAt: result.expiresAt,
        isExisting: result.isExisting,
        linkType: 'shared'
      });
    } catch (error) {
      console.error('Error generating shared profile link:', error);
      return res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate shared link'
      });
    }
  }
}

module.exports = new PublicFormController();
