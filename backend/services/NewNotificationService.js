// backend/services/NewNotificationService.js
const NewNotification = require('../models/NewNotification');
const User = require('../models/User');
const { getIO } = require('../socketManager');
const { verboseLog } = require('../utils/logLevel');

class NewNotificationService {
    static async createNotification(notificationData) {
        try {
            const generatedId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const notificationWithId = { ...notificationData, id: generatedId };
            const notification = await NewNotification.create(notificationWithId);
            verboseLog('[SVC] Notification created in DB. ID:', notification.id);
            return notification;
        } catch (error) {
            // Handle Mongoose validation errors (enum validation failures)
            if (error.name === 'ValidationError') {
                const validationMessages = Object.values(error.errors).map(err => err.message).join('; ');
                console.error('[SVC] Validation error in createNotification:', validationMessages);
                // Create a structured error that can be handled by route handlers
                const validationError = new Error(`Notification validation failed: ${validationMessages}`);
                validationError.name = 'ValidationError';
                validationError.statusCode = 400;
                validationError.errors = error.errors;
                throw validationError;
            }
            console.error('[SVC] CRITICAL ERROR in createNotification:', error);
            throw error;
        }
    }

    static emitNotification(notification) {
        const io = getIO();
        if (!io) {
            console.error('[SVC] Step 2: FAILED to emit. Socket.IO instance is not available.');
            return;
        }
        const targetRoom = `user_${notification.userId}`;
        verboseLog(`[SVC] Emitting 'new_notification' to room: ${targetRoom}`);
        io.to(targetRoom).emit('new_notification', { ...notification.toObject() });
        verboseLog(`[SVC] Event emitted to ${targetRoom}`);
    }

    static async createAndEmitNotification(notificationData) {
        try {
            const notification = await this.createNotification(notificationData);
            this.emitNotification(notification);
            return notification;
        } catch (error) {
            console.error('[SVC] Error in createAndEmitNotification:', error.message);
        }
    }

    static async broadcastToAdmins(commonData, originatingUserId = null) {
        try {
            if (process.env.NODE_ENV !== 'production') console.log('[SVC] Broadcasting to admins. Common Data:', commonData);
            
            // Create a single notification that can be seen by all admins
            // Use a special "admin" user ID or null to indicate this is for all admins
            const adminNotificationData = {
                ...commonData,
                userId: null, // Special value to indicate this is for all admins
                userName: 'System',
                recipientType: 'admin',
                // Add metadata to indicate this is a system-wide admin notification
                isSystemNotification: true,
                targetRoles: ['Admin', 'HR']
            };

            // Create the notification
            const notification = await this.createNotification(adminNotificationData);
            
            // Emit to all admin users
            const io = getIO();
            if (io) {
                // Find all admin users and emit to their individual rooms
                const admins = await User.find({ role: { $in: ['Admin', 'HR'] } }).select('_id fullName').lean();
                
                // Skip self-notification for the originating user
                const filteredAdmins = admins.filter(admin => 
                    !originatingUserId || admin._id.toString() !== originatingUserId.toString()
                );

                if (process.env.NODE_ENV !== 'production') console.log(`[SVC] Emitting notification to ${filteredAdmins.length} admins.`);
                
                for (const admin of filteredAdmins) {
                    const targetRoom = `user_${admin._id}`;
                    if (process.env.NODE_ENV !== 'production') console.log(`[SVC] Emitting to room: ${targetRoom}`);
                    io.to(targetRoom).emit('new_notification', { 
                        ...notification.toObject(),
                        // Override userName for display purposes
                        userName: 'System'
                    });
                }
            }

            if (process.env.NODE_ENV !== 'production') console.log('[SVC] Admin notification created and broadcasted successfully.');
        } catch (error) {
            console.error('[SVC] CRITICAL ERROR in broadcastToAdmins:', error);
        }
    }

