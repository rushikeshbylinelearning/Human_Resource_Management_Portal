// backend/controllers/itSupportController.js
const ITSupportTicket = require('../models/ITSupportTicket');
const { ISSUE_CATEGORIES, PRIORITIES, STATUSES } = require('../models/ITSupportTicket');
const User = require('../models/User');
const NewNotificationService = require('../services/NewNotificationService');
const { getIO } = require('../socketManager');

const userCanManageITSupport = async (userId, role) => {
    if (role === 'Admin') return true;
    const user = await User.findById(userId).select('featurePermissions').lean();
    return user?.featurePermissions?.canManageITSupport === true;
};

/**
 * Create a new IT support ticket
 */
const createTicket = async (req, res) => {
    try {
        const { category, title, description, priority, location } = req.body;

        // Validation
        if (!category || !ISSUE_CATEGORIES.includes(category)) {
            return res.status(400).json({ 
                error: `Invalid category. Valid options: ${ISSUE_CATEGORIES.join(', ')}` 
            });
        }

        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Title is required.' });
        }

        if (!description || !String(description).trim()) {
            return res.status(400).json({ error: 'Description is required.' });
        }

        if (priority && !PRIORITIES.includes(priority)) {
            return res.status(400).json({ 
                error: `Invalid priority. Valid options: ${PRIORITIES.join(', ')}` 
            });
        }

        // Get employee details
        const employee = await User.findById(req.user.userId)
            .select('fullName employeeCode department')
            .lean();

        if (!employee) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Generate ticket ID
        const ticketId = await ITSupportTicket.generateTicketId();

        // Prepare image attachments if uploaded
        const images = [];
        if (req.uploadedImages && req.uploadedImages.length > 0) {
            req.uploadedImages.forEach(img => {
                images.push({
                    fileId: img.fileId,
                    filename: img.filename,
                    originalName: img.originalName,
                    mimetype: img.mimetype,
                    size: img.size,
                    uploadedAt: new Date()
                });
            });
        }

        // Create ticket
        const ticket = await ITSupportTicket.create({
            ticketId,
            createdBy: req.user.userId,
            createdByName: employee.fullName,
            createdByCode: employee.employeeCode,
            department: employee.department,
            category,
            title: String(title).trim(),
            description: String(description).trim(),
            priority: priority || 'Medium',
            location: location ? String(location).trim() : undefined,
            images,
            status: 'OPEN'
        });

        // Add initial status to history
        ticket.addStatusHistory('OPEN', req.user.userId, employee.fullName, 'Ticket created');
        await ticket.save();

        // Notify IT managers/admins
        await NewNotificationService.broadcastToITSupportManagers({
            message: `New IT Support ticket: ${ticket.ticketId} - ${ticket.title}`,
            type: 'it_ticket_created',
            category: 'it_support',
            priority: ticket.priority === 'Critical' || ticket.priority === 'High' ? 'high' : 'medium',
            navigationData: {
                page: '/it-support/manage',
                params: { ticketId: ticket._id.toString() }
            },
            metadata: {
                ticketId: ticket.ticketId,
                ticketMongoId: ticket._id.toString(),
                category: ticket.category,
                priority: ticket.priority,
                type: 'IT_TICKET_CREATED'
            }
        }, req.user.userId);

        res.status(201).json({
            message: 'IT Support ticket created successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error creating IT support ticket:', error);
        res.status(500).json({ error: 'Failed to create ticket.' });
    }
};

/**
 * Get user's own tickets
 */
const getMyTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        const query = { createdBy: req.user.userId };

        // Filters
        if (req.query.status && STATUSES.includes(req.query.status)) {
            query.status = req.query.status;
        }

        if (req.query.priority && PRIORITIES.includes(req.query.priority)) {
            query.priority = req.query.priority;
        }

        if (req.query.category && ISSUE_CATEGORIES.includes(req.query.category)) {
            query.category = req.query.category;
        }

        // Search
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { ticketId: searchRegex },
                { title: searchRegex },
                { description: searchRegex }
            ];
        }

        const [tickets, totalCount] = await Promise.all([
            ITSupportTicket.find(query)
                .select('-internalNotes') // Don't expose internal notes to users
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ITSupportTicket.countDocuments(query)
        ]);

        res.json({
            tickets,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            categories: ISSUE_CATEGORIES,
            priorities: PRIORITIES,
            statuses: STATUSES
        });
    } catch (error) {
        console.error('Error fetching user tickets:', error);
        res.status(500).json({ error: 'Failed to fetch tickets.' });
    }
};

