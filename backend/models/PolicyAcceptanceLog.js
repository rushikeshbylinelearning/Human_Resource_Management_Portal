// backend/models/PolicyAcceptanceLog.js
// IMMUTABLE audit log for policy acceptance during onboarding.
// Records are never deleted — only marked with status changes.
const mongoose = require('mongoose');

const policyAcceptanceLogSchema = new mongoose.Schema({
    // ── Employee ──────────────────────────────────────────────────────────────
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    userName: { type: String, required: true },
    employeeCode: { type: String, required: true },
    department: { type: String, default: '' },

    // ── Policy ────────────────────────────────────────────────────────────────
    policyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy',
        required: true,
        index: true
    },
    policyName: { type: String, required: true },
    policyVersion: { type: String, required: true },

    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PolicyTemplate',
        default: null,
        index: true
    },
    assignmentSource: {
        type: String,
        enum: ['policy', 'template', 'onboarding'],
        default: 'policy',
    },

    // ── Reading metrics ───────────────────────────────────────────────────────
    viewedAt: { type: Date, default: null },
    readingStartedAt: { type: Date, default: null },
    readingCompletedAt: { type: Date, default: null },
    // Actual seconds the document/wizard was open (measured client-side)
    readingDurationSeconds: { type: Number, default: 0 },
    wizardDurationSeconds: { type: Number, default: 0 },
    fullNoticeDurationSeconds: { type: Number, default: 0 },
    // Minimum required reading time in seconds (wordCount / 200 WPM * 60)
    minimumReadingSeconds: { type: Number, default: 0 },
    scrolledToBottom: { type: Boolean, default: false },
    stepTimings: [{
        stepKey: { type: String, required: true, trim: true },
        durationSeconds: { type: Number, default: 0 },
        viewedAt: { type: Date, default: Date.now },
        _id: false,
    }],

    // ── Acceptance ────────────────────────────────────────────────────────────
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    checkboxAcknowledged: { type: Boolean, default: false },

    // ── Device / Network context ──────────────────────────────────────────────
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    deviceType: { type: String, default: '' },  // mobile / tablet / desktop
    browser: { type: String, default: '' },

    // ── Timeline events for admin view ────────────────────────────────────────
    timeline: [{
        event: {
            type: String,
            enum: [
                'account_created',
                'first_login',
                'policy_opened',
                'policy_assigned',
                'policy_reassigned',
                'template_assigned',
                'wizard_opened',
                'reading_started',
                'reading_completed',
                'policy_accepted',
                'tour_started',
                'tour_completed',
                'profile_completed',
                'deadline_passed',
                'onboarding_completed',
                'forced_by_admin',
                'wizard_step_visited',
                'consent_provided',
                'continued_without_consent',
                'alternative_requested'
            ]
        },
        timestamp: { type: Date, default: Date.now },
        notes: { type: String, default: '' }
    }],

    // ── Completion status ─────────────────────────────────────────────────────
    // Overall onboarding completion status for this record
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'expired', 'overdue'],
        default: 'pending',
        index: true
    },
    onboardingCompletedAt: { type: Date, default: null },

    // Deadline (7 days from account creation / joining date)
    profileDeadline: { type: Date, default: null },

    // ── Template-based consent fields ─────────────────────────────────────────
    templateVersion: { type: String, default: null },

    guardian: {
        studentFullName: { type: String, trim: true },
        studentAdmissionId: { type: String, trim: true },
        guardianName: { type: String, trim: true },
        relationship: {
            type: String,
            enum: ['parent', 'legal_guardian', 'other_authorized_guardian'],
        },
        guardianEmail: { type: String, trim: true, lowercase: true },
        guardianMobile: {
            countryCode: { type: String, default: '+966', trim: true },
            number: { type: String, trim: true },
        },
        remark: { type: String, trim: true, maxlength: 1000 },
    },

    checkboxResponses: [{
        checkboxId: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        required: { type: Boolean, required: true },
        checked: { type: Boolean, required: true },
        _id: false,
    }],

    outcome: {
        type: String,
        enum: ['consented', 'continued_without_consent', 'alternative_requested'],
        default: null,
    },

}, {
    timestamps: true,
    // Never allow updates that would delete the document
});

// ── Indexes ───────────────────────────────────────────────────────────────────
policyAcceptanceLogSchema.index({ userId: 1, policyId: 1 });
policyAcceptanceLogSchema.index({ status: 1, createdAt: -1 });
policyAcceptanceLogSchema.index({ department: 1, status: 1 });

const PolicyAcceptanceLog = mongoose.model('PolicyAcceptanceLog', policyAcceptanceLogSchema);
module.exports = PolicyAcceptanceLog;