    /** Notify Admin users and employees granted canManageResourceRequests. */
    static async broadcastToResourceRequestManagers(commonData, originatingUserId = null) {
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SVC] Broadcasting resource request notification:', commonData);
            }

            const managers = await User.find({
                isActive: true,
                $or: [
                    { role: 'Admin' },
                    { 'featurePermissions.canManageResourceRequests': true },
                ],
            }).select('_id fullName').lean();

            const filteredManagers = managers.filter((manager) =>
                !originatingUserId || manager._id.toString() !== originatingUserId.toString()
            );

            const notificationData = {
                ...commonData,
                userId: null,
                userName: 'System',
                recipientType: 'admin',
                isSystemNotification: true,
                targetRoles: ['Admin'],
                metadata: {
                    ...(commonData.metadata || {}),
                    requiresResourceRequestAccess: true,
                },
            };

            const notification = await this.createNotification(notificationData);

            const io = getIO();
            if (io) {
                for (const manager of filteredManagers) {
                    io.to(`user_${manager._id}`).emit('new_notification', {
                        ...notification.toObject(),
                        userName: 'System',
                    });
                }
            }
        } catch (error) {
            console.error('[SVC] CRITICAL ERROR in broadcastToResourceRequestManagers:', error);
        }
    }

    /** Notify Admin users and employees granted canManageITSupport. */
    static async broadcastToITSupportManagers(commonData, originatingUserId = null) {
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SVC] Broadcasting IT support notification:', commonData);
            }

            const managers = await User.find({
                isActive: true,
                $or: [
                    { role: 'Admin' },
                    { 'featurePermissions.canManageITSupport': true },
                ],
            }).select('_id fullName').lean();

            const filteredManagers = managers.filter((manager) =>
                !originatingUserId || manager._id.toString() !== originatingUserId.toString()
            );

            const notificationData = {
                ...commonData,
                userId: null,
                userName: 'System',
                recipientType: 'admin',
                isSystemNotification: true,
                targetRoles: ['Admin'],
                metadata: {
                    ...(commonData.metadata || {}),
                    requiresITSupportAccess: true,
                },
            };

            const notification = await this.createNotification(notificationData);

            const io = getIO();
            if (io) {
                for (const manager of filteredManagers) {
                    io.to(`user_${manager._id}`).emit('new_notification', {
                        ...notification.toObject(),
                        userName: 'System',
                    });
                }
            }

            if (process.env.NODE_ENV !== 'production') {
                console.log(`[SVC] IT support notification sent to ${filteredManagers.length} managers.`);
            }
        } catch (error) {
            console.error('[SVC] CRITICAL ERROR in broadcastToITSupportManagers:', error);
        }
    }

    /** Notify Admin users and employees granted canManageHRQueries. */
    static async broadcastToHRQueryManagers(commonData, originatingUserId = null) {
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log('[SVC] Broadcasting HR query notification:', commonData);
            }

            const managers = await User.find({
                isActive: true,
                $or: [
                    { role: 'Admin' },
                    { role: 'HR' },
                    { 'featurePermissions.canManageHRQueries': true },
                ],
            }).select('_id fullName').lean();

            const filteredManagers = managers.filter((manager) =>
                !originatingUserId || manager._id.toString() !== originatingUserId.toString()
            );

            const notificationData = {
                ...commonData,
                userId: null,
                userName: 'System',
                recipientType: 'admin',
                isSystemNotification: true,
                targetRoles: ['Admin', 'HR'],
                metadata: {
                    ...(commonData.metadata || {}),
                    requiresHRQueryAccess: true,
                },
            };

            const notification = await this.createNotification(notificationData);

            const io = getIO();
            if (io) {
                for (const manager of filteredManagers) {
                    io.to(`user_${manager._id}`).emit('new_notification', {
                        ...notification.toObject(),
                        userName: 'System',
                    });
                }
            }

            if (process.env.NODE_ENV !== 'production') {
                console.log(`[SVC] HR query notification sent to ${filteredManagers.length} managers.`);
            }
        } catch (error) {
            console.error('[SVC] CRITICAL ERROR in broadcastToHRQueryManagers:', error);
        }
    }

    // --- Specific Notification Event Handlers ---
    // Pass originatingUserId to broadcastToAdmins to prevent self-notifications
    static async notifyCheckIn(userId, userName) {
        const message = `${userName} clocked in.`;
        await this.broadcastToAdmins({
            message, type: 'checkin', category: 'attendance', priority: 'medium',
            navigationData: { page: 'attendance', params: { userId } }
        }, userId);
    }

    static async notifyCheckOut(userId, userName) {
        const message = `${userName} clocked out.`;
        await this.broadcastToAdmins({
            message,
            type: 'normal_checkout',
            category: 'attendance',
            priority: 'medium',
            navigationData: { page: 'attendance', params: { userId } },
            metadata: { type: 'NORMAL_CHECKOUT' }
        }, userId);
    }

    /** Early checkout request (admin): distinct from normal checkout */
    static async notifyEarlyCheckoutRequest(userId, userName, metadata = {}) {
        const { requestId, date, remainingTimeMinutes, reasonPreview } = metadata;
        const remainingStr = remainingTimeMinutes != null ? ` (${Math.floor(remainingTimeMinutes / 60)}h ${remainingTimeMinutes % 60}m remaining)` : '';
        const message = `${userName} requested early checkout${remainingStr}.`;
        await this.broadcastToAdmins({
            message,
            type: 'early_checkout_request',
            category: 'attendance',
            priority: 'high',
            navigationData: { page: 'attendance', params: { userId }, actionParams: { earlyCheckoutRequestId: requestId } },
            metadata: { requestId, date, remainingTimeMinutes, reasonPreview, type: 'EARLY_CHECKOUT_REQUEST' }
        }, userId);
    }

    /** Early checkout approved (employee) */
    static async notifyEarlyCheckoutApproved(userId, userName) {
        const message = 'Early checkout approved.';
        await this.createAndEmitNotification({
            message,
            userId,
            userName,
            type: 'early_checkout_approved',
            recipientType: 'user',
            category: 'attendance',
            priority: 'medium',
            navigationData: { page: 'dashboard' },
            metadata: { type: 'EARLY_CHECKOUT_APPROVED' }
        });
    }

    /** Early checkout rejected (employee) */
    static async notifyEarlyCheckoutRejected(userId, userName, rejectionNote = null) {
        let message = 'Early checkout request rejected.';
        if (rejectionNote && rejectionNote.trim()) message += ` Reason: ${rejectionNote.trim()}`;
        await this.createAndEmitNotification({
            message,
            userId,
            userName,
            type: 'early_checkout_rejected',
            recipientType: 'user',
            category: 'attendance',
            priority: 'medium',
            navigationData: { page: 'dashboard' },
            metadata: { type: 'EARLY_CHECKOUT_REJECTED' }
        });
    }

    static async notifyBreakStart(userId, userName, breakType) {
        const message = `${userName} started a ${breakType} break.`;
        await this.broadcastToAdmins({
            message, type: 'break_start', category: 'break', priority: 'low',
            navigationData: { page: 'attendance', params: { userId } }
        }, userId);
    }

    static async notifyBreakEnd(userId, userName, breakType) {
        const message = `${userName} ended their ${breakType} break.`;
        await this.broadcastToAdmins({
            message, type: 'break_end', category: 'break', priority: 'low',
            navigationData: { page: 'attendance', params: { userId } }
        }, userId);
    }

    static async notifyTeaBreakStarted(employeeId, teaBreakType, announcementId, initiatedByUserId = null) {
        const label = teaBreakType === 'evening' ? 'Evening' : 'Morning';
        const message = `${label} tea break — 10 minutes starting now.`;
        await this.createAndEmitNotification({
            userId: employeeId,
            userName: 'System',
            message,
            type: 'info',
            category: 'break',
            priority: 'high',
            read: false,
            recipientType: 'user',
            metadata: {
                type: 'TEA_BREAK_STARTED',
                announcementId: String(announcementId),
                teaBreakType,
                initiatedByUserId: initiatedByUserId ? String(initiatedByUserId) : null,
            },
            navigationData: { page: 'dashboard' },
        });
    }

    static async notifyTeaBreakEnded(employeeId, employeeName, announcementId, overrunMinutes = 0) {
        const overrunText = overrunMinutes > 0
            ? ` (${overrunMinutes} min over allowance)`
            : ' (on time)';
        const message = `${employeeName} returned from tea break${overrunText}`;
        await this.broadcastToAdmins({
            message,
            type: 'info',
            category: 'break',
            priority: 'medium',
            navigationData: {
                page: 'announcements',
                params: {
                    tab: 'insights',
                    announcementId: String(announcementId),
                },
            },
            metadata: {
                type: 'TEA_BREAK_ENDED',
                announcementId: String(announcementId),
                employeeId: String(employeeId),
                employeeName,
                overrunMinutes,
            },
        }, employeeId);
    }

    static async notifyLeaveRequest(userId, userName, leaveType, startDate, endDate, requestId = null, leaveDates = null) {
        // Format message: always use "from X to Y" format for consistency (even if single day shows "from X to X")
        const message = `${userName} requested ${leaveType} leave from ${startDate} to ${endDate}.`;
        
        await this.broadcastToAdmins({
            message, 
            type: 'leave_request', 
            category: 'leave', 
            priority: 'high',
            navigationData: { 
                page: 'admin/leaves',
                params: requestId ? { requestId } : {}
            },
            metadata: {
                requestId: requestId,
                leaveType: leaveType,
                fromDate: startDate,
                toDate: endDate,
                leaveDates: leaveDates, // Store actual ISO date strings for consistency
                type: 'LEAVE_REQUEST'
            }
        }, userId);
    }
    
    // This is user-facing, so it doesn't need the broadcast helper.
    static async notifyLeaveResponse(userId, userName, status, leaveType, rejectionNotes = null) {
        const normalized = String(status || '').toLowerCase();
        let message;
        let type = 'leave_rejection';

        if (normalized === 'approved') {
            message = `Your ${leaveType} leave request has been approved.`;
            type = 'leave_approval';
        } else if (normalized === 'rejected') {
            message = `Your ${leaveType} leave request has been rejected.`;
            if (rejectionNotes) message += ` Reason: ${rejectionNotes}`;
            type = 'leave_rejection';
        } else if (normalized === 'deleted') {
            message = `Your ${leaveType} leave request has been removed by HR.${rejectionNotes ? ` ${rejectionNotes}` : ''}`;
            type = 'leave_revoked';
        } else {
            message = `Your ${leaveType} leave request has been ${normalized}.`;
            if (rejectionNotes) message += ` ${rejectionNotes}`;
            type = normalized === 'approved' ? 'leave_approval' : 'leave_rejection';
        }

        await this.createAndEmitNotification({
            message,
            userId,
            userName,
            type,
            recipientType: 'user',
            category: 'leave',
            priority: 'high',
            navigationData: { page: 'leaves' },
            metadata: {
                fromAdmin: true,
                status,
                ...(rejectionNotes ? { rejectionNotes } : {}),
            },
        });
    }

    /** Notify employee when HR reverts an approved leave (edit to rejected/pending, delete, or date removal). */
    static async notifyLeaveReverted(userId, userName, leaveType, action, detailMessage = null, requestId = null) {
        const actionMessages = {
            deleted: `Your approved ${leaveType} leave has been deleted by HR.`,
            rejected: `Your approved ${leaveType} leave has been rejected by HR.`,
            revoked: `Your approved ${leaveType} leave has been reverted by HR.`,
            updated: `Your approved ${leaveType} leave has been updated by HR.`,
        };
        let message = actionMessages[action] || actionMessages.revoked;
        if (detailMessage) message += ` ${detailMessage}`;

        await this.createAndEmitNotification({
            message,
            userId,
            userName,
            type: 'leave_revoked',
            recipientType: 'user',
            category: 'leave',
            priority: 'high',
            navigationData: { page: 'leaves', params: requestId ? { requestId } : {} },
            metadata: { fromAdmin: true, action, requestId },
        });
    }

    static async notifyLeaveReturnedForCorrection(userId, userName, leaveType, hrNotes, requestId = null) {
        const message = `Your ${leaveType} leave request needs correction. ${hrNotes ? `Note from HR: ${hrNotes}` : 'Please review and resubmit.'}`;
        await this.createAndEmitNotification({
            message,
            userId,
            userName,
            type: 'leave_returned',
            recipientType: 'user',
            category: 'leave',
            priority: 'high',
            navigationData: { page: 'leaves', params: requestId ? { requestId } : {} },
            metadata: {
                fromAdmin: true,
                hrCorrectionNotes: hrNotes,
                requestId,
            },
        });
    }

    static async notifyLeaveResubmitted(userId, userName, leaveType, startDate, endDate, requestId = null) {
        const message = `${userName} corrected and resubmitted a ${leaveType} leave request (${startDate} to ${endDate}).`;
        await this.broadcastToAdmins({
            message,
            type: 'leave_resubmitted',
            category: 'leave',
            priority: 'high',
            navigationData: {
                page: 'admin/leaves',
                params: requestId ? { requestId } : {},
            },
            metadata: { requestId, leaveType },
        }, userId);
    }

    static async notifyExtraBreakRequest(userId, userName, reason) {
        const message = `${userName} requested an extra break. Reason: ${reason}`;
        await this.broadcastToAdmins({
            message, type: 'extra_break_request', category: 'break', priority: 'high',
            navigationData: { page: 'admin/dashboard' }
        }, userId);
    }

    static async notifyAutoBreakStart(userId, userName, reason = 'Inactivity detected') {
        // Notify admins
        const adminMessage = `${userName} was placed on auto-break due to inactivity.`;
        await this.broadcastToAdmins({
            message: adminMessage, 
            type: 'auto_break', 
            category: 'break', 
            priority: 'high',
            navigationData: { page: 'attendance', params: { userId } }
        }, userId);

        // Notify user
        const userMessage = `You have been placed on an unpaid break due to inactivity. Please click "End Break" when you return to work.`;
        await this.createAndEmitNotification({
            message: userMessage,
            userId,
            userName,
            type: 'auto_break',
            recipientType: 'user',
            category: 'break',
            priority: 'high',
            navigationData: { page: 'dashboard' }
        });
    }

    static async notifyAutoBreakEnd(userId, userName, duration) {
        // Notify admins
        const adminMessage = `${userName} ended their auto-break after ${duration} minutes.`;
        await this.broadcastToAdmins({
            message: adminMessage, 
            type: 'auto_break_end', 
            category: 'break', 
            priority: 'medium',
            navigationData: { page: 'attendance', params: { userId } }
        }, userId);

        // Notify user
        const userMessage = `Your auto-break has ended. You are now back to work. Duration: ${duration} minutes.`;
        await this.createAndEmitNotification({
            message: userMessage,
            userId,
            userName,
            type: 'auto_break_end',
            recipientType: 'user',
            category: 'break',
            priority: 'medium',
            navigationData: { page: 'dashboard' }
        });
    }

    static async notifyYearEndLeaveResponse(userId, userName, status, leaveType, days, subType) {
        const action = subType === 'CARRY_FORWARD' ? 'carry forward' : 'encashment';
        let message = `Your Year-End ${action} request for ${days} day(s) of ${leaveType} leave has been ${status.toLowerCase()}.`;
        
        await this.createAndEmitNotification({
            message,
            userId,
            userName,
            type: status === 'Approved' ? 'leave_approval' : 'leave_rejection',
            recipientType: 'user',
            category: 'leave',
            priority: 'high',
            navigationData: { page: '/leaves' },
            metadata: { 
                type: 'YEAR_END_LEAVE_RESPONSE',
                status,
                leaveType,
                days,
                subType
            }
        });
    }

    /**
     * Notify admins/HR about new anonymous feedback
     * CRITICAL: This method ensures zero-trace anonymity by:
     * - Not accepting or using any user identification parameters
     * - Using hardcoded "Anonymous Employee" as the sender
     * - Only including message preview and timestamp
     */
    static async notifyAnonymousFeedback(messagePreview, timestamp) {
        try {
            if (process.env.NODE_ENV !== 'production') console.log('[SVC] Broadcasting anonymous feedback notification to admins/HR');
            
            // Truncate message for notification preview (max 100 chars)
            const preview = messagePreview.length > 100 
                ? messagePreview.substring(0, 97) + '...' 
                : messagePreview;
            
            const message = `New anonymous feedback received: "${preview}"`;
            
            await this.broadcastToAdmins({
                message,
                type: 'anonymous_feedback',
                category: 'admin',
                priority: 'high',
                navigationData: { 
                    page: 'admin/policies',
                    params: { section: 'anonymous-messages' }
                },
                metadata: {
                    type: 'ANONYMOUS_FEEDBACK',
                    timestamp: timestamp,
                    // Explicitly mark as anonymous to prevent any accidental user linking
                    isAnonymous: true,
                    senderName: 'Anonymous Employee'
                }
            }, null); // null originatingUserId ensures no user is excluded
            
            if (process.env.NODE_ENV !== 'production') console.log('[SVC] Anonymous feedback notification sent successfully');
        } catch (error) {
            console.error('[SVC] Error notifying anonymous feedback:', error);
            // Don't throw - notification failure shouldn't block feedback submission
        }
    }
}

module.exports = NewNotificationService;