/**
 * Get all tickets (Admin/IT staff only)
 */
const getAllTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        const query = {};

        // Filters
        if (req.query.status && STATUSES.includes(req.query.status)) {
            query.status = req.query.status;
        }

        if (req.query.priority && PRIORITIES.includes(req.query.priority)) {
            query.priority = req.query.priority;
        }

        if (req.query.category && ISSUE_CATEGORIES.includes(req.query.category)) {
            query.category = req.query.category;
        }

        if (req.query.assignedTo) {
            if (req.query.assignedTo === 'unassigned') {
                query.assignedTo = null;
            } else {
                query.assignedTo = req.query.assignedTo;
            }
        }

        // Search
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { ticketId: searchRegex },
                { title: searchRegex },
                { description: searchRegex },
                { createdByName: searchRegex },
                { createdByCode: searchRegex }
            ];
        }

        const [tickets, totalCount] = await Promise.all([
            ITSupportTicket.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ITSupportTicket.countDocuments(query)
        ]);

        // Get summary statistics
        const statistics = await ITSupportTicket.aggregate([
            {
                $facet: {
                    byStatus: [
                        { $group: { _id: '$status', count: { $sum: 1 } } }
                    ],
                    byPriority: [
                        { $group: { _id: '$priority', count: { $sum: 1 } } }
                    ],
                    byCategory: [
                        { $group: { _id: '$category', count: { $sum: 1 } } }
                    ]
                }
            }
        ]);

        res.json({
            tickets,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            statistics: statistics[0] || {},
            categories: ISSUE_CATEGORIES,
            priorities: PRIORITIES,
            statuses: STATUSES
        });
    } catch (error) {
        console.error('Error fetching all tickets:', error);
        res.status(500).json({ error: 'Failed to fetch tickets.' });
    }
};

/**
 * Export IT tickets to Excel
 */
