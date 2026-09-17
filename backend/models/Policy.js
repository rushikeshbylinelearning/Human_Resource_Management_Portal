const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    version: {
        type: String,
        required: true,
        trim: true
    },
    effectiveFrom: {
        type: Date,
        required: true
    },
    department: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['Active', 'Archived'],
        default: 'Active'
    },
    // pdf = uploaded PDF; consent_template = assignment stub for a published wizard
    sourceKind: {
        type: String,
        enum: ['pdf', 'consent_template'],
        default: 'pdf',
        index: true
    },
    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PolicyTemplate',
        default: null,
        index: true
    },
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        required: function requiredFileId() {
            return (this.sourceKind || 'pdf') !== 'consent_template';
        }
    },
    fileName: {
        type: String,
        required: function requiredFileName() {
            return (this.sourceKind || 'pdf') !== 'consent_template';
        }
    },
    fileSize: {
        type: Number
    },
    // Legacy field for backward compatibility
    fileUrl: {
        type: String
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    replacedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy'
    },
    // Onboarding / compliance flags
    isMandatoryOnboarding: {
        type: Boolean,
        default: false,
        index: true
    },
    onboardingExpiryDays: {
        type: Number,
        default: 7  // induction popup hidden after this many days
    },
    wordCount: {
        type: Number,
        default: null // set by admin or auto-computed on upload
    }
}, {
    timestamps: true
});

// Index for faster queries
policySchema.index({ status: 1, effectiveFrom: -1 });
policySchema.index({ name: 1, version: 1 });
policySchema.index({ templateId: 1, status: 1 });

const Policy = mongoose.model('Policy', policySchema);

module.exports = Policy;
