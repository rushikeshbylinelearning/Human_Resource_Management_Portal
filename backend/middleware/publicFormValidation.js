// backend/middleware/publicFormValidation.js
const { body, validationResult } = require('express-validator');
const {
  aadhaarError,
  panError,
  accountNumberError,
  ifscError,
} = require('../utils/indiaIdentity');

const optionalFilled = { values: 'falsy' };

function rejectWhen(check) {
  return (value) => {
    const message = check(value);
    if (message) throw new Error(message);
    return true;
  };
}

// Validation patterns
const PATTERNS = {
  aadhaar: /^\d{12}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  phone: /^[6-9]\d{9}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  pincode: /^\d{6}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
};

/**
 * Validation rules for profile submission
 */
const profileSubmissionRules = [
  // Personal Details
  body('personalDetails.dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Invalid date of birth format'),
  
  body('personalDetails.gender')
    .optional()
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Invalid gender'),
  
  body('personalDetails.bloodGroup')
    .optional()
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .withMessage('Invalid blood group'),
  
  body('personalDetails.maritalStatus')
    .optional()
    .isIn(['Single', 'Married', 'Divorced', 'Widowed'])
    .withMessage('Invalid marital status'),
  
  body('personalDetails.phone')
    .optional()
    .matches(PATTERNS.phone)
    .withMessage('Phone must be a valid 10-digit Indian mobile number'),
  
  body('personalDetails.alternatePhone')
    .optional(optionalFilled)
    .matches(PATTERNS.phone)
    .withMessage('Alternate phone must be a valid 10-digit Indian mobile number'),
  
  body('personalDetails.personalEmail')
    .optional()
    .matches(PATTERNS.email)
    .withMessage('Invalid email format'),
  
  // Address Details
  body('personalDetails.address.current.line1')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address line 1 must be between 5 and 200 characters'),
  
  body('personalDetails.address.current.city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City must be between 2 and 100 characters'),
  
  body('personalDetails.address.current.state')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('State must be between 2 and 100 characters'),
  
  body('personalDetails.address.current.pincode')
    .optional()
    .matches(PATTERNS.pincode)
    .withMessage('Pincode must be a valid 6-digit number'),
  
  // Emergency Contact
  body('personalDetails.emergencyContact.name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Emergency contact name must be between 2 and 100 characters'),
  
  body('personalDetails.emergencyContact.relationship')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Relationship must be between 2 and 50 characters'),
  
  body('personalDetails.emergencyContact.phone')
    .optional()
    .matches(PATTERNS.phone)
    .withMessage('Emergency contact phone must be a valid 10-digit Indian mobile number'),
  
  // Identity Details
  body('identityDetails.aadhaar')
    .optional(optionalFilled)
    .custom(rejectWhen(aadhaarError)),

  body('identityDetails.aadhaarNumber')
    .optional(optionalFilled)
    .custom(rejectWhen(aadhaarError)),
  
  body('identityDetails.pan')
    .optional(optionalFilled)
    .custom(rejectWhen(panError)),

  body('identityDetails.panCardNumber')
    .optional(optionalFilled)
    .custom(rejectWhen(panError)),
  
  body('identityDetails.bankName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Bank name must be between 2 and 100 characters'),
  
  body('identityDetails.bankAccountNumber')
    .optional(optionalFilled)
    .custom(rejectWhen(accountNumberError)),

  body('identityDetails.accountNumber')
    .optional(optionalFilled)
    .custom(rejectWhen(accountNumberError)),
  
  body('identityDetails.ifscCode')
    .optional(optionalFilled)
    .custom(rejectWhen(ifscError)),
  
  body('identityDetails.uanNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 9, max: 12 })
    .isNumeric()
    .withMessage('UAN must be a 9-12 digit number'),
  
  body('identityDetails.pfAccountNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 5, max: 50 })
    .withMessage('PF account number must be between 5 and 50 characters')
];

/**
 * Validation middleware
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().reduce((acc, error) => {
      const field = error.path || error.param;
      if (!acc[field]) {
        acc[field] = [];
      }
      acc[field].push(error.msg);
      return acc;
    }, {});

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: formattedErrors
    });
  }
  
  next();
};

/**
 * Sanitize input data
 */
const sanitizeProfileData = (req, res, next) => {
  const { personalDetails, identityDetails } = req.body;

  // Sanitize personal details
  if (personalDetails) {
    // Trim string fields
    const stringFields = ['phone', 'alternatePhone', 'personalEmail', 'bloodGroup', 'maritalStatus'];
    stringFields.forEach(field => {
      if (personalDetails[field]) {
        personalDetails[field] = personalDetails[field].toString().trim();
      }
    });

    // Sanitize address
    if (personalDetails.address) {
      ['current', 'permanent'].forEach(type => {
        if (personalDetails.address[type]) {
          Object.keys(personalDetails.address[type]).forEach(key => {
            if (typeof personalDetails.address[type][key] === 'string') {
              personalDetails.address[type][key] = personalDetails.address[type][key].trim();
            }
          });
        }
      });
    }

    // Sanitize emergency contact
    if (personalDetails.emergencyContact) {
      Object.keys(personalDetails.emergencyContact).forEach(key => {
        if (typeof personalDetails.emergencyContact[key] === 'string') {
          personalDetails.emergencyContact[key] = personalDetails.emergencyContact[key].trim();
        }
      });
    }
  }

  // Sanitize identity details
  if (identityDetails) {
    Object.keys(identityDetails).forEach(key => {
      if (typeof identityDetails[key] === 'string') {
        identityDetails[key] = identityDetails[key].trim().toUpperCase();
      }
    });
  }

  next();
};

/**
 * Rate limiting for public form token validation (relaxed — 20 per 15 min).
 * Users may re-validate several times while navigating the multi-step form.
 */
const validateRateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: 'Too many validation attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
};

/**
 * Rate limiting for public form submissions (strict — 10 per 15 min).
 * Kept tight to prevent abuse but generous enough to survive a few retries
 * on the final submit step.
 */
const rateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window (up from 5)
  message: 'Too many submission attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false
};

/**
 * Rate limiting for KYC document uploads (relaxed — 100 per 15 min).
 * An employee may upload several documents in one sitting, each requiring
 * a request-upload + confirm-upload pair, so the strict form-submission
 * limit would incorrectly block legitimate uploads.
 * 
 * Increased from 50 to 100 to account for:
 * - 8 required docs × 2 requests each = 16 requests minimum
 * - Retry attempts on network failures = potential 3× multiplier = 48 more
 * - Multiple employees on shared mobile carrier-grade NAT IPs
 * - GET /my-documents calls consuming additional requests
 */
const kycUploadLimiterConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window (up from 50)
  message: 'Too many upload attempts. Please wait a few minutes and try again.',
  standardHeaders: true,
  legacyHeaders: false,
  // Return error in consistent format matching frontend expectations
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many upload attempts. Please wait a few minutes and try again.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
};

module.exports = {
  profileSubmissionRules,
  validate,
  sanitizeProfileData,
  rateLimitConfig,
  validateRateLimitConfig,
  kycUploadLimiterConfig,
  PATTERNS
};