const exportITTicketsToExcel = async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const { formatISTDate } = require('../utils/istTime');

        const query = {};

        // Filters - matching getAllTickets logic
        if (req.query.status && STATUSES.includes(req.query.status)) {
            query.status = req.query.status;
        }

        if (req.query.priority && PRIORITIES.includes(req.query.priority)) {
            query.priority = req.query.priority;
        }

        if (req.query.category && ISSUE_CATEGORIES.includes(req.query.category)) {
            query.category = req.query.category;
        }

        if (req.query.assignedTo) {
            if (req.query.assignedTo === 'unassigned') {
                query.assignedTo = null;
            } else {
                query.assignedTo = req.query.assignedTo;
            }
        }

        // Search - matching getAllTickets logic
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { ticketId: searchRegex },
                { title: searchRegex },
                { description: searchRegex },
                { createdByName: searchRegex },
                { createdByCode: searchRegex }
            ];
        }

        // Fetch all matching tickets without pagination
        const tickets = await ITSupportTicket.find(query)
            .sort({ createdAt: -1 })
            .lean();

        // Create workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Attendance System';
        workbook.created = new Date();
        
        const worksheet = workbook.addWorksheet('IT Support Tickets');

        // Define columns with headers and widths
        worksheet.columns = [
            { header: 'Ticket ID', key: 'ticketId', width: 15 },
            { header: 'Created By', key: 'createdBy', width: 20 },
            { header: 'Employee Code', key: 'employeeCode', width: 15 },
            { header: 'Department', key: 'department', width: 15 },
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Title', key: 'title', width: 30 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Priority', key: 'priority', width: 10 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Assigned To', key: 'assignedTo', width: 20 },
            { header: 'Location', key: 'location', width: 20 },
            { header: 'Created At', key: 'createdAt', width: 18 },
            { header: 'Updated At', key: 'updatedAt', width: 18 },
            { header: 'Resolved At', key: 'resolvedAt', width: 18 },
            { header: 'Resolution Notes', key: 'resolutionNotes', width: 30 },
            { header: 'Image Count', key: 'imageCount', width: 12 }
        ];

        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Add data rows
        tickets.forEach(ticket => {
            worksheet.addRow({
                ticketId: ticket.ticketId || '',
                createdBy: ticket.createdByName || '',
                employeeCode: ticket.createdByCode || 'N/A',
                department: ticket.department || 'N/A',
                category: ticket.category || '',
                title: ticket.title || '',
                description: ticket.description ? 
                    (ticket.description.length > 500 ? 
                        ticket.description.substring(0, 500) + '...' : 
                        ticket.description) : '',
                priority: ticket.priority || '',
                status: ticket.status || '',
                assignedTo: ticket.assignedToName || '—',
                location: ticket.location || '—',
                createdAt: ticket.createdAt ? formatISTDate(ticket.createdAt, { 
                    day: '2-digit', 
                    month: 'short', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '',
                updatedAt: ticket.updatedAt ? formatISTDate(ticket.updatedAt, { 
                    day: '2-digit', 
                    month: 'short', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '',
                resolvedAt: ticket.resolvedAt ? formatISTDate(ticket.resolvedAt, { 
                    day: '2-digit', 
                    month: 'short', 
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '—',
                resolutionNotes: ticket.resolutionNotes || '—',
                imageCount: ticket.images?.length || 0
            });
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const filename = `IT_Support_Tickets_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        // Write to buffer and send
        const buffer = await workbook.xlsx.writeBuffer();
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting IT tickets to Excel:', error);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Failed to export IT tickets.' });
        }
    }
};

/**
 * Get single ticket by ID
 */
const getTicketById = async (req, res) => {
    try {
        const ticket = await ITSupportTicket.findById(req.params.id).lean();

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        // Check authorization
        const isOwner = ticket.createdBy.toString() === req.user.userId;
        const isAdmin = req.user.role === 'Admin';
        const isAssigned = ticket.assignedTo && ticket.assignedTo.toString() === req.user.userId;
        const isITStaff = await userCanManageITSupport(req.user.userId, req.user.role);

        if (!isOwner && !isAdmin && !isAssigned && !isITStaff) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (!isAdmin && !isAssigned && !isITStaff) {
            delete ticket.internalNotes;
            ticket.comments = (ticket.comments || []).filter((c) => !c.isInternal);
        }

        res.json({ ticket });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ error: 'Failed to fetch ticket.' });
    }
};

/**
 * Update ticket status
 */
const updateTicketStatus = async (req, res) => {
    try {
        const { status, notes } = req.body;

        if (!status || !STATUSES.includes(status)) {
            return res.status(400).json({ 
                error: `Invalid status. Valid options: ${STATUSES.join(', ')}` 
            });
        }

        const ticket = await ITSupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        const admin = await User.findById(req.user.userId).select('fullName').lean();
        const oldStatus = ticket.status;

        // Update status
        ticket.status = status;
        ticket.lastUpdatedBy = req.user.userId;
        ticket.lastUpdatedByName = admin?.fullName || 'Admin';

        // Add to status history
        ticket.addStatusHistory(
            status,
            req.user.userId,
            admin?.fullName || 'Admin',
            notes || `Status changed from ${oldStatus} to ${status}`
        );

        // Handle status-specific actions
        if (status === 'RESOLVED') {
            ticket.resolvedAt = new Date();
            ticket.resolvedBy = req.user.userId;
            ticket.resolvedByName = admin?.fullName || 'Admin';
            if (notes) {
                ticket.resolutionNotes = String(notes).trim().slice(0, 1000);
            }
        }

        if (status === 'CLOSED') {
            ticket.closedAt = new Date();
            ticket.closedBy = req.user.userId;
        }

        await ticket.save();

        // Emit socket event for real-time updates across all views
        try {
            const io = getIO();
            // Broadcast to all IT support managers and ticket creator
            io.emit('it_ticket_updated', {
                ticketId: ticket._id.toString(),
                ticket: ticket.toObject(),
                updateType: 'status_change',
                oldStatus,
                newStatus: status
            });
        } catch (socketError) {
            console.error('Error emitting socket event:', socketError);
            // Don't fail the request if socket emission fails
        }

        // Notify ticket creator
        const statusMessages = {
            ACKNOWLEDGED: `Your IT Support ticket ${ticket.ticketId} has been acknowledged.`,
            IN_PROGRESS: `Your IT Support ticket ${ticket.ticketId} is now being worked on.`,
            WAITING_FOR_USER: `Your IT Support ticket ${ticket.ticketId} requires your response.`,
            RESOLVED: `Your IT Support ticket ${ticket.ticketId} has been resolved.`,
            CLOSED: `Your IT Support ticket ${ticket.ticketId} has been closed.`
        };

        if (statusMessages[status]) {
            await NewNotificationService.createAndEmitNotification({
                userId: ticket.createdBy,
                userName: ticket.createdByName,
                message: statusMessages[status],
                type: 'it_ticket_status',
                category: 'it_support',
                priority: status === 'WAITING_FOR_USER' ? 'high' : 'medium',
                recipientType: 'user',
                navigationData: {
                    page: '/it-support',
                    params: { ticketId: ticket._id.toString() }
                },
                metadata: {
                    ticketId: ticket.ticketId,
                    ticketMongoId: ticket._id.toString(),
                    status
                }
            });
        }

        res.json({
            message: 'Ticket status updated successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({ error: 'Failed to update ticket status.' });
    }
};

/**
 * Assign ticket to IT staff
 */
const assignTicket = async (req, res) => {
    try {
        const { assignedTo } = req.body;

        if (!assignedTo) {
            return res.status(400).json({ error: 'assignedTo user ID is required.' });
        }

        const ticket = await ITSupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        // Verify assigned user exists
        const assignedUser = await User.findById(assignedTo).select('fullName').lean();

        if (!assignedUser) {
            return res.status(404).json({ error: 'Assigned user not found.' });
        }

        const admin = await User.findById(req.user.userId).select('fullName').lean();

        // Update assignment
        ticket.assignedTo = assignedTo;
        ticket.assignedToName = assignedUser.fullName;
        ticket.assignedAt = new Date();
        ticket.lastUpdatedBy = req.user.userId;
        ticket.lastUpdatedByName = admin?.fullName || 'Admin';

        // Add to status history
        ticket.addStatusHistory(
            ticket.status,
            req.user.userId,
            admin?.fullName || 'Admin',
            `Ticket assigned to ${assignedUser.fullName}`
        );

        await ticket.save();

        // Notify assigned user
        await NewNotificationService.createAndEmitNotification({
            userId: assignedTo,
            userName: assignedUser.fullName,
            message: `IT Support ticket ${ticket.ticketId} has been assigned to you: ${ticket.title}`,
            type: 'it_ticket_assigned',
            category: 'it_support',
            priority: ticket.priority === 'Critical' || ticket.priority === 'High' ? 'high' : 'medium',
            recipientType: 'user',
            navigationData: {
                page: '/it-support/manage',
                params: { ticketId: ticket._id.toString() }
            },
            metadata: {
                ticketId: ticket.ticketId,
                ticketMongoId: ticket._id.toString(),
                priority: ticket.priority
            }
        });

        res.json({
            message: 'Ticket assigned successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({ error: 'Failed to assign ticket.' });
    }
};

/**
 * Update ticket priority
 */
const updateTicketPriority = async (req, res) => {
    try {
        const { priority } = req.body;

        if (!priority || !PRIORITIES.includes(priority)) {
            return res.status(400).json({ 
                error: `Invalid priority. Valid options: ${PRIORITIES.join(', ')}` 
            });
        }

        const ticket = await ITSupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        const admin = await User.findById(req.user.userId).select('fullName').lean();
        const oldPriority = ticket.priority;

        ticket.priority = priority;
        ticket.lastUpdatedBy = req.user.userId;
        ticket.lastUpdatedByName = admin?.fullName || 'Admin';

        // Add to status history
        ticket.addStatusHistory(
            ticket.status,
            req.user.userId,
            admin?.fullName || 'Admin',
            `Priority changed from ${oldPriority} to ${priority}`
        );

        await ticket.save();

        // Notify if priority increased to High/Critical
        if ((priority === 'High' || priority === 'Critical') && oldPriority !== priority) {
            await NewNotificationService.createAndEmitNotification({
                userId: ticket.createdBy,
                userName: ticket.createdByName,
                message: `Priority of your IT Support ticket ${ticket.ticketId} has been changed to ${priority}.`,
                type: 'it_ticket_priority',
                category: 'it_support',
                priority: 'high',
                recipientType: 'user',
                navigationData: {
                    page: '/it-support',
                    params: { ticketId: ticket._id.toString() }
                },
                metadata: {
                    ticketId: ticket.ticketId,
                    ticketMongoId: ticket._id.toString(),
                    priority
                }
            });
        }

        res.json({
            message: 'Ticket priority updated successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error updating ticket priority:', error);
        res.status(500).json({ error: 'Failed to update ticket priority.' });
    }
};

/**
 * Add comment to ticket
 */
const addComment = async (req, res) => {
    try {
        const { comment, isInternal } = req.body;

        if (!comment || !String(comment).trim()) {
            return res.status(400).json({ error: 'Comment is required.' });
        }

        const ticket = await ITSupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        // Check authorization
        const isOwner = ticket.createdBy.toString() === req.user.userId;
        const isAdmin = req.user.role === 'Admin';
        const isAssigned = ticket.assignedTo && ticket.assignedTo.toString() === req.user.userId;
        const isITStaff = await userCanManageITSupport(req.user.userId, req.user.role);

        if (!isOwner && !isAdmin && !isAssigned && !isITStaff) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const internalComment = (isAdmin || isAssigned || isITStaff) && isInternal === true;

        const user = await User.findById(req.user.userId).select('fullName').lean();

        ticket.addComment(
            req.user.userId,
            user?.fullName || 'User',
            String(comment).trim(),
            internalComment
        );

        ticket.lastUpdatedBy = req.user.userId;
        ticket.lastUpdatedByName = user?.fullName || 'User';

        await ticket.save();

        // Notify relevant parties
        if (!internalComment) {
            // Notify ticket owner if comment is from IT staff
            if (!isOwner) {
                await NewNotificationService.createAndEmitNotification({
                    userId: ticket.createdBy,
                    userName: ticket.createdByName,
                    message: `${user?.fullName || 'IT Staff'} added a comment on your IT Support ticket ${ticket.ticketId}`,
                    type: 'it_ticket_comment',
                    category: 'it_support',
                    priority: 'medium',
                    recipientType: 'user',
                    navigationData: {
                        page: '/requests',
                        params: { ticketId: ticket._id.toString() }
                    },
                    metadata: {
                        ticketId: ticket.ticketId,
                        ticketMongoId: ticket._id.toString(),
                        type: 'IT_TICKET_COMMENT'
                    }
                });
            }

            // Notify assigned IT staff if comment is from user
            if (isOwner && ticket.assignedTo) {
                await NewNotificationService.createAndEmitNotification({
                    userId: ticket.assignedTo,
                    userName: ticket.assignedToName,
                    message: `${user?.fullName || 'User'} added a comment on IT Support ticket ${ticket.ticketId}`,
                    type: 'it_ticket_comment',
                    category: 'it_support',
                    priority: 'medium',
                    recipientType: 'user',
                    navigationData: {
                        page: '/operational-dashboard',
                        params: { tab: 'it', ticketId: ticket._id.toString() }
                    },
                    metadata: {
                        ticketId: ticket.ticketId,
                        ticketMongoId: ticket._id.toString(),
                        type: 'IT_TICKET_COMMENT'
                    }
                });
            }

            // If ticket is not assigned and comment is from user, notify all IT support managers
            if (isOwner && !ticket.assignedTo) {
                await NewNotificationService.broadcastToITSupportManagers({
                    message: `${user?.fullName || 'User'} added a comment on unassigned IT Support ticket ${ticket.ticketId}`,
                    type: 'it_ticket_comment',
                    category: 'it_support',
                    priority: 'medium',
                    navigationData: {
                        page: '/operational-dashboard',
                        params: { tab: 'it', ticketId: ticket._id.toString() }
                    },
                    metadata: {
                        ticketId: ticket.ticketId,
                        ticketMongoId: ticket._id.toString(),
                        type: 'IT_TICKET_COMMENT',
                        unassigned: true
                    }
                }, req.user.userId);
            }
        }

        res.json({
            message: 'Comment added successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ error: 'Failed to add comment.' });
    }
};

/**
 * Cancel ticket (user can cancel their own pending/open tickets)
 */
const cancelTicket = async (req, res) => {
    try {
        const ticket = await ITSupportTicket.findById(req.params.id);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        // Only ticket owner can cancel
        if (ticket.createdBy.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Only ticket creator can cancel.' });
        }

        // Can only cancel OPEN or ACKNOWLEDGED tickets
        if (!['OPEN', 'ACKNOWLEDGED'].includes(ticket.status)) {
            return res.status(400).json({ 
                error: 'Only open or acknowledged tickets can be cancelled.' 
            });
        }

        const user = await User.findById(req.user.userId).select('fullName').lean();

        ticket.status = 'CANCELLED';
        ticket.lastUpdatedBy = req.user.userId;
        ticket.lastUpdatedByName = user?.fullName || 'User';

        ticket.addStatusHistory(
            'CANCELLED',
            req.user.userId,
            user?.fullName || 'User',
            'Ticket cancelled by user'
        );

        await ticket.save();

        // Notify assigned IT staff if any
        if (ticket.assignedTo) {
            await NewNotificationService.createAndEmitNotification({
                userId: ticket.assignedTo,
                userName: ticket.assignedToName,
                message: `IT Support ticket ${ticket.ticketId} has been cancelled by the user.`,
                type: 'it_ticket_cancelled',
                category: 'it_support',
                priority: 'low',
                recipientType: 'user',
                navigationData: {
                    page: '/it-support/manage',
                    params: { ticketId: ticket._id.toString() }
                },
                metadata: {
                    ticketId: ticket.ticketId,
                    ticketMongoId: ticket._id.toString()
                }
            });
        }

        res.json({
            message: 'Ticket cancelled successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error cancelling ticket:', error);
        res.status(500).json({ error: 'Failed to cancel ticket.' });
    }
};

/**
 * View/Download IT Support ticket image
 */
const getTicketImage = async (req, res) => {
    try {
        const { ticketId, imageId } = req.params;
        const download = req.query.download === 'true';

        // Find the ticket
        const ticket = await ITSupportTicket.findById(ticketId).lean();

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        // Check authorization
        const isOwner = ticket.createdBy.toString() === req.user.userId;
        const isAdmin = req.user.role === 'Admin';
        const isAssigned = ticket.assignedTo && ticket.assignedTo.toString() === req.user.userId;
        const isITStaff = await userCanManageITSupport(req.user.userId, req.user.role);

        if (!isOwner && !isAdmin && !isAssigned && !isITStaff) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // Find the image in the ticket
        const image = ticket.images?.find(img => img.fileId.toString() === imageId);

        if (!image) {
            return res.status(404).json({ error: 'Image not found in this ticket.' });
        }

        // Get GridFS bucket
        const mongoose = require('mongoose');
        const bucket = new mongoose.mongo.GridFSBucket(
            mongoose.connection.db,
            { bucketName: "itSupportImages" }
        );

        // Check if file exists in GridFS
        const files = await bucket.find({ _id: new mongoose.Types.ObjectId(imageId) }).toArray();

        if (files.length === 0) {
            return res.status(404).json({ error: 'Image file not found in storage.' });
        }

        const file = files[0];

        // Set appropriate headers
        res.set('Content-Type', image.mimetype || file.contentType || 'image/jpeg');
        res.set('Content-Length', file.length);
        
        if (download) {
            res.set('Content-Disposition', `attachment; filename="${image.originalName}"`);
        } else {
            res.set('Content-Disposition', `inline; filename="${image.originalName}"`);
        }

        // Stream the file
        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(imageId));
        
        downloadStream.on('error', (error) => {
            console.error('[IT Support Image] Download stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to retrieve image.' });
            }
        });

        downloadStream.pipe(res);
    } catch (error) {
        console.error('Error retrieving IT support ticket image:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to retrieve image.' });
        }
    }
};

/**
 * Delete IT Support ticket image (only by ticket owner before resolution)
 */
const deleteTicketImage = async (req, res) => {
    try {
        const { ticketId, imageId } = req.params;

        // Find the ticket
        const ticket = await ITSupportTicket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }

        // Only ticket owner can delete images
        if (ticket.createdBy.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Only ticket creator can delete images.' });
        }

        // Can only delete images from OPEN or ACKNOWLEDGED tickets
        if (!['OPEN', 'ACKNOWLEDGED'].includes(ticket.status)) {
            return res.status(400).json({ 
                error: 'Images can only be deleted from open or acknowledged tickets.' 
            });
        }

        // Find the image
        const imageIndex = ticket.images.findIndex(img => img.fileId.toString() === imageId);

        if (imageIndex === -1) {
            return res.status(404).json({ error: 'Image not found in this ticket.' });
        }

        // Delete from GridFS
        const mongoose = require('mongoose');
        const bucket = new mongoose.mongo.GridFSBucket(
            mongoose.connection.db,
            { bucketName: "itSupportImages" }
        );

        try {
            await bucket.delete(new mongoose.Types.ObjectId(imageId));
        } catch (gridfsError) {
            console.error('[IT Support Image] GridFS delete error:', gridfsError);
            // Continue even if GridFS delete fails (image might not exist)
        }

        // Remove from ticket
        ticket.images.splice(imageIndex, 1);
        await ticket.save();

        res.json({
            message: 'Image deleted successfully.',
            ticket
        });
    } catch (error) {
        console.error('Error deleting IT support ticket image:', error);
        res.status(500).json({ error: 'Failed to delete image.' });
    }
};

module.exports = {
    createTicket,
    getMyTickets,
    getAllTickets,
    getTicketById,
    updateTicketStatus,
    assignTicket,
    updateTicketPriority,
    addComment,
    cancelTicket,
    getTicketImage,
    deleteTicketImage,
    exportITTicketsToExcel
};
