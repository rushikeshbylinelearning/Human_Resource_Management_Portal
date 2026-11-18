// backend/models/ProfileSubmissionAudit.js
const mongoose = require('mongoose');

const profileSubmissionAuditSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['PROFILE_SUBMITTED', 'PROFILE_UPDATED', 'TOKEN_GENERATED', 'TOKEN_EXPIRED', 'TOKEN_REUSED', 'FORM_UNLOCKED'],
    required: true
  },
  source: {
    type: String,
    enum: ['PUBLIC_FORM', 'ADMIN_PANEL', 'SYSTEM'],
    default: 'PUBLIC_FORM'
  },
  token: {
    type: String,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  dataSubmitted: {
    type: Object,
    default: {}
  },
  metadata: {
    type: Object,
    default: {}
  }
}, { 
  timestamps: true 
});

// Indexes for audit queries
profileSubmissionAuditSchema.index({ employeeId: 1, createdAt: -1 });
profileSubmissionAuditSchema.index({ action: 1, createdAt: -1 });
profileSubmissionAuditSchema.index({ token: 1 });

module.exports = mongoose.model('ProfileSubmissionAudit', profileSubmissionAuditSchema);
