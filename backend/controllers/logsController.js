// backend/controllers/logsController.js
const NewNotification = require('../models/NewNotification');

const formatLogTypeLabel = (type) =>
    (type || 'activity').replace(/_/g, ' ');

const enrichActivityLog = (log) => {
    if (!log) return log;
    if (log.message && String(log.message).trim()) {
        return log;
    }
    const typeLabel = formatLogTypeLabel(log.type);
    let message = typeLabel;
    if (log.userName && log.userName !== 'System') {
        message = `${log.userName} — ${typeLabel}`;
    } else if (log.metadata?.employeeName) {
        message = `${log.metadata.employeeName} — ${typeLabel}`;
    } else if (log.metadata?.type) {
        message = String(log.metadata.type).replace(/_/g, ' ');
    }
    return { ...log, message };
};

/**
 * Get HR-related logs
 * Categories: leave, attendance, employee, hr_query, etc.
 */
const getHRLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        // HR-related categories
        const hrCategories = [
            'leave',
            'attendance',
            'employee',
            'hr_query',
            'system',
            'policy'
        ];

        const query = {
            category: { $in: hrCategories }
        };

        // Filters
        if (req.query.type) {
            query.type = req.query.type;
        }

        if (req.query.priority) {
            query.priority = req.query.priority;
        }

        if (req.query.startDate && req.query.endDate) {
            query.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        // Search
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { message: searchRegex },
                { userName: searchRegex },
                { type: searchRegex }
            ];
        }

        const [logs, totalCount] = await Promise.all([
            NewNotification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            NewNotification.countDocuments(query)
        ]);

        // Get summary statistics
        const statistics = await NewNotification.aggregate([
            {
                $match: { category: { $in: hrCategories } }
            },
            {
                $facet: {
                    byCategory: [
                        { $group: { _id: '$category', count: { $sum: 1 } } }
                    ],
                    byType: [
                        { $group: { _id: '$type', count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 10 }
                    ],
                    byPriority: [
                        { $group: { _id: '$priority', count: { $sum: 1 } } }
                    ]
                }
            }
        ]);

        res.json({
            logs,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            statistics: statistics[0] || {},
            categories: hrCategories
        });
    } catch (error) {
        console.error('Error fetching HR logs:', error);
        res.status(500).json({ error: 'Failed to fetch HR logs.' });
    }
};

/**
 * Get IT-related logs
 * Categories: it_support, it_ticket, etc.
 */
const getITLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        // IT-related categories and types
        const query = {
            $or: [
                { category: 'it_support' },
                { type: { $in: [
                    'it_ticket_created',
                    'it_ticket_status',
                    'it_ticket_assigned',
                    'it_ticket_priority',
                    'it_ticket_comment',
                    'it_ticket_cancelled'
                ] } }
            ]
        };

        // Filters
        if (req.query.type) {
            query.type = req.query.type;
        }

        if (req.query.priority) {
            query.priority = req.query.priority;
        }

        if (req.query.startDate && req.query.endDate) {
            query.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        // Search
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { message: searchRegex },
                { userName: searchRegex },
                { type: searchRegex },
                { 'metadata.ticketId': searchRegex }
            ];
        }

        const [logs, totalCount] = await Promise.all([
            NewNotification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            NewNotification.countDocuments(query)
        ]);

        // Get summary statistics
        const statistics = await NewNotification.aggregate([
            {
                $match: query
            },
            {
                $facet: {
                    byType: [
                        { $group: { _id: '$type', count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ],
                    byPriority: [
                        { $group: { _id: '$priority', count: { $sum: 1 } } }
                    ],
                    today: [
                        {
                            $match: {
                                createdAt: {
                                    $gte: new Date(new Date().setHours(0, 0, 0, 0))
                                }
                            }
                        },
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        res.json({
            logs,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            statistics: statistics[0] || {},
            categories: ['it_support']
        });
    } catch (error) {
        console.error('Error fetching IT logs:', error);
        res.status(500).json({ error: 'Failed to fetch IT logs.' });
    }
};

/**
 * Get activity logs (existing functionality, now as separate endpoint)
 * All categories not specifically HR or IT
 */
const getActivityLogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        // Exclude HR and IT specific categories
        const excludeCategories = [
            'it_support'
        ];

        const excludeTypes = [
            'it_ticket_created',
            'it_ticket_status',
            'it_ticket_assigned',
            'it_ticket_priority',
            'it_ticket_comment',
            'it_ticket_cancelled'
        ];

        const query = {
            category: { $nin: excludeCategories },
            type: { $nin: excludeTypes }
        };

        // Filters
        if (req.query.type) {
            query.type = req.query.type;
        }

        if (req.query.category) {
            query.category = req.query.category;
        }

        if (req.query.priority) {
            query.priority = req.query.priority;
        }

        if (req.query.startDate && req.query.endDate) {
            query.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(req.query.endDate)
            };
        }

        // Search
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            // Remove the category/type filters if searching
            delete query.category;
            delete query.type;
            
            query.$and = [
                { category: { $nin: excludeCategories } },
                { type: { $nin: excludeTypes } },
                {
                    $or: [
                        { message: searchRegex },
                        { userName: searchRegex },
                        { type: searchRegex }
                    ]
                }
            ];
        }

        const [rawLogs, totalCount] = await Promise.all([
            NewNotification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            NewNotification.countDocuments(query)
        ]);

        const logs = rawLogs.map(enrichActivityLog);

        res.json({
            logs,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit)
        });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        res.status(500).json({ error: 'Failed to fetch activity logs.' });
    }
};

module.exports = {
    getHRLogs,
    getITLogs,
    getActivityLogs
};
