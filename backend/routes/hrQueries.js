const express = require('express');
const router = express.Router();
const HRQuery = require('../models/HRQuery');
const User = require('../models/User');
const NewNotificationService = require('../services/NewNotificationService');
const authenticateToken = require('../middleware/authenticateToken');
const requireHRQueryAccess = require('../middleware/requireHRQueryAccess');
const { logger } = require('../utils/logger');

// ─── EMPLOYEE ROUTES ────────────────────────────────────────────────────────

// Get all queries for the logged-in employee
router.get('/my-queries', authenticateToken, async (req, res) => {
    try {
        const queries = await HRQuery.find({ employeeId: req.user.userId })
            .sort({ lastMessageAt: -1 })
            .select('-ipAddress -userAgent')
            .lean();
        
        // Add unread count for each query
        queries.forEach(query => {
            query.unreadCount = query.messages.filter(msg => 
                msg.sender !== 'employee' && !msg.read
            ).length;
        });
        
        res.json(queries);
    } catch (error) {
        logger.error('Failed to fetch employee queries:', error);
        res.status(500).json({ error: 'Failed to fetch queries' });
    }
});

// Create a new HR query
router.post('/create', authenticateToken, async (req, res) => {
    try {
        const { subject, category, message, anonymousToHR } = req.body;
        
        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }
        
        // Get employee name
        const employee = await User.findById(req.user.userId).select('fullName');
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        const query = new HRQuery({
            employeeId: req.user.userId,
            subject,
            category: category || 'General',
            anonymousToHR: anonymousToHR || false,
            messages: [{
                sender: 'employee',
                senderName: employee.fullName,
                senderId: req.user.userId,
                message,
                timestamp: new Date(),
                read: false
            }],
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });
        
        await query.save();
        
        logger.info(`HR Query created by employee ${req.user.userId}: ${subject}`);
        
        // Create notification for Admin/HR using the service
        try {
            await NewNotificationService.broadcastToAdmins({
                message: `New HR Query: ${subject}`,
                type: 'hr_query_new',
                category: 'hr_query',
                priority: 'high',
                actionData: {
                    actionType: 'navigate',
                    actionUrl: `/admin/hr-queries`,
                    requiresAction: true
                },
                navigationData: {
                    page: 'hr-queries',
                    params: { queryId: query._id }
                },
                metadata: {
                    queryId: query._id,
                    queryCategory: query.category,
                    status: query.status
                }
            }, req.user.userId);
        } catch (notifError) {
            logger.error('Failed to create notification for new HR query:', notifError);
        }
        
        res.status(201).json({
            message: 'Query submitted successfully',
            queryId: query._id
        });
    } catch (error) {
        logger.error('Failed to create HR query:', error);
        res.status(500).json({ error: 'Failed to submit query' });
    }
});

