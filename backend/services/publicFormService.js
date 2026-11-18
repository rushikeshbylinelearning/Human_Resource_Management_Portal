// backend/services/publicFormService.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const EmployeePublicToken = require('../models/EmployeePublicToken');
const ProfileSubmissionAudit = require('../models/ProfileSubmissionAudit');
const ProfileFormSession = require('../models/ProfileFormSession');
const { caseInsensitiveEmailClause } = require('../utils/emailUtils');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const UNLOCK_MAX_FAILURES = 8;
const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
const unlockFailures = new Map();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function isSharedLink(tokenDoc) {
  return tokenDoc?.linkType === 'shared';
}

// Computed once so a missing account takes about as long as a real password check.
const dummyPasswordHash = bcrypt.hashSync('public-form-timing-pad', 10);

class PublicFormService {
  /**
   * Generate a secure token for employee profile form
   */
  async generateToken(employeeId, generatedBy, options = {}) {
    try {
      // Find employee by employeeCode
      const employee = await User.findOne({ 
        employeeCode: employeeId,
        isActive: true 
      });

      if (!employee) {
        throw new Error('Employee not found or inactive');
      }

      // Check if there's an existing valid token
      const existingToken = await EmployeePublicToken.findOne({
        employeeId: employee.employeeCode,
        expiresAt: { $gt: new Date() },
        isUsed: false
      });

      if (existingToken && !options.forceNew) {
        return {
          token: existingToken.token,
          expiresAt: existingToken.expiresAt,
          employee: {
            employeeCode: employee.employeeCode,
            fullName: employee.fullName,
            email: employee.email
          },
          isExisting: true
        };
      }

      // Generate new secure token
      // Generate random entropy for the token hash (F-MED-004: no JWT_SECRET fallback needed)
      const randomEntropy = crypto.randomBytes(32).toString('hex');

      // Create secure hash
      const secureToken = crypto
        .createHash('sha256')
        .update(randomEntropy + employee.employeeCode + Date.now())
        .digest('hex');

      // Calculate expiry
      const expiryHours = options.expiryHours || 48;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

      // Save token to database
      const tokenDoc = await EmployeePublicToken.create({
        employeeId: employee.employeeCode,
        token: secureToken,
        expiresAt,
        generatedBy,
        allowMultipleSubmissions: options.allowMultipleSubmissions || false
      });

      // Create audit log
      await ProfileSubmissionAudit.create({
        employeeId: employee.employeeCode,
        userId: employee._id,
        action: 'TOKEN_GENERATED',
        source: 'ADMIN_PANEL',
        token: secureToken,
        metadata: {
          generatedBy,
          expiryHours,
          allowMultipleSubmissions: options.allowMultipleSubmissions || false
        }
      });

      return {
        token: secureToken,
        expiresAt,
        employee: {
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          email: employee.email,
          department: employee.department,
          designation: employee.designation
        },
        isExisting: false
      };
    } catch (error) {
      console.error('Error generating token:', error);
      throw error;
    }
  }

  /**
   * Validate token and return employee data
   */
  async validateToken(token) {
    try {
      const tokenDoc = await EmployeePublicToken.findOne({ token });

      if (!tokenDoc) {
        return { valid: false, error: 'Invalid token' };
      }

      // Check expiry
      if (new Date() > tokenDoc.expiresAt) {
        await ProfileSubmissionAudit.create({
          employeeId: tokenDoc.employeeId,
          userId: null,
          action: 'TOKEN_EXPIRED',
          source: 'PUBLIC_FORM',
          token
        });
        return { valid: false, error: 'Token expired', expired: true };
      }

      // Check if already used (unless multiple submissions allowed)
      if (tokenDoc.isUsed && !tokenDoc.allowMultipleSubmissions) {
        return { 
          valid: false, 
          error: 'Token already used', 
          alreadyUsed: true,
          submittedAt: tokenDoc.usedAt
        };
      }

      // Find employee
      const employee = await User.findOne({ 
        employeeCode: tokenDoc.employeeId 
      }).select('-passwordHash');

      if (!employee) {
        return { valid: false, error: 'Employee not found' };
      }

      return {
        valid: true,
        employee: {
          _id: employee._id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          email: employee.email,
          department: employee.department,
          designation: employee.designation,
          joiningDate: employee.joiningDate,
          role: employee.role,
          personalDetails: employee.personalDetails || {},
          identityDetails: employee.identityDetails || {}
        },
        tokenInfo: {
          expiresAt: tokenDoc.expiresAt,
          allowMultipleSubmissions: tokenDoc.allowMultipleSubmissions,
          submissionCount: tokenDoc.submissionCount
        }
      };
    } catch (error) {
      console.error('Error validating token:', error);
      throw error;
    }
  }

