// backend/models/ITSupportTicket.js
const mongoose = require('mongoose');
const Counter = require('./Counter');

// Issue categories for IT Support
const ISSUE_CATEGORIES = [
    'Computer / Laptop',
    'Network / LAN / Wi-Fi',
    'Printer / Scanner',
    'Email / Outlook',
    'Microsoft Teams',
    'Login / Access',
    'Software / Application',
    'System Performance',
    'Hardware Issue',
    'Other'
];

// Priority levels
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

// Ticket statuses
const STATUSES = [
    'OPEN',
    'ACKNOWLEDGED',
    'IN_PROGRESS',
    'WAITING_FOR_USER',
    'RESOLVED',
    'CLOSED',
    'CANCELLED'
];

const itSupportTicketSchema = new mongoose.Schema({
    // Human-readable ticket ID (e.g., IT-2026-0001)
    ticketId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Employee who raised the ticket
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    createdByName: {
        type: String,
        required: true
    },
    
    createdByCode: {
        type: String
    },
    
    department: {
        type: String
    },
    
    // Ticket details
    category: {
        type: String,
        enum: ISSUE_CATEGORIES,
        required: true,
        index: true
    },
    
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 3000
    },
    
    priority: {
        type: String,
        enum: PRIORITIES,
        default: 'Medium',
        index: true
    },
    
    status: {
        type: String,
        enum: STATUSES,
        default: 'OPEN',
        index: true
    },
    
    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true
    },
    
    assignedToName: {
        type: String,
        default: null
    },
    
    assignedAt: {
        type: Date,
        default: null
    },
    
    // Additional details
    location: {
        type: String,
        trim: true,
        maxlength: 200
    },
    
    // Attachment support (using R2 or GridFS)
    attachments: [{
        filename: String,
        url: String,
        fileType: String,
        uploadedAt: Date
    }],
    
    // Internal notes (visible to IT staff only)
    internalNotes: [{
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        authorName: String,
        note: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Communication thread (visible to both employee and IT)
    comments: [{
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        authorName: String,
        comment: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        isInternal: {
            type: Boolean,
            default: false
        }
    }],
    
    // Resolution details
    resolvedAt: {
        type: Date,
        default: null
    },
    
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    
    resolvedByName: {
        type: String,
        default: null
    },
    
    resolutionNotes: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    
    closedAt: {
        type: Date,
        default: null
    },
    
    closedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    
    // Metadata
    lastUpdatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    lastUpdatedByName: {
        type: String
    },
    
    // History tracking (for audit trail)
    statusHistory: [{
        status: String,
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        changedByName: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        notes: String
    }]
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Indexes for performance
itSupportTicketSchema.index({ createdAt: -1 });
itSupportTicketSchema.index({ status: 1, createdAt: -1 });
itSupportTicketSchema.index({ assignedTo: 1, status: 1 });
itSupportTicketSchema.index({ priority: 1, status: 1 });
itSupportTicketSchema.index({ createdBy: 1, createdAt: -1 });

// Static method to generate next ticket ID
itSupportTicketSchema.statics.generateTicketId = async function() {
    const year = new Date().getFullYear();
    const counterName = `it_ticket_${year}`;
    
    // Find and increment counter atomically
    const counter = await Counter.findOneAndUpdate(
        { name: counterName },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
    );
    
    // Format: IT-YYYY-####
    const ticketNumber = String(counter.value).padStart(4, '0');
    return `IT-${year}-${ticketNumber}`;
};

// Method to add status to history
itSupportTicketSchema.methods.addStatusHistory = function(status, changedBy, changedByName, notes = '') {
    this.statusHistory.push({
        status,
        changedBy,
        changedByName,
        timestamp: new Date(),
        notes
    });
};

// Method to add internal note
itSupportTicketSchema.methods.addInternalNote = function(author, authorName, note) {
    this.internalNotes.push({
        author,
        authorName,
        note,
        timestamp: new Date()
    });
};

// Method to add comment
itSupportTicketSchema.methods.addComment = function(author, authorName, comment, isInternal = false) {
    this.comments.push({
        author,
        authorName,
        comment,
        timestamp: new Date(),
        isInternal
    });
};

// Virtual for ticket age in days
itSupportTicketSchema.virtual('ageInDays').get(function() {
    return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Virtual for resolution time in hours (if resolved)
itSupportTicketSchema.virtual('resolutionTimeHours').get(function() {
    if (!this.resolvedAt) return null;
    return Math.floor((this.resolvedAt - this.createdAt) / (1000 * 60 * 60));
});

const ITSupportTicket = mongoose.model('ITSupportTicket', itSupportTicketSchema);

module.exports = ITSupportTicket;
module.exports.ISSUE_CATEGORIES = ISSUE_CATEGORIES;
module.exports.PRIORITIES = PRIORITIES;
module.exports.STATUSES = STATUSES;