// Add a message to an existing query
router.post('/:queryId/message', authenticateToken, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        const query = await HRQuery.findById(req.params.queryId);
        
        if (!query) {
            return res.status(404).json({ error: 'Query not found' });
        }
        
        // Verify the query belongs to this employee
        if (query.employeeId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Get employee name
        const employee = await User.findById(req.user.userId).select('fullName');
        
        await query.addMessage('employee', employee.fullName, req.user.userId, message);
        
        // Create notification for Admin/HR using the service
        try {
            await NewNotificationService.broadcastToAdmins({
                message: `New message in HR Query: ${query.subject}`,
                type: 'hr_query_response',
                category: 'hr_query',
                priority: 'medium',
                actionData: {
                    actionType: 'navigate',
                    actionUrl: `/admin/hr-queries`,
                    requiresAction: true
                },
                navigationData: {
                    page: 'hr-queries',
                    params: { queryId: query._id }
                },
                metadata: {
                    queryId: query._id,
                    queryCategory: query.category,
                    status: query.status
                }
            }, req.user.userId);
        } catch (notifError) {
            logger.error('Failed to create notification for HR query message:', notifError);
        }
        
        res.json({ message: 'Message sent successfully' });
    } catch (error) {
        logger.error('Failed to add message to query:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get a specific query with all messages
router.get('/:queryId', authenticateToken, async (req, res) => {
    try {
        const query = await HRQuery.findById(req.params.queryId)
            .populate('employeeId', 'fullName employeeId employeeCode email department')
            .select('-ipAddress -userAgent')
            .lean();
        
        if (!query) {
            return res.status(404).json({ error: 'Query not found' });
        }
        
        // Check access rights — owner, Admin/HR, or delegated HR-query managers
        const ownerId = (query.employeeId?._id || query.employeeId)?.toString();
        const isEmployee = ownerId === req.user.userId;
        const isHROrAdmin = req.user.role === 'Admin' || req.user.role === 'HR';
        let canManage = isHROrAdmin;
        if (!isEmployee && !canManage) {
            const dbUser = await User.findById(req.user.userId).select('featurePermissions').lean();
            canManage = dbUser?.featurePermissions?.canManageHRQueries === true;
        }

        if (!isEmployee && !canManage) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Mark messages as read
        const dbQuery = await HRQuery.findById(req.params.queryId);
        if (isEmployee) {
            await dbQuery.markMessagesAsRead('employee');
        } else if (canManage) {
            await dbQuery.markMessagesAsRead('hr');
        }
        
        // Reload with updated read status
        const updatedQuery = await HRQuery.findById(req.params.queryId)
            .populate('employeeId', 'fullName employeeId employeeCode email department')
            .select('-ipAddress -userAgent')
            .lean();

        res.json({ ...updatedQuery, itemType: 'hr_query' });
    } catch (error) {
        logger.error('Failed to fetch query:', error);
        res.status(500).json({ error: 'Failed to fetch query' });
    }
});

// Update query status (employee can close their own queries)
router.patch('/:queryId/status', authenticateToken, async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['open', 'closed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }
        
        const query = await HRQuery.findById(req.params.queryId);
        
        if (!query) {
            return res.status(404).json({ error: 'Query not found' });
        }
        
        // Verify the query belongs to this employee
        if (query.employeeId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        query.status = status;
        if (status === 'closed') {
            query.resolvedAt = new Date();
        }
        
        await query.save();
        
        res.json({ message: 'Query status updated successfully' });
    } catch (error) {
        logger.error('Failed to update query status:', error);
        res.status(500).json({ error: 'Failed to update query status' });
    }
});

// ─── ADMIN/HR ROUTES ────────────────────────────────────────────────────────

// Get all queries (Admin/HR/Delegated) - now includes resource requests
router.get('/admin/all', authenticateToken, requireHRQueryAccess, async (req, res) => {
    try {
        
        const { status, category, assignedTo, includeResourceRequests } = req.query;
        
        // Fetch HR Queries
        const filter = {};
        if (status) filter.status = status;
        if (category) filter.category = category;
        if (assignedTo) filter.assignedTo = assignedTo;
        
        const queries = await HRQuery.find(filter)
            .populate('employeeId', 'fullName employeeId email department')
            .populate('assignedTo', 'fullName')
            .sort({ lastMessageAt: -1 })
            .select('-ipAddress -userAgent')
            .lean();
        
        // Add unread count for each query
        queries.forEach(query => {
            query.unreadCount = query.messages.filter(msg => 
                msg.sender === 'employee' && !msg.read
            ).length;
            
            // Hide employee details if query is marked anonymous
            if (query.anonymousToHR) {
                query.employeeId = {
                    fullName: 'Anonymous Employee',
                    employeeId: 'Anonymous',
                    email: 'hidden',
                    department: 'hidden'
                };
            }
            
            // Mark as HR Query type
            query.itemType = 'hr_query';
        });
        
        // Fetch Resource Requests if requested (default: true)
        let combinedResults = [...queries];
        
        if (includeResourceRequests !== 'false') {
            const EmployeeResourceRequest = require('../models/EmployeeResourceRequest');
            const User = require('../models/User');
            
            const resourceRequestFilter = {};
            // Only show pending and in-progress requests as notifications
            resourceRequestFilter.status = { $in: ['Pending', 'In Progress'] };
            
            const resourceRequests = await EmployeeResourceRequest.find(resourceRequestFilter)
                .sort({ createdAt: -1 })
                .limit(50)
                .lean();
            
            // Get user details for resource requests
            const userIds = [...new Set(resourceRequests.map(req => req.userId.toString()))];
            const users = await User.find({ _id: { $in: userIds } })
                .select('_id fullName employeeCode email department profileImageUrl')
                .lean();
            const userMap = new Map(users.map(u => [u._id.toString(), u]));
            
            // Transform resource requests to match query format for display
            const transformedResourceRequests = resourceRequests.map(req => {
                const user = userMap.get(req.userId.toString());
                return {
                    _id: req._id,
                    itemType: 'resource_request',
                    subject: `${req.category}: ${req.title}`,
                    category: req.category,
                    status: req.status.toLowerCase().replace(' ', '-'),
                    priority: req.priority,
                    employeeId: user ? {
                        _id: user._id,
                        fullName: user.fullName,
                        employeeId: user.employeeCode,
                        email: user.email,
                        department: user.department,
                        profileImageUrl: user.profileImageUrl
                    } : null,
                    lastMessageAt: req.createdAt,
                    createdAt: req.createdAt,
                    unreadCount: req.status === 'Pending' ? 1 : 0, // Show pending as unread
                    description: req.description,
                    quantity: req.quantity,
                    resourceRequestData: {
                        title: req.title,
                        description: req.description,
                        quantity: req.quantity,
                        customCategory: req.customCategory,
                        reviewedBy: req.reviewedBy,
                        reviewedByName: req.reviewedByName,
                        reviewedAt: req.reviewedAt,
                        adminNotes: req.adminNotes
                    }
                };
            });
            
            combinedResults = [...queries, ...transformedResourceRequests];
            // Sort combined results by lastMessageAt/createdAt
            combinedResults.sort((a, b) => 
                new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt)
            );
        }
        
        res.json(combinedResults);
    } catch (error) {
        logger.error('Failed to fetch all queries:', error);
        res.status(500).json({ error: 'Failed to fetch queries' });
    }
});

// Admin/HR/Delegated respond to a query
router.post('/admin/:queryId/respond', authenticateToken, requireHRQueryAccess, async (req, res) => {
    try {
        
        const { message } = req.body;
        
        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        const query = await HRQuery.findById(req.params.queryId);
        
        if (!query) {
            return res.status(404).json({ error: 'Query not found' });
        }
        
        // Get HR/Admin name
        const responder = await User.findById(req.user.userId).select('fullName');
        
        const senderType = req.user.role === 'Admin' ? 'admin' : 'hr';
        await query.addMessage(senderType, responder.fullName, req.user.userId, message);
        
        // Create notification for employee using the service
        try {
            const notifMessage = query.anonymousToHR 
                ? `HR responded to your query: ${query.subject}`
                : `${responder.fullName} responded to your query: ${query.subject}`;
                
            await NewNotificationService.createAndEmitNotification({
                message: notifMessage,
                userId: query.employeeId,
                userName: responder.fullName,
                type: 'hr_query_response',
                recipientType: 'user',
                category: 'hr_query',
                priority: 'high',
                actionData: {
                    actionType: 'navigate',
                    actionUrl: `/hr-queries`,
                    requiresAction: true
                },
                navigationData: {
                    page: 'hr-queries',
                    params: { queryId: query._id }
                },
                metadata: {
                    queryId: query._id,
                    queryCategory: query.category,
                    status: query.status
                }
            });
        } catch (notifError) {
            logger.error('Failed to create notification for HR response:', notifError);
        }
        
        // Update status to in-progress if it's open
        if (query.status === 'open') {
            query.status = 'in-progress';
            await query.save();
        }
        
        res.json({ message: 'Response sent successfully' });
    } catch (error) {
        logger.error('Failed to respond to query:', error);
        res.status(500).json({ error: 'Failed to send response' });
    }
});

// Admin/HR/Delegated update query details
router.patch('/admin/:queryId', authenticateToken, requireHRQueryAccess, async (req, res) => {
    try {
        
        const { status, priority, assignedTo, category } = req.body;
        
        const query = await HRQuery.findById(req.params.queryId);
        
        if (!query) {
            return res.status(404).json({ error: 'Query not found' });
        }
        
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (assignedTo !== undefined) {
            query.assignedTo = assignedTo;
            // Update assignedToName if assignedTo is provided
            if (assignedTo) {
                const assignedUser = await User.findById(assignedTo).select('fullName').lean();
                query.assignedToName = assignedUser ? assignedUser.fullName : null;
            } else {
                query.assignedToName = null;
            }
        }
        if (category) query.category = category;
        
        if (status === 'resolved' || status === 'closed') {
            query.resolvedAt = new Date();
            query.resolvedBy = req.user.userId;
        }
        
        await query.save();
        
        res.json({ message: 'Query updated successfully' });
    } catch (error) {
        logger.error('Failed to update query:', error);
        res.status(500).json({ error: 'Failed to update query' });
    }
});

// Get list of users who can manage HR queries (for assignment dropdown)
router.get('/admin/assignable-users', authenticateToken, requireHRQueryAccess, async (req, res) => {
    try {
        // Get all users who can manage HR queries
        const users = await User.find({
            isActive: true,
            $or: [
                { role: { $in: ['Admin', 'HR'] } },
                { 'featurePermissions.canManageHRQueries': true }
            ]
        })
        .select('_id fullName employeeCode role featurePermissions.canManageHRQueries')
        .sort({ fullName: 1 })
        .lean();
        
        res.json(users);
    } catch (error) {
        logger.error('Failed to fetch assignable users:', error);
        res.status(500).json({ error: 'Failed to fetch assignable users' });
    }
});

// Get query statistics (Admin/HR/Delegated)
router.get('/admin/stats/overview', authenticateToken, requireHRQueryAccess, async (req, res) => {
    try {
        
        const [
            totalQueries,
            openQueries,
            inProgressQueries,
            resolvedQueries,
            unreadMessages
        ] = await Promise.all([
            HRQuery.countDocuments(),
            HRQuery.countDocuments({ status: 'open' }),
            HRQuery.countDocuments({ status: 'in-progress' }),
            HRQuery.countDocuments({ status: 'resolved' }),
            HRQuery.aggregate([
                { $unwind: '$messages' },
                { $match: { 'messages.sender': 'employee', 'messages.read': false } },
                { $count: 'total' }
            ])
        ]);
        
        res.json({
            totalQueries,
            openQueries,
            inProgressQueries,
            resolvedQueries,
            unreadMessages: unreadMessages[0]?.total || 0
        });
    } catch (error) {
        logger.error('Failed to fetch query statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Update resource request status from HR Query interface
router.patch('/admin/resource-request/:requestId/status', authenticateToken, requireHRQueryAccess, async (req, res) => {
    try {
        
        const { status, adminNotes } = req.body;
        const EmployeeResourceRequest = require('../models/EmployeeResourceRequest');
        const { STATUSES } = require('../models/EmployeeResourceRequest');
        
        if (!status || !STATUSES.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Valid: ${STATUSES.join(', ')}` });
        }
        
        const request = await EmployeeResourceRequest.findById(req.params.requestId);
        if (!request) {
            return res.status(404).json({ error: 'Resource request not found' });
        }
        
        const admin = await User.findById(req.user.userId).select('fullName').lean();
        request.status = status;
        if (adminNotes !== undefined) {
            request.adminNotes = String(adminNotes).trim().slice(0, 1000);
        }
        request.reviewedBy = req.user.userId;
        request.reviewedByName = admin?.fullName || 'Admin';
        request.reviewedAt = new Date();
        await request.save();
        
        // Send notification to employee
        const formatCategoryLabel = (req) => {
            if (req.category === 'Other' && req.customCategory) {
                return req.customCategory;
            }
            return req.category;
        };
        
        const categoryLabel = formatCategoryLabel(request);
        const statusMessages = {
            'In Progress': `Your ${categoryLabel} request "${request.title}" is now in progress.`,
            'Fulfilled': `Your ${categoryLabel} request "${request.title}" has been fulfilled.`,
            'Rejected': `Your ${categoryLabel} request "${request.title}" was rejected.`,
        };
        
        if (statusMessages[status]) {
            await NewNotificationService.createAndEmitNotification({
                userId: request.userId,
                userName: request.employeeName,
                message: statusMessages[status],
                type: 'resource_request_status',
                category: 'request',
                priority: status === 'Rejected' ? 'high' : 'medium',
                recipientType: 'user',
                navigationData: { page: '/requests', params: { requestId: request._id.toString() } },
                metadata: { requestId: request._id.toString(), status },
            });
        }
        
        res.json({ message: 'Resource request updated successfully', request });
    } catch (error) {
        logger.error('Failed to update resource request:', error);
        res.status(500).json({ error: 'Failed to update resource request' });
    }
});

module.exports = router;