  /**
   * Submit profile data for the employee who unlocked this link.
   * authorizedEmployee must come from the password session, never from the client.
   */
  async submitProfile(token, profileData, metadata = {}, authorizedEmployee = null) {
    try {
      if (!authorizedEmployee?._id) {
        return { success: false, error: 'Sign in required.', requiresAuth: true };
      }

      const tokenDoc = await EmployeePublicToken.findOne({ token });
      if (!tokenDoc) {
        return { success: false, error: 'Invalid token' };
      }
      if (new Date() > tokenDoc.expiresAt) {
        return { success: false, error: 'Token expired' };
      }

      const shared = isSharedLink(tokenDoc);
      if (!shared && tokenDoc.isUsed && !tokenDoc.allowMultipleSubmissions) {
        return { success: false, error: 'Token already used' };
      }
      if (shared && tokenDoc.isUsed) {
        return { success: false, error: 'This link is no longer active' };
      }
      if (!shared && authorizedEmployee.employeeCode !== tokenDoc.employeeId) {
        return { success: false, error: 'Sign in required.', requiresAuth: true };
      }

      const employee = authorizedEmployee;
      const pd = profileData.personalDetails || {};
      const id = profileData.identityDetails || {};

      // Map public form fields → existing flat personalDetails structure
      const personalDetailsUpdate = {
        // Existing flat fields (used by ProfilePage & AdminEmployeeProfileDialog)
        bloodGroup:                    pd.bloodGroup                    || employee.personalDetails?.bloodGroup,
        phoneNumber:                   pd.phoneNumber                   || employee.personalDetails?.phoneNumber,
        phoneCountryCode:              pd.phoneCountryCode              || employee.personalDetails?.phoneCountryCode || '+91',
        alternatePhone:                pd.alternatePhone                || employee.personalDetails?.alternatePhone,
        personalEmail:                 pd.personalEmail                 || employee.personalDetails?.personalEmail,
        emergencyContactName:          pd.emergencyContactName          || employee.personalDetails?.emergencyContactName,
        emergencyContactNumber:        pd.emergencyContactNumber        || employee.personalDetails?.emergencyContactNumber,
        emergencyContactCountryCode:   pd.emergencyContactCountryCode   || employee.personalDetails?.emergencyContactCountryCode || '+91',
        emergencyContactRelationship:  pd.emergencyContactRelationship  || employee.personalDetails?.emergencyContactRelationship,
        emergencyContactEmail:         pd.emergencyContactEmail         || employee.personalDetails?.emergencyContactEmail,
        address: {
          flat:    pd.addressFlat    || employee.personalDetails?.address?.flat,
          area:    pd.addressArea    || employee.personalDetails?.address?.area,
          city:    pd.addressCity    || employee.personalDetails?.address?.city,
          state:   pd.addressState   || employee.personalDetails?.address?.state,
          pincode: pd.addressPincode || employee.personalDetails?.address?.pincode,
        },
        // Extra fields from public form
        dateOfBirth:    pd.dateOfBirth    || employee.personalDetails?.dateOfBirth,
        gender:         pd.gender         || employee.personalDetails?.gender,
        maritalStatus:  pd.maritalStatus  || employee.personalDetails?.maritalStatus,
      };

      // Remove undefined keys
      Object.keys(personalDetailsUpdate).forEach(k => {
        if (personalDetailsUpdate[k] === undefined) delete personalDetailsUpdate[k];
      });
      Object.keys(personalDetailsUpdate.address || {}).forEach(k => {
        if (personalDetailsUpdate.address[k] === undefined) delete personalDetailsUpdate.address[k];
      });

      // Map identity details → existing flat identityDetails structure
      const identityDetailsUpdate = {
        aadhaarNumber:    id.aadhaarNumber    || employee.identityDetails?.aadhaarNumber,
        panCardNumber:    id.panCardNumber    || employee.identityDetails?.panCardNumber,
        bankName:         id.bankName         || employee.identityDetails?.bankName,
        accountNumber:    id.accountNumber    || employee.identityDetails?.accountNumber,
        ifscCode:         id.ifscCode         || employee.identityDetails?.ifscCode,
        bankBranch:       id.bankBranch       || employee.identityDetails?.bankBranch,
        uanNumber:        id.uanNumber        || employee.identityDetails?.uanNumber,
        pfAccountNumber:  id.pfAccountNumber  || employee.identityDetails?.pfAccountNumber,
      };

      Object.keys(identityDetailsUpdate).forEach(k => {
        if (identityDetailsUpdate[k] === undefined) delete identityDetailsUpdate[k];
      });

      // Encrypt sensitive fields
      if (identityDetailsUpdate.aadhaarNumber) {
        identityDetailsUpdate.aadhaarNumber = this.encryptSensitiveData(identityDetailsUpdate.aadhaarNumber);
      }
      if (identityDetailsUpdate.panCardNumber) {
        identityDetailsUpdate.panCardNumber = this.encryptSensitiveData(identityDetailsUpdate.panCardNumber);
      }
      if (identityDetailsUpdate.accountNumber) {
        identityDetailsUpdate.accountNumber = this.encryptSensitiveData(identityDetailsUpdate.accountNumber);
      }

      // Update employee
      await User.findByIdAndUpdate(
        employee._id,
        { $set: { personalDetails: personalDetailsUpdate, identityDetails: identityDetailsUpdate } },
        { new: true }
      );

      // A shared link stays open for every employee. An individual link
      // is marked used; allowMultipleSubmissions still permits another submit.
      const tokenUpdate = shared
        ? { $inc: { submissionCount: 1 } }
        : { $set: { isUsed: true, usedAt: new Date() }, $inc: { submissionCount: 1 } };
      const updatedToken = await EmployeePublicToken.findOneAndUpdate(
        { token },
        tokenUpdate,
        { new: true }
      );

      // Audit log
      await ProfileSubmissionAudit.create({
        employeeId: employee.employeeCode,
        userId: employee._id,
        action: updatedToken.submissionCount > 1 ? 'PROFILE_UPDATED' : 'PROFILE_SUBMITTED',
        source: 'PUBLIC_FORM',
        token,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        dataSubmitted: { sections: Object.keys(profileData), fieldCount: this.countFields(profileData) }
      });

      return {
        success: true,
        message: 'Profile submitted successfully',
        employee: {
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          email: employee.email
        }
      };
    } catch (error) {
      console.error('Error submitting profile:', error);
      throw error;
    }
  }

