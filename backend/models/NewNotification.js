// backend/models/NewNotification.js
const mongoose = require('mongoose');

const newNotificationSchema = new mongoose.Schema({
    // Core notification data
    id: { type: String, required: true, unique: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: [
            'checkin', 'checkout', 'normal_checkout', 
            'break_start', 'break_end', 
            'leave_request', 'leave_approval', 'leave_rejection', 'leave_returned', 'leave_resubmitted', 'leave_revoked', 
            'extra_break_request', 'extra_break_approval', 'extra_break_rejection', 
            'auto_break', 'auto_break_end', 
            'system', 'info', 'success', 'warning', 'error', 
            'half_day_marked', 
            'early_checkout_request', 'early_checkout_approved', 'early_checkout_rejected', 
            'policy_added', 'policy_updated', 
            'anonymous_feedback', 
            'cif_attachment_added', 
            'teams_report_preview', 
            'resource_request', 'resource_request_status', 
            'onboarding_welcome', 'onboarding_policy_pending', 'onboarding_tour_pending', 'onboarding_profile_pending', 'onboarding_deadline_reminder', 'onboarding_completed', 'onboarding_overdue', 
            'employee_document_assigned', 'employee_document_pending_hr', 
            'employment_status_changed', 
            'hr_query_new', 'hr_query_response', 'hr_query_status_changed',
            'it_ticket_created', 'it_ticket_status', 'it_ticket_assigned', 'it_ticket_priority', 'it_ticket_comment', 'it_ticket_cancelled'
        ], 
        required: true 
    },
    
    // User and recipient information
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, index: true }, // Allow null for system notifications
    userName: { type: String, required: true },
    recipientType: { 
        type: String, 
        enum: ['user', 'admin', 'both'], 
        default: 'user',
        index: true 
    },
    
    // Notification state
    read: { type: Boolean, default: false, index: true },
    archived: { type: Boolean, default: false, index: true },
    
    // Action data for interactive notifications
    actionData: {
        actionType: { type: String, enum: ['start_break', 'navigate', 'approve', 'reject', 'none', 'override_half_day', 'open_teams_preview'] },
        actionUrl: { type: String },
        actionParams: { type: mongoose.Schema.Types.Mixed },
        requiresAction: { type: Boolean, default: false }
    },
    
    // Navigation data
    navigationData: {
        page: { type: String },
        params: { type: mongoose.Schema.Types.Mixed }
    },
    
    // Additional metadata for notification routing and context
    metadata: { type: mongoose.Schema.Types.Mixed },
    
    // Metadata
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    category: { type: String, enum: ['attendance', 'leave', 'break', 'system', 'admin', 'request', 'hr_query', 'it_support'], default: 'system' },
    
    // System notification fields
    isSystemNotification: { type: Boolean, default: false },
    targetRoles: [{ type: String, enum: ['Admin', 'HR', 'Employee', 'Intern'] }],
    
    // Timestamps
    createdAt: { type: Date, default: Date.now, index: true },
    readAt: { type: Date },
    expiresAt: { type: Date, index: true }
}, { 
    timestamps: true,
    expireAfterSeconds: 2592000 // 30 days
});

// Indexes for better performance
newNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
newNotificationSchema.index({ recipientType: 1, read: 1, createdAt: -1 });

// --- REMOVED pre('save') hook ---
// The ID generation logic is now moved to the service layer for reliability.

// Pre-save validation hook for defensive enum validation
// This provides clear error messages and prevents server crashes
newNotificationSchema.pre('save', function(next) {
    // Validate type enum
    const validTypes = [
        'checkin', 'checkout', 'normal_checkout', 
        'break_start', 'break_end', 
        'leave_request', 'leave_approval', 'leave_rejection', 'leave_returned', 'leave_resubmitted', 'leave_revoked', 
        'extra_break_request', 'extra_break_approval', 'extra_break_rejection', 
        'auto_break', 'auto_break_end', 
        'system', 'info', 'success', 'warning', 'error', 
        'half_day_marked', 
        'early_checkout_request', 'early_checkout_approved', 'early_checkout_rejected', 
        'policy_added', 'policy_updated', 
        'anonymous_feedback', 
        'cif_attachment_added', 
        'teams_report_preview', 
        'resource_request', 'resource_request_status', 
        'onboarding_welcome', 'onboarding_policy_pending', 'onboarding_tour_pending', 'onboarding_profile_pending', 'onboarding_deadline_reminder', 'onboarding_completed', 'onboarding_overdue', 
        'employee_document_assigned', 'employee_document_pending_hr', 
        'employment_status_changed', 
        'hr_query_new', 'hr_query_response', 'hr_query_status_changed',
        'it_ticket_created', 'it_ticket_status', 'it_ticket_assigned', 'it_ticket_priority', 'it_ticket_comment', 'it_ticket_cancelled'
    ];
    if (this.type && !validTypes.includes(this.type)) {
        const error = new mongoose.Error.ValidationError(this);
        error.errors.type = new mongoose.Error.ValidatorError({
            message: `Invalid notification type: "${this.type}". Valid types are: ${validTypes.join(', ')}`,
            path: 'type',
            value: this.type
        });
        return next(error);
    }

    // Validate actionData.actionType enum if actionData exists
    if (this.actionData && this.actionData.actionType) {
        const validActionTypes = ['start_break', 'navigate', 'approve', 'reject', 'none', 'override_half_day', 'open_teams_preview'];
        if (!validActionTypes.includes(this.actionData.actionType)) {
            const error = new mongoose.Error.ValidationError(this);
            error.errors['actionData.actionType'] = new mongoose.Error.ValidatorError({
                message: `Invalid actionType: "${this.actionData.actionType}". Valid actionTypes are: ${validActionTypes.join(', ')}`,
                path: 'actionData.actionType',
                value: this.actionData.actionType
            });
            return next(error);
        }
    }

    next();
});

// Instance methods
newNotificationSchema.methods.markAsRead = function() {
    this.read = true;
    this.readAt = new Date();
    return this.save();
};

newNotificationSchema.methods.archive = function() {
    this.archived = true;
    return this.save();
};

// Static methods (unchanged)
newNotificationSchema.statics.getUnreadCount = function(userId, recipientType = 'user') {
    const query = { read: false, archived: false };
    if (recipientType === 'admin' || recipientType === 'HR') {
        query.recipientType = { $in: ['admin', 'both'] };
    } else {
        query.userId = userId;
        query.recipientType = { $in: ['user', 'both'] };
    }
    return this.countDocuments(query);
};

newNotificationSchema.statics.getUserNotifications = function(userId, recipientType = 'user', limit = 50, skip = 0) {
    const query = { archived: false };
     if (recipientType === 'admin' || recipientType === 'HR') {
        query.recipientType = { $in: ['admin', 'both'] };
    } else {
        query.userId = userId;
        query.recipientType = { $in: ['user', 'both'] };
    }
    
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();
};

module.exports = mongoose.model('NewNotification', newNotificationSchema);