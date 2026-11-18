// backend/models/EmployeePublicToken.js
const mongoose = require('mongoose');

const employeePublicTokenSchema = new mongoose.Schema({
  // individual = one employee. shared = one link for every employee;
  // the signed-in email decides whose record is updated.
  linkType: {
    type: String,
    enum: ['individual', 'shared'],
    default: 'individual',
    index: true
  },
  employeeId: {
    type: String,
    required: function requiredEmployee() {
      return this.linkType !== 'shared';
    },
    index: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date,
    default: null
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  allowMultipleSubmissions: {
    type: Boolean,
    default: false
  },
  submissionCount: {
    type: Number,
    default: 0
  }
}, { 
  timestamps: true 
});

// Index for cleanup of expired tokens
employeePublicTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound index for token validation
employeePublicTokenSchema.index({ token: 1, isUsed: 1, expiresAt: 1 });

module.exports = mongoose.model('EmployeePublicToken', employeePublicTokenSchema);