  /**
   * Get token status and submission history
   */
  async getTokenStatus(employeeId) {
    try {
      const tokens = await EmployeePublicToken.find({ employeeId })
        .sort({ createdAt: -1 })
        .limit(10);

      const audits = await ProfileSubmissionAudit.find({ employeeId })
        .sort({ createdAt: -1 })
        .limit(20);

      return {
        tokens: tokens.map(t => ({
          token: t.token.substring(0, 8) + '...',
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
          isUsed: t.isUsed,
          usedAt: t.usedAt,
          submissionCount: t.submissionCount,
          status: this.getTokenStatus(t)
        })),
        audits: audits.map(a => ({
          action: a.action,
          source: a.source,
          timestamp: a.createdAt,
          metadata: a.metadata
        }))
      };
    } catch (error) {
      console.error('Error getting token status:', error);
      throw error;
    }
  }

  /**
   * Bulk generate tokens for multiple employees
   */
  async bulkGenerateTokens(employeeIds, generatedBy, options = {}) {
    const results = [];
    
    for (const employeeId of employeeIds) {
      try {
        const result = await this.generateToken(employeeId, generatedBy, options);
        results.push({
          employeeId,
          success: true,
          ...result
        });
      } catch (error) {
        results.push({
          employeeId,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Helper: Get token status
   */
  getTokenStatus(tokenDoc) {
    if (new Date() > tokenDoc.expiresAt) {
      return 'expired';
    }
    if (tokenDoc.isUsed && !tokenDoc.allowMultipleSubmissions) {
      return 'used';
    }
    if (tokenDoc.isUsed && tokenDoc.allowMultipleSubmissions) {
      return 'active-reusable';
    }
    return 'active';
  }

  /**
   * Helper: Encrypt sensitive data
   */
  encryptSensitiveData(data) {
    if (!data) return data;
    
    // Validate encryption key before use
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
      throw new Error(
        'ENCRYPTION_KEY must be set to a random value of at least 32 characters. ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }

    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Helper: Decrypt sensitive data
   */
  decryptSensitiveData(encryptedData) {
    if (!encryptedData || !encryptedData.includes(':')) return encryptedData;
    
    // Validate encryption key before use
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
      throw new Error(
        'ENCRYPTION_KEY must be set to a random value of at least 32 characters.'
      );
    }

    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
      
      const [ivHex, encrypted] = encryptedData.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return encryptedData;
    }
  }

  presentEmployee(employee) {
    return {
      _id: employee._id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      email: employee.email,
      department: employee.department,
      designation: employee.designation,
      joiningDate: employee.joiningDate,
      role: employee.role,
      personalDetails: employee.personalDetails || {},
      identityDetails: employee.identityDetails || {},
    };
  }

  /**
   * Check a link without returning any employee record.
   */
  async inspectLink(token) {
    const tokenDoc = await EmployeePublicToken.findOne({ token });
    if (!tokenDoc) return { ok: false, error: 'Invalid token' };
    if (new Date() > tokenDoc.expiresAt) {
      return { ok: false, error: 'Token expired', expired: true };
    }
    const shared = isSharedLink(tokenDoc);
    if (shared && tokenDoc.isUsed) {
      return { ok: false, error: 'This link is no longer active' };
    }
    if (!shared && tokenDoc.isUsed && !tokenDoc.allowMultipleSubmissions) {
      return {
        ok: false,
        error: 'Token already used',
        alreadyUsed: true,
        submittedAt: tokenDoc.usedAt,
      };
    }
    return {
      ok: true,
      linkType: shared ? 'shared' : 'individual',
      tokenInfo: {
        expiresAt: tokenDoc.expiresAt,
        allowMultipleSubmissions: shared ? true : tokenDoc.allowMultipleSubmissions,
        submissionCount: tokenDoc.submissionCount,
      },
    };
  }

  failureBucket(email, ip) {
    const key = sha256(`${String(email || '').trim().toLowerCase()}|${ip || ''}`);
    const now = Date.now();
    const current = unlockFailures.get(key);
    if (!current || current.resetAt <= now) {
      return { key, count: 0, resetAt: now + UNLOCK_WINDOW_MS };
    }
    return { key, ...current };
  }

  /**
   * Verify the employee's own login password, then issue a session cookie value.
   * The raw session token is returned once so the controller can set an httpOnly cookie.
   */
  async unlock(linkToken, email, password, metadata = {}) {
    const emailText = typeof email === 'string' ? email.trim() : '';
    const passwordText = typeof password === 'string' ? password : '';
    if (!emailText || !passwordText || passwordText.length > 200) {
      return { ok: false, status: 400, error: 'Email and password are required.' };
    }

    const bucket = this.failureBucket(emailText, metadata.ipAddress);
    if (bucket.count >= UNLOCK_MAX_FAILURES) {
      return { ok: false, status: 429, error: 'Too many attempts. Please try again later.' };
    }

    const inspection = await this.inspectLink(linkToken);
    if (!inspection.ok) {
      return { ok: false, status: 400, error: inspection.error, expired: inspection.expired, alreadyUsed: inspection.alreadyUsed };
    }

    const tokenDoc = await EmployeePublicToken.findOne({ token: linkToken });
    if (!tokenDoc) {
      return { ok: false, status: 400, error: 'Invalid token' };
    }
    const shared = isSharedLink(tokenDoc);
    const emailClause = caseInsensitiveEmailClause(emailText);
    const user = emailClause ? await User.findOne({ email: emailClause }) : null;
    const passwordOk = await bcrypt.compare(passwordText, user?.passwordHash || dummyPasswordHash);
    const active = !!(user && user.isActive !== false && user.passwordHash);
    const linkOk = !!(user && (shared || user.employeeCode === tokenDoc.employeeId));

    if (!active || !passwordOk || !linkOk) {
      unlockFailures.set(bucket.key, { count: bucket.count + 1, resetAt: bucket.resetAt });
      return { ok: false, status: 401, error: 'Invalid email or password.' };
    }

    unlockFailures.delete(bucket.key);

    const linkTokenHash = sha256(linkToken);
    await ProfileFormSession.deleteMany({ userId: user._id, linkTokenHash });

    const rawSession = crypto.randomBytes(32).toString('hex');
    await ProfileFormSession.create({
      tokenHash: sha256(rawSession),
      userId: user._id,
      linkTokenHash,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });

    await ProfileSubmissionAudit.create({
      employeeId: user.employeeCode,
      userId: user._id,
      action: 'FORM_UNLOCKED',
      source: 'PUBLIC_FORM',
      token: linkToken,
      ipAddress: metadata.ipAddress || null,
      userAgent: metadata.userAgent || null,
      metadata: { linkType: shared ? 'shared' : 'individual' },
    });

    return {
      ok: true,
      sessionToken: rawSession,
      linkType: shared ? 'shared' : 'individual',
      employee: this.presentEmployee(user),
      tokenInfo: inspection.tokenInfo,
    };
  }

  /**
   * Load the employee bound to this cookie and this exact link.
   * Returns null when the cookie is missing, expired, or for a different link.
   */
  async employeeFromSession(rawCookie, linkToken) {
    if (!rawCookie || !linkToken) return null;
    const session = await ProfileFormSession.findOne({
      tokenHash: sha256(rawCookie),
      linkTokenHash: sha256(linkToken),
      expiresAt: { $gt: new Date() },
    });
    if (!session) return null;

    const tokenDoc = await EmployeePublicToken.findOne({ token: linkToken });
    if (!tokenDoc || new Date() > tokenDoc.expiresAt) return null;
    const shared = isSharedLink(tokenDoc);
    if (shared && tokenDoc.isUsed) return null;
    if (!shared && tokenDoc.isUsed && !tokenDoc.allowMultipleSubmissions) return null;

    const user = await User.findById(session.userId).select('-passwordHash');
    if (!user || user.isActive === false) return null;
    if (!shared && user.employeeCode !== tokenDoc.employeeId) return null;

    return { employee: user, tokenDoc };
  }

  /**
   * One reusable link. Whoever signs in with their own password edits only their record.
   */
  async generateSharedToken(generatedBy, options = {}) {
    if (!options.forceNew) {
      const existing = await EmployeePublicToken.findOne({
        linkType: 'shared',
        isUsed: false,
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });

      if (existing) {
        return {
          token: existing.token,
          expiresAt: existing.expiresAt,
          isExisting: true,
          linkType: 'shared',
        };
      }
    } else {
      await EmployeePublicToken.updateMany(
        { linkType: 'shared', isUsed: false },
        { $set: { isUsed: true, usedAt: new Date() } }
      );
    }

    const randomEntropy = crypto.randomBytes(32).toString('hex');
    const secureToken = crypto
      .createHash('sha256')
      .update(randomEntropy + 'shared' + Date.now())
      .digest('hex');

    const expiryHours = options.expiryHours || 168;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    await EmployeePublicToken.create({
      linkType: 'shared',
      token: secureToken,
      expiresAt,
      generatedBy,
      allowMultipleSubmissions: true,
    });

    if (generatedBy) {
      await ProfileSubmissionAudit.create({
        employeeId: 'SHARED',
        userId: generatedBy,
        action: 'TOKEN_GENERATED',
        source: 'ADMIN_PANEL',
        token: secureToken,
        metadata: { linkType: 'shared', generatedBy, expiryHours },
      });
    }

    return {
      token: secureToken,
      expiresAt,
      isExisting: false,
      linkType: 'shared',
    };
  }

  /**
   * Helper: Count fields in profile data
   */
  countFields(data) {
    let count = 0;
    const traverse = (obj) => {
      for (const key in obj) {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          traverse(obj[key]);
        } else if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
          count++;
        }
      }
    };
    traverse(data);
    return count;
  }
}

module.exports = new PublicFormService();
