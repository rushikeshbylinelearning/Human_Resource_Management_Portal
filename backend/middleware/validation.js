// Input validation middleware using express-validator
const { body, validationResult } = require('express-validator');
const { logError } = require('../utils/logger');

// Validation result handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path,
      message: error.msg,
      value: error.value
    }));

    logError(new Error('Validation failed'), {
      errors: errorMessages,
      body: req.body,
      params: req.params,
      query: req.query
    });

    return res.status(400).json({
      error: 'Validation failed',
      details: errorMessages
    });
  }
  next();
};

// Authentication validation
// Allow both email and employeeCode for login
const validateLogin = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email or Employee Code is required')
    .custom((value) => {
      // Accept either valid email OR non-empty string (for employeeCode)
      // Don't force email validation since employeeCode is also allowed
      return true;
    }),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  handleValidationErrors
];

// User creation validation
const validateUserCreation = [
  body('fullName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must be at least 8 characters with uppercase, lowercase, and number'),
  body('role')
    .isIn(['Admin', 'HR', 'Employee', 'Intern'])
    .withMessage('Role must be Admin, HR, Employee, or Intern'),
  body('employeeCode')
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Employee code must be between 3 and 20 characters'),
  handleValidationErrors
];

// Sanitize input helper
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS attempts
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  };

  // Recursively sanitize object
  const sanitizeObject = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return sanitizeString(obj);
    if (Array.isArray(obj)) return obj.map(sanitizeObject);
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

module.exports = {
  validateLogin,
  validateUserCreation,
  sanitizeInput,
  handleValidationErrors
};








