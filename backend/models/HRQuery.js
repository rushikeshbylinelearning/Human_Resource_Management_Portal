const mongoose = require('mongoose');

const hrQuerySchema = new mongoose.Schema({
    // Employee identification (anonymous but trackable for thread continuity)
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Query metadata
    subject: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    
    category: {
        type: String,
        enum: ['Policy', 'Leave', 'Attendance', 'Payroll', 'Benefits', 'Compliance', 'General', 'Other'],
        default: 'General'
    },
    
    status: {
        type: String,
        enum: ['open', 'in-progress', 'resolved', 'closed'],
        default: 'open'
    },
    
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Conversation messages
    messages: [{
        sender: {
            type: String,
            enum: ['employee', 'hr', 'admin'],
            required: true
        },
        senderName: {
            type: String,
            required: true
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        read: {
            type: Boolean,
            default: false
        },
        attachments: [{
            fileId: mongoose.Schema.Types.ObjectId,      // GridFS file ID
            filename: String,                             // Generated secure filename
            originalName: String,                         // User's original filename
            mimetype: String,                             // Image MIME type
            size: Number,                                 // File size in bytes
            uploadedAt: Date                             // Upload timestamp
        }]
    }],
    
    // Tracking
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    assignedToName: {
        type: String
    },
    
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    
    resolvedAt: {
        type: Date
    },
    
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Employee visibility (can be toggled by employee to keep their identity private from HR)
    anonymousToHR: {
        type: Boolean,
        default: false
    },
    
    // Metadata
    ipAddress: {
        type: String
    },
    
    userAgent: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes for faster queries
hrQuerySchema.index({ employeeId: 1, status: 1 });
hrQuerySchema.index({ status: 1, lastMessageAt: -1 });
hrQuerySchema.index({ assignedTo: 1, status: 1 });
hrQuerySchema.index({ lastMessageAt: -1 });
hrQuerySchema.index({ category: 1, status: 1 });

// Virtual for unread message count for employee
hrQuerySchema.virtual('unreadCountForEmployee').get(function() {
    return this.messages.filter(msg => 
        msg.sender !== 'employee' && !msg.read
    ).length;
});

// Virtual for unread message count for HR/Admin
hrQuerySchema.virtual('unreadCountForHR').get(function() {
    return this.messages.filter(msg => 
        msg.sender === 'employee' && !msg.read
    ).length;
});

// Method to add a message to the query
hrQuerySchema.methods.addMessage = function(sender, senderName, senderId, message, attachments = []) {
    this.messages.push({
        sender,
        senderName,
        senderId,
        message,
        timestamp: new Date(),
        read: false,
        attachments
    });
    this.lastMessageAt = new Date();
    
    // Update status if it's closed and employee sends a message
    if (this.status === 'closed' && sender === 'employee') {
        this.status = 'open';
    }
    
    return this.save();
};

// Method to mark messages as read
hrQuerySchema.methods.markMessagesAsRead = function(readerType) {
    let updated = false;
    this.messages.forEach(msg => {
        if (readerType === 'employee' && msg.sender !== 'employee' && !msg.read) {
            msg.read = true;
            updated = true;
        } else if (readerType === 'hr' && msg.sender === 'employee' && !msg.read) {
            msg.read = true;
            updated = true;
        }
    });
    
    if (updated) {
        return this.save();
    }
    return Promise.resolve(this);
};

const HRQuery = mongoose.model('HRQuery', hrQuerySchema);

module.exports = HRQuery;
