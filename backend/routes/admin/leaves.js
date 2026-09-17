// backend/routes/admin/leaves.js
// Admin leave CRUD, balances, year-end, and auto-conversion.
// Mounted at /api/admin via routes/admin/index.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const authenticateToken = require('../../middleware/authenticateToken');
const isAdminOrHr = require('../../middleware/requireAdminOrHr');

const User = require('../../models/User');
const LeaveRequest = require('../../models/LeaveRequest');
const LeavePolicyService = require('../../services/LeavePolicyService');
const NewNotificationService = require('../../services/NewNotificationService');
const { applyBalanceOnStatusChange, validateApprovalBalances, reconcileApprovedDayAllocations } = require('../../services/leaveBalanceOnStatusChange');
const { validateDayAllocations, computeEffectiveDeductions } = require('../../utils/leaveDayAllocations');
const { syncAttendanceOnLeaveApproval, syncAttendanceOnLeaveRejection } = require('../../services/leaveAttendanceSyncService');
const { getTodayISTKey, getISTDateString, parseISTDate, startOfISTDay, endOfISTDay, normalizeLeaveDatesForApi } = require('../../utils/istTime');

// ── HELPER: count only Monday–Friday dates in a leaveDates array ─────────────
// Saturday-clubbing may have added weekend dates to the array. When deducting
// from leaveBalances we must count ONLY working days to stay in sync with what
// the employee portal and admin tracker display.
const countWorkingDaysInLeaveDates = (leaveDates) => {
    if (!leaveDates || leaveDates.length === 0) return 0;
    return leaveDates.filter(d => {
        const dow = new Date(d).getDay();
        return dow !== 0 && dow !== 6; // exclude Sunday(0) and Saturday(6)
    }).length;
};
// ─────────────────────────────────────────────────────────────────────────────

// --- LEAVE MANAGEMENT ROUTES ---

// Build optional employee/leave search match for leaves/all aggregation (after $lookup + $unwind).
function buildLeaveListSearchMatch(search) {
    const term = (search || '').trim();
    if (!term) return null;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    return {
        $or: [
            { 'employeeData.fullName': regex },
            { 'employeeData.employeeCode': regex },
            { 'employeeData.department': regex },
            { requestType: regex },
            { leaveType: regex },
            { status: regex },
            { reason: regex },
        ],
    };
}

// GET /api/admin/leaves/all
router.get('/leaves/all', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { role } = req.query; // Optional: 'Employee' or 'Intern' to filter by role
        const searchMatch = buildLeaveListSearchMatch(req.query.search);

        // Exclude YEAR_END requests from normal leave requests
        const baseQuery = { requestType: { $ne: 'YEAR_END' } };

        // If role filter is provided, use aggregation to filter by employee role
        if (role && (role === 'Employee' || role === 'Intern')) {
            // Use aggregation to filter by employee role at database level
            const matchStage = { ...baseQuery };

            const pipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'employee',
                        foreignField: '_id',
                        as: 'employeeData'
                    }
                },
                { $unwind: '$employeeData' },
                // Filter: Exclude Admin role and inactive users (business rule: only active employees/interns should appear in lists)
                { $match: { 'employeeData.role': role, 'employeeData.isActive': true } },
                ...(searchMatch ? [{ $match: searchMatch }] : []),
                {
                    $project: {
                        employee: {
                            _id: '$employeeData._id',
                            fullName: '$employeeData.fullName',
                            employeeCode: '$employeeData.employeeCode'
                        },
                        requestType: 1,
                        leaveType: 1,
                        leaveDates: 1,
                        alternateDate: 1,
                        reason: 1,
                        status: 1,
                        isBackdated: 1,
                        approvedBy: 1,
                        approvedAt: 1,
                        rejectionNotes: 1,
                        medicalCertificate: 1,
                        appliedAfterReturn: 1,
                        halfYearPeriod: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: limit }],
                        totalCount: [{ $count: 'count' }]
                    }
                }
            ];

            const result = await LeaveRequest.aggregate(pipeline);
            const requests = result[0]?.data || [];
            const totalCount = result[0]?.totalCount[0]?.count || 0;

            return res.json({
                requests,
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit)
            });
        } else {
            // No role filter - return all requests but exclude Admin and inactive users (business rule)
            // Use aggregation to filter by employee role and status at database level
            const pipeline = [
                { $match: baseQuery },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'employee',
                        foreignField: '_id',
                        as: 'employeeData'
                    }
                },
                { $unwind: '$employeeData' },
                // Filter: Exclude Admin role and inactive users
                { $match: { 'employeeData.role': { $ne: 'Admin' }, 'employeeData.isActive': true } },
                ...(searchMatch ? [{ $match: searchMatch }] : []),
                {
                    $project: {
                        employee: {
                            _id: '$employeeData._id',
                            fullName: '$employeeData.fullName',
                            employeeCode: '$employeeData.employeeCode'
                        },
                        requestType: 1,
                        leaveType: 1,
                        leaveDates: 1,
                        alternateDate: 1,
                        reason: 1,
                        status: 1,
                        isBackdated: 1,
                        approvedBy: 1,
                        approvedAt: 1,
                        rejectionNotes: 1,
                        medicalCertificate: 1,
                        appliedAfterReturn: 1,
                        halfYearPeriod: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                { $sort: { createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: limit }],
                        totalCount: [{ $count: 'count' }]
                    }
                }
            ];

            const result = await LeaveRequest.aggregate(pipeline);
            const requests = result[0]?.data || [];
            const totalCount = result[0]?.totalCount[0]?.count || 0;

            return res.json({
                requests,
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit)
            });
        }
    } catch (error) {
        console.error('Error fetching all leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests.' });
    }
});

// GET /api/admin/leaves/analytics/counts
// Performance: single aggregation returns leave counts per employee; no pagination loop.
// Query: month (1-12), year, role (Employee|Intern|All), leaveType (optional requestType), startDate, endDate (optional; overrides month/year)
router.get('/leaves/analytics/counts', [authenticateToken, isAdminOrHr], async (req, res) => {
    const cacheService = require('../../services/cacheService');
    try {
        const month = parseInt(req.query.month, 10);
        const year = parseInt(req.query.year, 10);
        const role = (req.query.role || 'Employee').trim();
        const leaveTypeFilter = (req.query.leaveType || '').trim();
        let startDate = req.query.startDate ? new Date(req.query.startDate) : null;
        let endDate = req.query.endDate ? new Date(req.query.endDate) : null;

        if (!startDate || !endDate) {
            if (Number.isNaN(month) || Number.isNaN(year)) {
                return res.status(400).json({ error: 'month and year are required when startDate/endDate not provided.' });
            }
            // Build month range in IST so leaveDates comparison is IST-consistent (no off-by-one at boundaries)
            const firstDayStr = `${year}-${String(month).padStart(2, '0')}-01`;
            startDate = startOfISTDay(parseISTDate(firstDayStr));
            const lastDay = new Date(year, month, 0).getDate();
            const lastDayStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            endDate = endOfISTDay(parseISTDate(lastDayStr));
        }

        const cacheKey = Number.isNaN(month) || Number.isNaN(year)
            ? `leave_counts:${startDate.getTime()}:${endDate.getTime()}:${role}:${leaveTypeFilter || 'all'}`
            : `leave_counts:${month}:${year}:${role}:${leaveTypeFilter || 'all'}`;
        const cached = cacheService.getLeaveCountsAnalytics(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const roleMatch = role === 'All'
            ? { 'employeeData.role': { $in: ['Employee', 'Intern'] }, 'employeeData.isActive': true }
            : { 'employeeData.role': role, 'employeeData.isActive': true };

        const pipeline = [
            { $match: { requestType: { $ne: 'YEAR_END' } } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'employee',
                    foreignField: '_id',
                    as: 'employeeData'
                }
            },
            { $unwind: '$employeeData' },
            { $match: roleMatch },
            {
                $addFields: {
                    daysInRange: {
                        $size: {
                            $filter: {
                                input: '$leaveDates',
                                as: 'd',
                                cond: {
                                    $and: [
                                        { $gte: ['$$d', startDate] },
                                        { $lte: ['$$d', endDate] }
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            { $match: { daysInRange: { $gt: 0 } } }
        ];

        if (leaveTypeFilter) {
            pipeline.push({ $match: { requestType: leaveTypeFilter } });
        }

        pipeline.push(
            {
                $addFields: {
                    effectiveDays: {
                        $cond: [
                            { $eq: ['$leaveType', 'Full Day'] },
                            '$daysInRange',
                            { $multiply: ['$daysInRange', 0.5] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: { employee: '$employee', requestType: '$requestType' },
                    leaveApplied: { $sum: 1 },
                    leaveApproved: {
                        $sum: { $cond: [{ $eq: ['$status', 'Approved'] }, 1, 0] }
                    },
                    totalDays: { $sum: '$effectiveDays' }
                }
            },
            {
                $group: {
                    _id: '$_id.employee',
                    leaveApplied: { $sum: '$leaveApplied' },
                    leaveApproved: { $sum: '$leaveApproved' },
                    totalLeaveDays: { $sum: '$totalDays' },
                    leaveTypeBreakdown: {
                        $push: { requestType: '$_id.requestType', days: '$totalDays' }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    employeeId: '$_id',
                    fullName: '$user.fullName',
                    employeeCode: '$user.employeeCode',
                    leaveApplied: 1,
                    leaveApproved: 1,
                    totalLeaveDays: { $round: ['$totalLeaveDays', 1] },
                    leaveTypeBreakdown: 1
                }
            }
        );

        const result = await LeaveRequest.aggregate(pipeline);

        const payload = result.map((r) => ({
            employeeId: r.employeeId,
            fullName: r.fullName || '',
            employeeCode: r.employeeCode || '',
            leaveApplied: r.leaveApplied || 0,
            leaveApproved: r.leaveApproved || 0,
            totalLeaveDays: r.totalLeaveDays || 0,
            leaveTypeBreakdown: (r.leaveTypeBreakdown || []).reduce((acc, { requestType, days }) => {
                acc[requestType || 'Unknown'] = (acc[requestType || 'Unknown'] || 0) + days;
                return acc;
            }, {})
        }));

        cacheService.setLeaveCountsAnalytics(cacheKey, payload);
        res.json(payload);
    } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Error in leave analytics counts:', err);
        }
        res.status(500).json({ error: 'Failed to load leave counts. Please try again.' });
    }
});

// POST /api/admin/leaves
router.post('/leaves', [authenticateToken, isAdminOrHr], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { employee, requestType, leaveType, leaveDates, alternateDate, reason, medicalCertificate, adminOverrideReason, status, appliedDate } = req.body;
        
        if (!employee || !requestType || !leaveDates || !leaveType || !reason) {
            await session.abortTransaction();
            console.error("Missing required fields:", { employee, requestType, leaveDates, leaveType, reason });
            return res.status(400).json({ error: 'Missing required fields: employee, requestType, leaveDates, leaveType, reason.' });
        }

        const dateNorm = normalizeLeaveDatesForApi(leaveDates);
        if (!dateNorm.valid) {
            await session.abortTransaction();
            return res.status(400).json({ error: dateNorm.error });
        }
        let leaveDatesArray = dateNorm.dateStrings.map(d => parseISTDate(d));
        
        const employeeDoc = await User.findById(employee).session(session);
        if (!employeeDoc) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }
        
        const requestTypeNorm = LeavePolicyService.normalizeRequestType(requestType);
        
        // Apply Saturday clubbing for Planned Leave (Paid Leave) only.
        // Saturday is only clubbed when advance notice ≥ 30 days is met.
        // Casual, Sick, and LOP are never eligible for Saturday clubbing.
        if (requestTypeNorm === 'Planned') {
            // Use admin-provided appliedDate if present (for backdated admin entries), else today
            const leaveAppliedDate = appliedDate ? new Date(appliedDate) : new Date();
            const clubbedDates = LeavePolicyService.clubSaturdayInLeaveDates(
                employeeDoc,
                leaveDatesArray,
                requestTypeNorm,
                leaveAppliedDate
            );
            // Convert clubbed date strings back to Date objects
            leaveDatesArray = clubbedDates.map(d => parseISTDate(d));
        }
        
        const validation = await LeavePolicyService.validateRequest(
            employee,
            leaveDatesArray,
            requestTypeNorm,
            leaveType,
            adminOverrideReason || `Admin-applied leave by user ID: ${req.user.userId}`, // Auto-provide override for admin
            alternateDate ? parseISTDate(alternateDate) : null,
            { isAdminUpdate: true } // Flag to bypass advance notice checks for admin-created leaves
        );
        
        if (!validation.allowed && !adminOverrideReason) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: validation.reason || 'Leave request validation failed.',
                rule: validation.rule,
                errors: [validation.reason]
            });
        }
        
        // Validate appliedDate if provided
        let employeeAppliedDate = appliedDate ? new Date(appliedDate) : new Date();
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        if (employeeAppliedDate > today) {
            await session.abortTransaction();
            return res.status(400).json({ 
                error: 'Employee applied date cannot be in the future.',
                errors: ['Employee applied date cannot be in the future.']
            });
        }
        
        // Prepare leave request data (store normalized type for Comp-Off -> Compensatory)
        const leaveRequestData = {
            employee,
            requestType: requestTypeNorm,
            leaveType,
            leaveDates: leaveDatesArray,
            alternateDate: alternateDate ? parseISTDate(alternateDate) : null,
            reason,
            status: status || 'Pending',
            createdAt: employeeAppliedDate, // Set the employee applied date
            adminOverride: !!adminOverrideReason,
            overrideReason: adminOverrideReason || `Admin-applied leave by user ID: ${req.user.userId}`,
            overriddenBy: req.user.userId,
            overriddenAt: new Date()
        };
        
        // Add medical certificate for sick leave
        if (requestType === 'Sick' && medicalCertificate) {
            leaveRequestData.medicalCertificate = medicalCertificate;
        }
        
        const newRequest = await LeaveRequest.create([leaveRequestData], { session });
        const savedRequest = newRequest[0];
        
        // CRITICAL FIX: If status is Approved, update leave balance immediately
        if (savedRequest.status === 'Approved') {
            // Use working-day count only (exclude any auto-clubbed Saturdays/Sundays)
            const workingDayCount = countWorkingDaysInLeaveDates(savedRequest.leaveDates);
            const leaveDuration = workingDayCount * (savedRequest.leaveType === 'Full Day' ? 1 : 0.5);
            const leaveField = LeavePolicyService.getBalanceField(savedRequest.requestType);

            if (leaveField === 'backdated') {
                const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employeeDoc, leaveDuration);
                if (resolved.deduct === false) {
                    // No deduction (Intern/Probation)
                } else if (resolved.allowed === false) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: resolved.reason });
                } else if (resolved.allowed === true && resolved.deductions && resolved.deductions.length > 0) {
                    const conditions = { _id: employeeDoc._id };
                    resolved.deductions.forEach(({ field, amount }) => {
                        conditions[`leaveBalances.${field}`] = { $gte: amount };
                    });
                    const update = { $inc: {} };
                    resolved.deductions.forEach(({ field, amount }) => {
                        update.$inc[`leaveBalances.${field}`] = -amount;
                    });
                    const updated = await User.findOneAndUpdate(conditions, update, { session, new: true });
                    if (!updated) {
                        await session.abortTransaction();
                        return res.status(400).json({ error: 'Insufficient leave balance for backdated leave.' });
                    }
                    const sickD = resolved.deductions.find(d => d.field === 'sick');
                    const casualD = resolved.deductions.find(d => d.field === 'casual');
                    const backdatedSick = sickD ? sickD.amount : 0;
                    const backdatedCasual = casualD ? casualD.amount : 0;
                    await LeaveRequest.findByIdAndUpdate(savedRequest._id, {
                        backdatedSickDeducted: backdatedSick,
                        backdatedCasualDeducted: backdatedCasual
                    }, { session });
                    savedRequest.backdatedSickDeducted = backdatedSick;
                    savedRequest.backdatedCasualDeducted = backdatedCasual;
                }
            } else if (leaveField) {
                // CRITICAL FIX: Use atomic findOneAndUpdate instead of save() to prevent race conditions
                // This matches the PATCH endpoint pattern for consistency and reliability
                const updatePath = `leaveBalances.${leaveField}`;
                
                // Get current balance from database (not just in-memory doc) to ensure accuracy
                const currentBalanceDoc = await User.findById(employeeDoc._id).select(`leaveBalances.${leaveField}`).session(session).lean();
                const currentBalance = currentBalanceDoc?.leaveBalances?.[leaveField];
                
                // Handle undefined/null balance fields - MongoDB $gte doesn't match these
                // If field doesn't exist or is null, treat as 0
                const effectiveBalance = (currentBalance === undefined || currentBalance === null) ? 0 : currentBalance;
                
                // Check if balance is sufficient BEFORE attempting atomic update
                if (effectiveBalance < leaveDuration) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: `Insufficient leave balance at approval time. Required ${leaveDuration} day(s), available ${effectiveBalance}.` 
                    });
                }
                
                // If field doesn't exist or is null, initialize it first
                if (currentBalance === undefined || currentBalance === null) {
                    await User.findByIdAndUpdate(
                        employeeDoc._id,
                        { $set: { [updatePath]: 0 } },
                        { session }
                    );
                }
                
                // Now perform atomic update with condition check
                // MongoDB $gte will now match since field exists
                const updated = await User.findOneAndUpdate(
                    { 
                        _id: employeeDoc._id,
                        [updatePath]: { $gte: leaveDuration }
                    },
                    { $inc: { [updatePath]: -leaveDuration } },
                    { session, new: true }
                );
                
                if (!updated) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: `Insufficient leave balance at approval time (or concurrent update). Required ${leaveDuration} day(s), available ${effectiveBalance}.` 
                    });
                }
                
                const newBalance = updated.leaveBalances?.[leaveField] ?? 0;
                if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_BALANCE] Admin POST: Deducted ${leaveDuration} ${leaveField} days. Old balance: ${effectiveBalance}, New balance: ${newBalance}`);
                
                // Update employeeDoc reference for potential use later in transaction
                if (!employeeDoc.leaveBalances) {
                    employeeDoc.leaveBalances = {};
                }
                employeeDoc.leaveBalances[leaveField] = newBalance;
            }

            // Sync attendance
            const { syncAttendanceOnLeaveApproval } = require('../../services/leaveAttendanceSyncService');
            await syncAttendanceOnLeaveApproval(savedRequest, session);
        }
        
        await session.commitTransaction();

        // Invalidate dashboard and pending-leaves cache; invalidate leave analytics so Leave Count tabs see fresh data
        const cacheService = require('../../services/cacheService');
        const todayIST = getTodayISTKey();
        cacheService.invalidatePendingLeaves(todayIST);
        cacheService.invalidateDashboard(todayIST);
        cacheService.invalidateLeaveAnalytics();
        
        // Send notifications
        const NewNotificationService = require('../../services/NewNotificationService');
        if (savedRequest.status === 'Approved') {
            NewNotificationService.notifyLeaveResponse(employee, employeeDoc.fullName, 'Approved', requestType, null)
                .catch(err => console.error('Error sending leave approval notification:', err));
        }
        
        res.status(201).json({ 
            message: 'Leave request created successfully.', 
            request: savedRequest 
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error creating leave request by admin:', error);
        res.status(500).json({ error: error.message || 'Failed to create leave request.' });
    } finally {
        session.endSession();
    }
});

// PUT /leaves/:id
router.put('/leaves/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Get the original leave request to compare changes
        const originalRequest = await LeaveRequest.findById(req.params.id).session(session);
        if (!originalRequest) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Helper: normalize dates to YYYY-MM-DD in IST (single source of truth for date comparison)
        const normalizeDate = (date) => {
            const dateObj = date instanceof Date ? date : (typeof date === 'string' ? parseISTDate(date) : new Date(date));
            return getISTDateString(dateObj);
        };

        // Check if leave dates or status changed
        const datesChanged = req.body.leaveDates &&
            JSON.stringify((req.body.leaveDates || []).map(normalizeDate).sort()) !==
            JSON.stringify((originalRequest.leaveDates || []).map(normalizeDate).sort());

        const statusChanged = req.body.status && req.body.status !== originalRequest.status;
        const requestTypeChanged = req.body.requestType && req.body.requestType !== originalRequest.requestType;
        const leaveTypeChanged = req.body.leaveType && req.body.leaveType !== originalRequest.leaveType;
        const wasApproved = originalRequest.status === 'Approved';
        const willBeApproved = req.body.status === 'Approved' || (!req.body.status && wasApproved);
        const allocationsInBody = req.body.dayTypeAllocations !== undefined;

        const employee = await User.findById(originalRequest.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Normalize leaveDates at API boundary (YYYY-MM-DD only)
        // Only allow specific fields to be updated
        const allowedUpdateFields = ['employee', 'requestType', 'leaveType', 'leaveDates', 'alternateDate', 'reason', 'status', 'createdAt', 'dayTypeAllocations'];
        let bodyToApply = {};
        
        // Copy only allowed fields from req.body
        allowedUpdateFields.forEach(field => {
            if (req.body[field] !== undefined) {
                bodyToApply[field] = req.body[field];
            }
        });
        
        // Normalize leaveDates
        if (bodyToApply.leaveDates && Array.isArray(bodyToApply.leaveDates)) {
            const dateNorm = normalizeLeaveDatesForApi(bodyToApply.leaveDates);
            if (!dateNorm.valid) {
                await session.abortTransaction();
                return res.status(400).json({ error: dateNorm.error });
            }
            bodyToApply.leaveDates = dateNorm.dateStrings.map(d => parseISTDate(d));
        }
        
        // Normalize alternateDate if provided (can be null)
        if (bodyToApply.alternateDate !== undefined && bodyToApply.alternateDate !== null) {
            bodyToApply.alternateDate = parseISTDate(bodyToApply.alternateDate);
        } else if (bodyToApply.alternateDate === null) {
            bodyToApply.alternateDate = null;
        }
        
        if (allocationsInBody) {
            const effectiveType = bodyToApply.requestType ?? originalRequest.requestType;
            if (effectiveType !== 'Loss of Pay') {
                await session.abortTransaction();
                return res.status(400).json({ error: 'Day allocations apply only to Loss of Pay requests.' });
            }
            const tempForValidation = {
                ...originalRequest.toObject(),
                leaveDates: bodyToApply.leaveDates ?? originalRequest.leaveDates,
                requestType: 'Loss of Pay',
            };
            const allocValidation = validateDayAllocations(tempForValidation, req.body.dayTypeAllocations);
            if (!allocValidation.valid) {
                await session.abortTransaction();
                return res.status(400).json({ error: allocValidation.error });
            }
            bodyToApply.dayTypeAllocations = allocValidation.allocations;
            bodyToApply.dayAllocationsUpdatedBy = req.user.userId;
            bodyToApply.dayAllocationsUpdatedAt = new Date();
        }

        // Handle createdAt (applied date) update - only allow admin to update this field
        let createdAtToUpdate = null;
        if (bodyToApply.createdAt) {
            // Parse the ISO string to Date object
            const appliedDate = new Date(bodyToApply.createdAt);
            if (isNaN(appliedDate.getTime())) {
                await session.abortTransaction();
                return res.status(400).json({ error: 'Invalid applied date format.' });
            }
            createdAtToUpdate = appliedDate;
            // Remove createdAt from bodyToApply as we'll update it separately
            delete bodyToApply.createdAt;
        }

        // Re-run policy when result would be Approved and dates/type/status changed (allow admin override)
        if (willBeApproved && (datesChanged || requestTypeChanged || leaveTypeChanged || statusChanged)) {
            const adminPayload = {
                leaveDates: bodyToApply.leaveDates ?? originalRequest.leaveDates,
                requestType: bodyToApply.requestType ?? originalRequest.requestType,
                leaveType: bodyToApply.leaveType ?? originalRequest.leaveType,
                status: bodyToApply.status ?? originalRequest.status,
                alternateDate: bodyToApply.alternateDate ?? originalRequest.alternateDate,
                // Include createdAt if it was updated (for advance notice calculation)
                createdAt: createdAtToUpdate || originalRequest.createdAt
            };
            const policyResult = await LeavePolicyService.validateAdminUpdate(
                originalRequest,
                adminPayload,
                employee,
                { 
                    adminOverrideReason: bodyToApply.overrideReason || bodyToApply.adminOverrideReason || 'Admin update',
                    isAdminUpdate: true // Flag to bypass advance notice checks
                }
            );
            if (!policyResult.allowed) {
                await session.abortTransaction();
                return res.status(400).json({ error: policyResult.reason });
            }
        }

        // Update the leave request
        const updatedRequest = await LeaveRequest.findByIdAndUpdate(
            req.params.id,
            bodyToApply,
            { new: true, session }
        );

        if (!updatedRequest) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Update createdAt separately if provided (Mongoose timestamps don't allow direct update)
        if (createdAtToUpdate) {
            await LeaveRequest.findByIdAndUpdate(
                req.params.id,
                { $set: { createdAt: createdAtToUpdate } },
                { session }
            );
            // Update the local object to reflect the change
            updatedRequest.createdAt = createdAtToUpdate;
        }

        // CRITICAL FIX: Handle balance updates when requestType, leaveType, or duration changes
        // Use working-day count only (exclude any auto-clubbed Saturdays/Sundays)
        const oldWorkingDayCount = countWorkingDaysInLeaveDates(originalRequest.leaveDates);
        const newWorkingDayCount = countWorkingDaysInLeaveDates(updatedRequest.leaveDates);
        const oldLeaveDuration = oldWorkingDayCount * (originalRequest.leaveType === 'Full Day' ? 1 : 0.5);
        const newLeaveDuration = newWorkingDayCount * (updatedRequest.leaveType === 'Full Day' ? 1 : 0.5);
        const durationChanged = newLeaveDuration !== oldLeaveDuration;

        const oldReqTypeNorm = LeavePolicyService.normalizeRequestType(originalRequest.requestType);
        const newReqTypeNorm = LeavePolicyService.normalizeRequestType(updatedRequest.requestType);
        const oldLeaveField = LeavePolicyService.getBalanceField(oldReqTypeNorm);
        const newLeaveField = LeavePolicyService.getBalanceField(newReqTypeNorm);

        const allocationsChanged = allocationsInBody && JSON.stringify(
            (originalRequest.dayTypeAllocations || []).map((a) => ({
                d: getISTDateString(a.date),
                t: a.requestType,
            }))
        ) !== JSON.stringify(
            (bodyToApply.dayTypeAllocations || []).map((a) => ({
                d: getISTDateString(a.date),
                t: a.requestType,
            }))
        );

        // Status transition balance (e.g. Approved → Rejected: restore balances)
        if (statusChanged && wasApproved !== willBeApproved) {
            const balanceResult = await applyBalanceOnStatusChange(
                originalRequest,
                employee,
                originalRequest.status,
                updatedRequest.status,
                session
            );
            if (!balanceResult.ok) {
                await session.abortTransaction();
                return res.status(400).json({ error: balanceResult.error });
            }
        } else if (wasApproved && willBeApproved && allocationsChanged && updatedRequest.requestType === 'Loss of Pay') {
            const balanceResult = await reconcileApprovedDayAllocations(
                employee._id,
                updatedRequest,
                originalRequest.dayTypeAllocations,
                bodyToApply.dayTypeAllocations,
                session
            );
            if (!balanceResult.ok) {
                await session.abortTransaction();
                return res.status(400).json({ error: balanceResult.error });
            }
        } else if (employee.leaveBalances && wasApproved && willBeApproved) {
            if (typeof employee.leaveBalances.sick === 'undefined') employee.leaveBalances.sick = 0;
            if (typeof employee.leaveBalances.casual === 'undefined') employee.leaveBalances.casual = 0;
            if (typeof employee.leaveBalances.paid === 'undefined') employee.leaveBalances.paid = 0;

            if (requestTypeChanged) {
                // Restore balance from old requestType
                if (oldLeaveField === 'backdated') {
                    const s = originalRequest.backdatedSickDeducted ?? 0;
                    const c = originalRequest.backdatedCasualDeducted ?? 0;
                    if (s > 0) employee.leaveBalances.sick += s;
                    if (c > 0) employee.leaveBalances.casual += c;
                } else if (oldLeaveField) {
                    employee.leaveBalances[oldLeaveField] += oldLeaveDuration;
                }

                // Deduct balance for new requestType
                if (newLeaveField === 'backdated') {
                    const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employee, newLeaveDuration);
                    if (resolved.allowed === true && resolved.deductions && resolved.deductions.length > 0) {
                        resolved.deductions.forEach(({ field, amount }) => {
                            employee.leaveBalances[field] = Math.max(0, (employee.leaveBalances[field] ?? 0) - amount);
                        });
                        const sickD = resolved.deductions.find(d => d.field === 'sick');
                        const casualD = resolved.deductions.find(d => d.field === 'casual');
                        updatedRequest.backdatedSickDeducted = sickD ? sickD.amount : 0;
                        updatedRequest.backdatedCasualDeducted = casualD ? casualD.amount : 0;
                        await LeaveRequest.findByIdAndUpdate(updatedRequest._id, {
                            backdatedSickDeducted: updatedRequest.backdatedSickDeducted,
                            backdatedCasualDeducted: updatedRequest.backdatedCasualDeducted
                        }, { session });
                    }
                } else if (newLeaveField) {
                    employee.leaveBalances[newLeaveField] = Math.max(0, (employee.leaveBalances[newLeaveField] ?? 0) - newLeaveDuration);
                }
            }
            // Scenario 2: Duration or leaveType changed (same requestType)
            else if ((durationChanged || leaveTypeChanged) && !requestTypeChanged) {
                const leaveField = newLeaveField;

                if (leaveField === 'backdated') {
                    // Restore old backdated amounts
                    const s = originalRequest.backdatedSickDeducted ?? 0;
                    const c = originalRequest.backdatedCasualDeducted ?? 0;
                    if (s > 0) employee.leaveBalances.sick += s;
                    if (c > 0) employee.leaveBalances.casual += c;
                    // Deduct new backdated amounts
                    const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employee, newLeaveDuration);
                    if (resolved.allowed === true && resolved.deductions && resolved.deductions.length > 0) {
                        resolved.deductions.forEach(({ field, amount }) => {
                            employee.leaveBalances[field] = Math.max(0, (employee.leaveBalances[field] ?? 0) - amount);
                        });
                        const sickD = resolved.deductions.find(d => d.field === 'sick');
                        const casualD = resolved.deductions.find(d => d.field === 'casual');
                        updatedRequest.backdatedSickDeducted = sickD ? sickD.amount : 0;
                        updatedRequest.backdatedCasualDeducted = casualD ? casualD.amount : 0;
                        await LeaveRequest.findByIdAndUpdate(updatedRequest._id, {
                            backdatedSickDeducted: updatedRequest.backdatedSickDeducted,
                            backdatedCasualDeducted: updatedRequest.backdatedCasualDeducted
                        }, { session });
                    }
                } else if (leaveField) {
                    employee.leaveBalances[leaveField] += oldLeaveDuration;
                    employee.leaveBalances[leaveField] = Math.max(0, employee.leaveBalances[leaveField] - newLeaveDuration);
                }
            }

            // Save employee if balance was updated
            if (requestTypeChanged || durationChanged || leaveTypeChanged) {
                await employee.save({ session });
            }
        }

        // If leave was approved and dates changed, or status changed to Approved, sync attendance
        if (wasApproved && datesChanged) {
            // Dates changed for an approved leave - need to sync attendance
            try {
                // Calculate which dates were removed and which were added using normalized dates
                const oldDates = (originalRequest.leaveDates || []).map(normalizeDate).sort();
                const newDates = (updatedRequest.leaveDates || []).map(normalizeDate).sort();
                const removedDates = oldDates.filter(d => !newDates.includes(d));
                const addedDates = newDates.filter(d => !oldDates.includes(d));

                if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Dates changed - Removed: ${removedDates.join(', ')}, Added: ${addedDates.join(', ')}`);
                if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Original dates: ${oldDates.join(', ')}, New dates: ${newDates.join(', ')}`);

                // Revert attendance for removed dates
                if (removedDates.length > 0) {
                    // Create a temporary leave request with only removed dates for reverting
                    // Convert normalized YYYY-MM-DD (IST) back to Date objects via parseISTDate
                    const tempLeaveForRevert = {
                        ...originalRequest.toObject(),
                        leaveDates: removedDates.map(d => parseISTDate(d))
                    };
                    if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Reverting attendance for dates: ${removedDates.join(', ')}`);
                    await syncAttendanceOnLeaveRejection(tempLeaveForRevert, session);
                }

                // Sync attendance for new dates (if still approved)
                if (willBeApproved && addedDates.length > 0) {
                    // Create a temporary leave request with only new dates for syncing
                    // Convert normalized YYYY-MM-DD (IST) back to Date objects via parseISTDate
                    const tempLeaveForSync = {
                        ...updatedRequest.toObject(),
                        leaveDates: addedDates.map(d => parseISTDate(d))
                    };
                    if (process.env.NODE_ENV !== 'production') console.log(`[LEAVE_UPDATE] Syncing attendance for dates: ${addedDates.join(', ')}`);
                    await syncAttendanceOnLeaveApproval(tempLeaveForSync, session);
                }
            } catch (syncError) {
                await session.abortTransaction();
                console.error('Error syncing attendance after leave date change:', syncError);
                throw new Error(`Failed to sync attendance records: ${syncError.message}`);
            }
        } else if (statusChanged) {
            // Status changed - sync attendance based on new status
            try {
                if (willBeApproved && !wasApproved) {
                    // Newly approved
                    await syncAttendanceOnLeaveApproval(updatedRequest, session);
                } else if (!willBeApproved && wasApproved) {
                    // Rejected/cancelled after approval
                    await syncAttendanceOnLeaveRejection(updatedRequest, session);
                }
            } catch (syncError) {
                await session.abortTransaction();
                console.error('Error syncing attendance after leave status change:', syncError);
                throw new Error(`Failed to sync attendance records: ${syncError.message}`);
            }
        } else if (willBeApproved && datesChanged) {
            // Leave is being approved with new dates
            try {
                await syncAttendanceOnLeaveApproval(updatedRequest, session);
            } catch (syncError) {
                await session.abortTransaction();
                console.error('Error syncing attendance for newly approved leave:', syncError);
                throw new Error(`Failed to sync attendance records: ${syncError.message}`);
            }
        }

        await session.commitTransaction();

        // Emit Socket.IO event to notify all clients about the leave update
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: updatedRequest._id,
                    employeeId: updatedRequest.employee,
                    leaveDates: updatedRequest.leaveDates,
                    status: updatedRequest.status,
                    requestType: updatedRequest.requestType,
                    datesChanged: datesChanged,
                    statusChanged: statusChanged,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Leave request updated${datesChanged ? ' (dates changed)' : ''}${statusChanged ? ` (status: ${updatedRequest.status})` : ''}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted leave_request_updated event for leave ${updatedRequest._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Invalidate dashboard and pending-leaves cache so dashboard shows fresh data
        const cacheServicePut = require('../../services/cacheService');
        const todayIST = getTodayISTKey();
        cacheServicePut.invalidatePendingLeaves(todayIST);
        cacheServicePut.invalidateDashboard(todayIST);
        cacheServicePut.invalidateLeaveAnalytics();

        const employeeDoc = await User.findById(updatedRequest.employee).lean();
        if (employeeDoc) {
            if (statusChanged && wasApproved && !willBeApproved) {
                const action = updatedRequest.status === 'Rejected' ? 'rejected' : 'revoked';
                NewNotificationService.notifyLeaveReverted(
                    updatedRequest.employee,
                    employeeDoc.fullName,
                    updatedRequest.requestType,
                    action,
                    null,
                    updatedRequest._id.toString()
                ).catch((err) => console.error('Error sending leave revert notification:', err));
            } else if (wasApproved && willBeApproved && (datesChanged || requestTypeChanged || allocationsChanged)) {
                NewNotificationService.notifyLeaveReverted(
                    updatedRequest.employee,
                    employeeDoc.fullName,
                    updatedRequest.requestType,
                    'updated',
                    datesChanged ? 'Some leave dates or types were changed.' : 'Your leave details were updated.',
                    updatedRequest._id.toString()
                ).catch((err) => console.error('Error sending leave update notification:', err));
            } else if (statusChanged && !wasApproved && willBeApproved) {
                NewNotificationService.notifyLeaveResponse(
                    updatedRequest.employee,
                    employeeDoc.fullName,
                    'Approved',
                    updatedRequest.requestType,
                    null
                ).catch((err) => console.error('Error sending leave approval notification:', err));
            }
        }

        res.json({
            message: 'Request updated successfully.',
            request: updatedRequest,
            attendanceSynced: (wasApproved && datesChanged) || statusChanged || (willBeApproved && datesChanged)
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Error updating leave request by admin:', error);
        res.status(500).json({ error: error.message || 'Failed to update request.' });
    } finally {
        session.endSession();
    }
});

// DELETE /leaves/:id
router.delete('/leaves/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const deletedRequest = await LeaveRequest.findById(req.params.id).session(session);
        if (!deletedRequest) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }
        
        if (deletedRequest.status === 'Approved') {
            const employee = await User.findById(deletedRequest.employee).session(session);
            if (employee) {
                const balanceResult = await applyBalanceOnStatusChange(
                    deletedRequest,
                    employee,
                    'Approved',
                    'Rejected',
                    session
                );
                if (!balanceResult.ok) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: balanceResult.error });
                }
                await syncAttendanceOnLeaveRejection(deletedRequest, session);
            }
        }
        
        // Delete the leave request
        await LeaveRequest.findByIdAndDelete(req.params.id).session(session);
        
        await session.commitTransaction();

        // Invalidate dashboard and pending-leaves cache so dashboard shows fresh data
        const cacheServiceDel = require('../../services/cacheService');
        const todayISTDel = getTodayISTKey();
        cacheServiceDel.invalidatePendingLeaves(todayISTDel);
        cacheServiceDel.invalidateDashboard(todayISTDel);
        cacheServiceDel.invalidateLeaveAnalytics();

        // Emit Socket.IO event so admin attendance summary (and other clients) refetch and stop showing deleted leave
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: deletedRequest._id,
                    employeeId: deletedRequest.employee,
                    leaveDates: deletedRequest.leaveDates,
                    status: 'Deleted',
                    requestType: deletedRequest.requestType,
                    deleted: true,
                    timestamp: new Date().toISOString(),
                    message: 'Leave request deleted by Admin.'
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted leave_request_updated (deleted) for leave ${deletedRequest._id}, employee ${deletedRequest.employee}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event on leave delete:', socketError);
        }

        if (deletedRequest.status === 'Approved') {
            const employee = await User.findById(deletedRequest.employee);
            if (employee) {
                NewNotificationService.notifyLeaveReverted(
                    deletedRequest.employee,
                    employee.fullName,
                    deletedRequest.requestType,
                    'deleted',
                    'Your leave has been removed from the system.',
                    deletedRequest._id.toString()
                ).catch((err) => console.error('Error sending leave deletion notification:', err));
            }
        }
        
        res.status(204).send();
    } catch (error) {
        await session.abortTransaction();
        console.error('Error deleting leave request by admin:', error);
        res.status(500).json({ error: error.message || 'Failed to delete request.' });
    } finally {
        session.endSession();
    }
});

// GET /leaves/pending
router.get('/leaves/pending', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        // Exclude YEAR_END requests from normal pending requests
        const pendingRequests = await LeaveRequest.find({
            status: 'Pending',
            requestType: { $ne: 'YEAR_END' }
        })
            .populate('employee', 'fullName employeeCode')
            .sort({ createdAt: 1 })
            .lean();
        res.json(pendingRequests);
    } catch (error) {
        console.error('Error fetching pending leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests.' });
    }
});

// GET /leaves/employee/:id - Get leave requests for specific employee
router.get('/leaves/employee/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { id } = req.params;
        const { year } = req.query;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid employee ID.' });
        }

        // Build query
        const query = { employee: id };

        // Add year filter if provided
        if (year) {
            const startDate = new Date(year, 0, 1); // January 1st
            const endDate = new Date(year, 11, 31); // December 31st
            query.createdAt = { $gte: startDate, $lte: endDate };
        }

        const leaveRequests = await LeaveRequest.find(query)
            .populate('employee', 'fullName employeeCode')
            .sort({ createdAt: -1 })
            .lean();

        res.json(leaveRequests);
    } catch (error) {
        console.error('Error fetching employee leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch employee leave requests.' });
    }
});

// PATCH /leaves/:id/status
router.patch('/leaves/:id/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { status: newStatus, rejectionNotes, overrideReason } = req.body;

    if (!['Approved', 'Rejected'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await LeaveRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Request not found.' });
        }

        // Block YEAR_END requests from being processed through normal leave status endpoint
        if (request.requestType === 'YEAR_END') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'Year-End requests must be processed through the Year-End specific endpoint.' });
        }

        const oldStatus = request.status;
        const employee = await User.findById(request.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const newStatus = req.body.status;

        // CRITICAL: Validate Comp-Off attendance for past worked dates during approval
        if (newStatus === 'Approved' && request.requestType === 'Compensatory' && request.alternateDate) {
            const { startOfISTDay } = require('../../utils/istTime');
            const AttendanceLog = require('../../models/AttendanceLog');
            
            const workedDate = new Date(request.alternateDate);
            const today = startOfISTDay();
            
            // Only validate attendance if the worked date has passed
            if (workedDate <= today) {
                const year = workedDate.getFullYear();
                const month = String(workedDate.getMonth() + 1).padStart(2, '0');
                const day = String(workedDate.getDate()).padStart(2, '0');
                const workedDateString = `${year}-${month}-${day}`;
                
                const attendanceRecord = await AttendanceLog.findOne({
                    user: request.employee,
                    attendanceDate: workedDateString
                }).session(session);
                
                if (!attendanceRecord) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: 'Cannot approve Comp-Off: No attendance record found for the worked date. Employee must have clocked in on that day.',
                        rule: 'COMPOFF_NO_ATTENDANCE_RECORD'
                    });
                }
                
                if (!attendanceRecord.clockInTime) {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: 'Cannot approve Comp-Off: No clock-in time found for the worked date. Employee must have actually worked on that day.',
                        rule: 'COMPOFF_NO_CLOCK_IN'
                    });
                }
                
                if (attendanceRecord.attendanceStatus === 'Absent') {
                    await session.abortTransaction();
                    return res.status(400).json({ 
                        error: 'Cannot approve Comp-Off: Employee was marked absent on the worked date. Employee must have been present to claim Comp-Off.',
                        rule: 'COMPOFF_MARKED_ABSENT'
                    });
                }
                
                if (process.env.NODE_ENV !== 'production') console.log(`[Comp-Off Approval] Attendance validated for worked date ${workedDateString}`);
            } else {
                if (process.env.NODE_ENV !== 'production') console.log(`[Comp-Off Approval] Worked date ${workedDate.toISOString()} is in the future, skipping attendance validation`);
            }
        }

        // Idempotent: already approved — do not double-approve or deduct balance again
        if (newStatus === 'Approved' && oldStatus === 'Approved') {
            await session.abortTransaction();
            return res.json({ message: 'Request already approved.', request });
        }

        // Use working-day count only (exclude any auto-clubbed Saturdays/Sundays)
        const workingDayCount = countWorkingDaysInLeaveDates(request.leaveDates);
        const leaveDuration = workingDayCount * (request.leaveType === 'Full Day' ? 1 : 0.5);
        const requestTypeNormalized = LeavePolicyService.normalizeRequestType(request.requestType);
        const leaveField = LeavePolicyService.getBalanceField(requestTypeNormalized);

        if (oldStatus === 'Returned') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This request was returned to the employee for correction. Approve after they resubmit.' });
        }

        if (newStatus === 'Approved') {
            // CRITICAL FIX: If admin provides overrideReason, skip policy validations
            // Admin can approve at any time regardless of advance notice, weekday restrictions, etc.
            if (overrideReason) {
                // Only check balance sufficiency (cannot override insufficient balance without explicit handling)
                const approvalCheck = validateApprovalBalances(request, employee);
                if (!approvalCheck.allowed) {
                    // Allow admin to override balance check as well with explicit override
                    console.warn(`[Admin Override] Balance check failed but overridden: ${approvalCheck.reason}`);
                }
                
                // Set admin override flags
                request.adminOverride = true;
                request.overrideReason = overrideReason;
                request.overriddenBy = req.user.userId;
                request.overriddenAt = new Date();
            } else {
                // No override - run full validation
                // Re-validate approval: balance must be sufficient at approval time
                const approvalCheck = validateApprovalBalances(request, employee);
                if (!approvalCheck.allowed) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: approvalCheck.reason });
                }
                const adminOverrideReason = `Admin approval by user ID: ${req.user.userId}`;
                const policyCheck = await LeavePolicyService.validateRequest(
                    request.employee,
                    request.leaveDates,
                    requestTypeNormalized,
                    request.leaveType,
                    adminOverrideReason,
                    request.alternateDate,
                    { excludeRequestId: request._id }
                );
                if (!policyCheck.allowed) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: policyCheck.reason });
                }
                request.adminOverride = true;
                request.overrideReason = adminOverrideReason;
                request.overriddenBy = req.user.userId;
                request.overriddenAt = new Date();
            }
        }

        request.status = newStatus;
        request.approvedBy = req.user.userId;
        request.approvedAt = new Date();
        if (newStatus === 'Rejected' && rejectionNotes) {
            request.rejectionNotes = rejectionNotes;
        } else if (newStatus === 'Approved') {
            request.rejectionNotes = undefined;
            if (request.validationBlocked && overrideReason) {
                const { logAction } = require('../../services/auditLogger');
                await logAction({
                    action: 'LEAVE_OVERRIDE_ANTI_EXPLOITATION',
                    userId: req.user.userId.toString(),
                    details: {
                        leaveRequestId: id,
                        employeeId: request.employee.toString(),
                        blockedRules: request.blockedRules || [],
                        overrideReason: overrideReason,
                        timestamp: new Date().toISOString()
                    }
                });
            }
        }

        if (newStatus !== oldStatus) {
            const balanceResult = await applyBalanceOnStatusChange(request, employee, oldStatus, newStatus, session);
            if (!balanceResult.ok) {
                await session.abortTransaction();
                return res.status(400).json({ error: balanceResult.error });
            }
        }

        await request.save({ session });

        // PHASE 2: Sync attendance records with leave status change
        // This ensures Attendance is the single source of truth
        try {
            if (newStatus === 'Approved' && oldStatus !== 'Approved') {
                // Leave approved - create/update attendance records
                await syncAttendanceOnLeaveApproval(request, session);
            } else if (newStatus !== 'Approved' && oldStatus === 'Approved') {
                // Leave rejected/cancelled after approval - revert attendance records
                await syncAttendanceOnLeaveRejection(request, session);
            }
        } catch (syncError) {
            // If attendance sync fails, rollback entire transaction
            await session.abortTransaction();
            console.error('Error syncing attendance with leave status:', syncError);
            throw new Error(`Failed to sync attendance records: ${syncError.message}`);
        }

        await session.commitTransaction();

        if (oldStatus === 'Approved' && newStatus !== 'Approved') {
            NewNotificationService.notifyLeaveReverted(
                request.employee,
                employee.fullName,
                request.requestType,
                newStatus === 'Rejected' ? 'rejected' : 'revoked',
                request.rejectionNotes || null,
                request._id.toString()
            ).catch((err) => console.error('Error sending leave revert notification:', err));
        } else {
            NewNotificationService.notifyLeaveResponse(request.employee, employee.fullName, newStatus, request.requestType, request.rejectionNotes)
                .catch((err) => console.error('Error sending leave response notification:', err));
        }

        // Emit Socket.IO event to notify all clients about the leave status change
        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: request._id,
                    employeeId: request.employee,
                    leaveDates: request.leaveDates,
                    status: request.status,
                    requestType: request.requestType,
                    statusChanged: true,
                    oldStatus: oldStatus,
                    newStatus: newStatus,
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString(),
                    message: `Leave request ${newStatus.toLowerCase()}`
                });
                if (process.env.NODE_ENV !== 'production') console.log(`📡 Emitted leave_request_updated event for leave ${request._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        // Invalidate dashboard and pending-leaves cache so dashboard returns fresh data
        const cacheService = require('../../services/cacheService');
        const todayStr = getTodayISTKey();
        cacheService.invalidatePendingLeaves(todayStr);
        cacheService.invalidateDashboard(todayStr);
        cacheService.invalidateLeaveAnalytics();

        // Response (clockInConflicts not tracked by sync service; avoid undefined reference)
        const clockInConflicts = [];
        const response = {
            message: `Request has been ${newStatus.toLowerCase()}.`,
            request
        };
        if (clockInConflicts.length > 0) {
            response.warning = `Leave approved, but employee already clocked in on ${clockInConflicts.length} day(s): ${clockInConflicts.join(', ')}. Attendance records updated to Leave status.`;
        }
        res.json(response);
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error updating request status for ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to update request status.' });
    } finally {
        session.endSession();
    }
});

// PATCH /leaves/:id/return-for-correction — send back to employee with HR note (editable resubmit)
router.patch('/leaves/:id/return-for-correction', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { notes } = req.body;
    const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';

    if (!trimmedNotes) {
        return res.status(400).json({ error: 'A correction note for the employee is required.' });
    }

    try {
        const request = await LeaveRequest.findById(id);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.requestType === 'YEAR_END') {
            return res.status(400).json({ error: 'Year-End requests cannot be returned through this action.' });
        }
        if (request.status !== 'Pending') {
            return res.status(400).json({ error: 'Only pending requests can be returned for correction.' });
        }

        const employee = await User.findById(request.employee);
        if (!employee) return res.status(404).json({ error: 'Employee not found.' });

        request.status = 'Returned';
        request.hrCorrectionNotes = trimmedNotes;
        request.returnedBy = req.user.userId;
        request.returnedAt = new Date();
        request.rejectionNotes = undefined;
        await request.save();

        NewNotificationService.notifyLeaveReturnedForCorrection(
            request.employee,
            employee.fullName,
            request.requestType,
            trimmedNotes,
            request._id.toString()
        ).catch((err) => console.error('Error sending return-for-correction notification:', err));

        try {
            const { getIO } = require('../../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: request._id,
                    employeeId: request.employee,
                    status: request.status,
                    requestType: request.requestType,
                    hrCorrectionNotes: trimmedNotes,
                    timestamp: new Date().toISOString(),
                    message: 'Leave returned for correction',
                });
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
        }

        const cacheService = require('../../services/cacheService');
        const todayStr = getTodayISTKey();
        cacheService.invalidatePendingLeaves(todayStr);
        cacheService.invalidateDashboard(todayStr);
        cacheService.invalidateLeaveAnalytics();

        res.json({ message: 'Leave request returned to employee for correction.', request });
    } catch (error) {
        console.error(`Error returning leave ${id} for correction:`, error);
        res.status(500).json({ error: 'Failed to return leave for correction.' });
    }
});

// PATCH /leaves/:id/day-allocations — split LOP days into Planned / Casual / LOP
router.patch('/leaves/:id/day-allocations', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { allocations } = req.body;

    try {
        const request = await LeaveRequest.findById(id);
        if (!request) return res.status(404).json({ error: 'Request not found.' });
        if (request.requestType !== 'Loss of Pay') {
            return res.status(400).json({ error: 'Day allocations apply only to Loss of Pay requests.' });
        }
        if (!['Pending', 'Approved'].includes(request.status)) {
            return res.status(400).json({ error: 'Allocations can only be set on pending or approved requests.' });
        }
        const validation = validateDayAllocations(request, allocations);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const employee = await User.findById(request.employee).session(session);
            if (!employee) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'Employee not found.' });
            }

            if (request.status === 'Approved') {
                const balanceResult = await reconcileApprovedDayAllocations(
                    employee._id,
                    request,
                    request.dayTypeAllocations,
                    validation.allocations,
                    session
                );
                if (!balanceResult.ok) {
                    await session.abortTransaction();
                    return res.status(400).json({ error: balanceResult.error });
                }
            }

            request.dayTypeAllocations = validation.allocations;
            request.dayAllocationsUpdatedBy = req.user.userId;
            request.dayAllocationsUpdatedAt = new Date();
            await request.save({ session });
            await session.commitTransaction();
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }

        const cacheService = require('../../services/cacheService');
        cacheService.invalidateLeaveAnalytics();

        const { breakdown } = computeEffectiveDeductions(request);
        if (request.status === 'Approved') {
            const employee = await User.findById(request.employee);
            if (employee) {
                NewNotificationService.notifyLeaveReverted(
                    request.employee,
                    employee.fullName,
                    request.requestType,
                    'updated',
                    'HR adjusted how your LOP days apply to Planned/Casual balance.',
                    request._id.toString()
                ).catch((err) => console.error('Error sending allocation update notification:', err));
            }
        }
        res.json({
            message: 'Day allocations saved.',
            request,
            effectiveBreakdown: breakdown,
        });
    } catch (error) {
        console.error(`Error saving day allocations for leave ${id}:`, error);
        res.status(500).json({ error: 'Failed to save day allocations.' });
    }
});

// @route   POST /api/admin/leaves/allocate
// @desc    Allocate leave balances to an employee for a year
// @access  Private (Admin/HR)
router.post('/leaves/allocate', [authenticateToken, isAdminOrHr], async (req, res) => {
    const {
        employeeId,
        year,
        sickLeaveEntitlement,
        casualLeaveEntitlement,
        paidLeaveEntitlement,
    } = req.body;

    if (!employeeId) {
        return res.status(400).json({ error: 'Employee ID is required.' });
    }

    try {
        const user = await User.findById(employeeId);
        if (!user) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // --- START OF FIX: Set balances and entitlements separately and correctly ---
        const sick = sickLeaveEntitlement || 0;
        const casual = casualLeaveEntitlement || 0;
        const paid = paidLeaveEntitlement || 0;

        // Entitlements represent the total for the year
        user.leaveEntitlements = {
            sick: sick,
            casual: casual,
            paid: paid,
        };

        // Balances represent the currently available leaves
        user.leaveBalances = {
            sick: sick,
            casual: casual,
            paid: paid,
        };
        // --- END OF FIX ---

        await user.save();

        res.status(200).json({
            message: 'Leave balances and entitlements allocated successfully.',
            user: {
                _id: user._id,
                fullName: user.fullName,
                leaveBalances: user.leaveBalances,
                leaveEntitlements: user.leaveEntitlements,
            }
        });
    } catch (error) {
        console.error('Error allocating leaves:', error);
        res.status(500).json({ error: 'Failed to allocate leaves.' });
    }
});

// @route   POST /api/admin/leaves/bulk-allocate
// @desc    Bulk allocate leave balances to multiple employees for a year
// @access  Private (Admin/HR)
router.post('/leaves/bulk-allocate', [authenticateToken, isAdminOrHr], async (req, res) => {
    const {
        employeeIds,
        year,
        sickLeaveEntitlement,
        casualLeaveEntitlement,
        paidLeaveEntitlement,
    } = req.body;

    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
        return res.status(400).json({ error: 'Employee IDs array is required and must not be empty.' });
    }

    const results = {
        successful: [],
        failed: []
    };

    try {
        const sick = sickLeaveEntitlement || 0;
        const casual = casualLeaveEntitlement || 0;
        const paid = paidLeaveEntitlement || 0;

        // PERFORMANCE FIX: Replaced N+1 loop (findById + save per employee) with a single
        // bulkWrite. For 50 employees this reduces ~100 DB round-trips to 2 (find + bulkWrite).
        const validIds = employeeIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        const invalidIds = employeeIds.filter(id => !mongoose.Types.ObjectId.isValid(id));

        // Track invalid IDs as failed
        invalidIds.forEach(id => {
            results.failed.push({ employeeId: id, error: 'Invalid employee ID format.' });
        });

        if (validIds.length > 0) {
            // Fetch all users in one query to verify they exist
            const users = await User.find({ _id: { $in: validIds } }).select('_id fullName employeeCode').lean();
            const foundIds = new Set(users.map(u => u._id.toString()));

            // Track users not found
            validIds.forEach(id => {
                if (!foundIds.has(id.toString())) {
                    results.failed.push({ employeeId: id, error: 'Employee not found.' });
                }
            });

            // Build bulkWrite operations for found users
            const bulkOps = users.map(u => ({
                updateOne: {
                    filter: { _id: u._id },
                    update: {
                        $set: {
                            leaveEntitlements: { sick, casual, paid },
                            leaveBalances: { sick, casual, paid }
                        }
                    }
                }
            }));

            if (bulkOps.length > 0) {
                await User.bulkWrite(bulkOps, { ordered: false });
                users.forEach(u => {
                    results.successful.push({
                        employeeId: u._id,
                        fullName: u.fullName,
                        employeeCode: u.employeeCode
                    });
                });
            }
        }

        res.status(200).json({
            message: `Bulk allocation completed: ${results.successful.length} successful, ${results.failed.length} failed.`,
            results
        });
    } catch (error) {
        console.error('Error in bulk allocating leaves:', error);
        res.status(500).json({ error: 'Failed to bulk allocate leaves.' });
    }
});


// --- YEAR-END LEAVE MANAGEMENT ROUTES ---

// GET /api/admin/leaves/year-end-requests
// Get all Year-End leave requests
router.get('/leaves/year-end-requests', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { requestType: 'YEAR_END' };

        // Filter by status if provided
        if (req.query.status) {
            query.status = req.query.status;
        }

        // Filter by year if provided
        if (req.query.year) {
            query.yearEndYear = parseInt(req.query.year);
        }

        const totalCount = await LeaveRequest.countDocuments(query);
        const requests = await LeaveRequest.find(query)
            .populate('employee', 'fullName employeeCode department designation')
            .populate('approvedBy', 'fullName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.json({
            requests,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit)
        });
    } catch (error) {
        console.error('Error fetching Year-End leave requests:', error);
        res.status(500).json({ error: 'Failed to fetch Year-End requests.' });
    }
});

// PATCH /api/admin/leaves/year-end/:id/status
// Approve or reject Year-End leave request
router.patch('/leaves/year-end/:id/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;
    const { status: newStatus, rejectionNotes } = req.body;

    if (!['Approved', 'Rejected'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status provided.' });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await LeaveRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Year-End request not found.' });
        }

        if (request.requestType !== 'YEAR_END') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This is not a Year-End leave request.' });
        }

        if (request.status !== 'Pending') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This request has already been processed.' });
        }

        // CRITICAL: Prevent double processing
        if (request.isProcessed === true) {
            await session.abortTransaction();
            return res.status(409).json({ error: 'This request has already been processed and cannot be modified.' });
        }

        const employee = await User.findById(request.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const oldStatus = request.status;
        const leaveType = request.yearEndLeaveType;
        const days = request.yearEndDays;
        const subType = request.yearEndSubType;

        // Map leaveType to balance field
        const balanceField = leaveType === 'Sick' ? 'sick' : leaveType === 'Casual' ? 'casual' : 'paid';

        if (newStatus === 'Approved') {
            // Only process if not already processed
            if (!request.isProcessed) {
                // CRITICAL YEAR-END ROLLOVER LOGIC:
                // Year-End request is for the CLOSING year (e.g., 2025)
                // The result MUST be applied to the NEXT year (e.g., 2026)
                const closingYear = request.yearEndYear; // e.g., 2025
                const targetYear = closingYear + 1; // e.g., 2026
                const currentDate = new Date();
                const currentYear = currentDate.getFullYear();
                const currentMonth = currentDate.getMonth(); // 0-11 (0 = January, 11 = December)

                // Determine if we're in the target year or later
                // If we're in December of closing year or January+ of target year, apply to target year
                const isInTargetYearOrLater = currentYear >= targetYear;
                const isInDecemberOfClosingYear = currentYear === closingYear && currentMonth === 11;

                if (subType === 'CARRY_FORWARD') {
                    // CARRY FORWARD: Add remaining days to NEXT year's opening balance
                    // Opening balance for target year = default entitlement for target year + carried forward days
                    const defaultEntitlementForTargetYear = employee.leaveEntitlements[balanceField] || 0;
                    const carriedForwardDays = days;

                    // Calculate the target year's opening balance
                    // This is what the employee will have from January 1st of target year
                    const targetYearOpeningBalance = defaultEntitlementForTargetYear + carriedForwardDays;

                    // Apply the carry forward to the balance
                    // If we're in the target year or later, set the balance to the target year opening balance
                    // If we're in December of closing year, prepare the balance for next year
                    if (isInTargetYearOrLater || isInDecemberOfClosingYear) {
                        // Set balance to target year opening balance (entitlement + carry forward)
                        employee.leaveBalances[balanceField] = targetYearOpeningBalance;
                    } else {
                        // If we're still earlier in the closing year, add carry forward to current balance
                        // This will be the balance when the new year starts
                        employee.leaveBalances[balanceField] = (employee.leaveBalances[balanceField] || 0) + carriedForwardDays;
                    }
                } else if (subType === 'ENCASH') {
                    // ENCASH: No balance change - leaves are encashed (paid out)
                    // The balance was already reduced when leaves were used during the closing year
                    // Encashment means the remaining balance is paid out, not carried forward
                    // The employee gets the monetary value, but no leave days are added to next year
                    // No balance update needed - the days are already deducted from closing year balance
                    // The encashment is tracked in the request record for audit purposes
                }
                // Mark as processed to prevent double credit
                request.isProcessed = true;
            }
        }
        // If rejected, no balance changes and no processing flag

        request.status = newStatus;
        request.approvedBy = req.user.userId;
        request.approvedAt = new Date();

        if (newStatus === 'Rejected' && rejectionNotes) {
            request.rejectionNotes = rejectionNotes;
        } else if (newStatus === 'Approved') {
            request.rejectionNotes = undefined;
        }

        await employee.save({ session });
        await request.save({ session });

        // PHASE 2: Year-End requests don't have specific leave dates, so no attendance sync needed
        // Year-End is about balance management, not daily attendance
        // However, if in the future Year-End requests include dates, sync logic would go here

        await session.commitTransaction();

        // Invalidate dashboard, pending-leaves, and leave analytics so Admin Leaves and dashboard show fresh data
        const cacheServiceYedPatch = require('../../services/cacheService');
        const todayISTYedPatch = getTodayISTKey();
        cacheServiceYedPatch.invalidatePendingLeaves(todayISTYedPatch);
        cacheServiceYedPatch.invalidateDashboard(todayISTYedPatch);
        cacheServiceYedPatch.invalidateLeaveAnalytics();

        // Send notification to employee
        const NewNotificationService = require('../../services/NewNotificationService');
        await NewNotificationService.notifyYearEndLeaveResponse(
            request.employee,
            employee.fullName,
            newStatus,
            leaveType,
            days,
            subType
        ).catch(err => console.error('Error sending Year-End response notification:', err));

        // Include year-to-year mapping information in response
        const closingYear = request.yearEndYear;
        const targetYear = closingYear + 1;

        res.json({
            message: `Year-End request has been ${newStatus.toLowerCase()}.`,
            request,
            yearMapping: {
                closingYear: closingYear,
                targetYear: targetYear,
                action: subType === 'CARRY_FORWARD'
                    ? `${days} ${leaveType} leaves carried forward from ${closingYear} → ${targetYear}`
                    : `${days} ${leaveType} leaves encashed for ${closingYear}`,
                affectedYear: targetYear
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error updating Year-End request status for ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to update Year-End request status.' });
    } finally {
        session.endSession();
    }
});

// DELETE /api/admin/leaves/year-end/:id
// Delete Year-End request (Pending or Approved with rollback)
router.delete('/leaves/year-end/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    const { id } = req.params;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const request = await LeaveRequest.findById(id).session(session);
        if (!request) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Year-End request not found.' });
        }

        if (request.requestType !== 'YEAR_END') {
            await session.abortTransaction();
            return res.status(400).json({ error: 'This is not a Year-End leave request.' });
        }

        // Block deletion of Rejected requests (they don't affect balances anyway)
        if (request.status === 'Rejected') {
            await session.abortTransaction();
            return res.status(403).json({
                error: 'Cannot delete a Rejected Year-End request.'
            });
        }

        const employee = await User.findById(request.employee).session(session);
        if (!employee) {
            await session.abortTransaction();
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Handle APPROVED requests with rollback
        if (request.status === 'Approved') {
            const leaveType = request.yearEndLeaveType;
            const days = request.yearEndDays;
            const subType = request.yearEndSubType;

            if (!leaveType || !days || !subType) {
                await session.abortTransaction();
                return res.status(400).json({
                    error: 'Invalid Year-End request data. Cannot perform rollback.'
                });
            }

            // Map leaveType to balance field
            const balanceField = leaveType === 'Sick' ? 'sick' : leaveType === 'Casual' ? 'casual' : 'paid';

            // Perform rollback based on action type
            // CRITICAL: Rollback must reverse the year-end action correctly
            // For CARRY_FORWARD: Balance was set to (defaultEntitlement + days)
            // Rollback: Set back to defaultEntitlement (remove carried forward days)
            // For ENCASH: No balance change was made (leaves were already used)
            // Rollback: No change needed (encashment doesn't affect balance)
            const defaultEntitlement = employee.leaveEntitlements[balanceField] || 0;

            if (subType === 'CARRY_FORWARD') {
                // Rollback: Remove the carried-forward days
                // The balance was set to: defaultEntitlement + days
                // Rollback to: defaultEntitlement (remove the carry forward)
                employee.leaveBalances[balanceField] = defaultEntitlement;
            } else if (subType === 'ENCASH') {
                // Rollback: No balance change needed for encashment
                // Encashment doesn't add to balance - it just pays out the remaining days
                // The balance was already reduced when leaves were used during the closing year
                // No rollback needed
            }

            await employee.save({ session });
        }
        // For PENDING requests, no balance changes needed

        // Store request data for notification before deletion
        const requestData = {
            employeeId: request.employee,
            employeeName: employee.fullName,
            leaveType: request.yearEndLeaveType,
            year: request.yearEndYear || new Date().getFullYear(),
            status: request.status
        };

        // Delete the request
        await LeaveRequest.findByIdAndDelete(id).session(session);

        await session.commitTransaction();

        // Invalidate dashboard and pending-leaves cache so dashboard shows fresh data
        const cacheServiceYed = require('../../services/cacheService');
        const todayISTYed = getTodayISTKey();
        cacheServiceYed.invalidatePendingLeaves(todayISTYed);
        cacheServiceYed.invalidateDashboard(todayISTYed);
        cacheServiceYed.invalidateLeaveAnalytics();

        // Send notification to employee (only for APPROVED requests that were rolled back)
        if (requestData.status === 'Approved') {
            const NewNotificationService = require('../../services/NewNotificationService');
            await NewNotificationService.createAndEmitNotification({
                message: `Your Year-End leave request for ${requestData.leaveType} (${requestData.year}) has been deleted by Admin. Leave balance changes have been reverted.`,
                userId: requestData.employeeId,
                userName: requestData.employeeName,
                type: 'leave_rejection',
                recipientType: 'user',
                category: 'leave',
                priority: 'high',
                navigationData: { page: '/leaves' },
                metadata: {
                    type: 'YEAR_END_LEAVE_DELETED',
                    leaveType: requestData.leaveType,
                    year: requestData.year
                }
            });
        }

        res.json({
            message: requestData.status === 'Approved'
                ? 'Year-End request deleted successfully. Leave balance changes have been reverted.'
                : 'Year-End request deleted successfully.',
            deletedRequest: {
                _id: id,
                employee: requestData.employeeId,
                yearEndLeaveType: requestData.leaveType,
                yearEndYear: requestData.year,
                status: requestData.status,
                rolledBack: requestData.status === 'Approved'
            }
        });
    } catch (error) {
        await session.abortTransaction();
        console.error(`Error deleting Year-End request for ID ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete Year-End request.' });
    } finally {
        session.endSession();
    }
});

// =================================================================
// HALF-DAY LEAVE AUTO-CONVERSION ENDPOINTS
// =================================================================

/**
 * POST /api/admin/leaves/run-halfday-validation
 * Manually trigger half-day leave auto-conversion for a specific date.
 * Used for testing, staging validation, and HR revalidation.
 * 
 * SAFETY: Requires Admin role and explicit date parameter
 */
router.post('/leaves/run-halfday-validation', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { date } = req.body;
        
        if (!date) {
            return res.status(400).json({
                error: 'Date is required (format: YYYY-MM-DD).'
            });
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }
        
        // Validate date is in the past
        const { parseISTDate, startOfISTDay } = require('../../utils/istTime');
        const targetDate = parseISTDate(date);
        const today = startOfISTDay(new Date());
        
        if (targetDate >= today) {
            return res.status(400).json({
                error: 'Target date must be in the past. Cannot convert leaves for current or future dates.'
            });
        }
        
        const { autoConvertHalfDayLeaves } = require('../../services/halfDayAutoConversionService');
        
        if (process.env.NODE_ENV !== 'production') console.log(`[Admin] Manual half-day conversion triggered by ${req.user.userId} for date: ${date}`);
        
        const result = await autoConvertHalfDayLeaves(date);
        
        // Invalidate cache after conversion
        const cacheService = require('../../services/cacheService');
        cacheService.invalidatePendingLeaves(date);
        cacheService.invalidateDashboard(date);
        cacheService.invalidateLeaveAnalytics();
        
        res.json({
            success: true,
            message: 'Half-day leave validation completed.',
            summary: {
                targetDate: result.targetDate,
                processed: result.processed,
                converted: result.converted,
                skipped: result.skipped,
                errors: result.errors
            },
            details: result.details
        });
        
    } catch (error) {
        console.error('[Admin] Error in manual half-day validation:', error);
        res.status(500).json({
            error: 'Failed to run half-day validation.',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/leaves/run-auto-revert-check
 * Manually trigger auto-revert check for incorrectly converted leaves.
 * Detects leaves that were converted to LOP but now have attendance data.
 * 
 * SAFETY: Requires Admin/HR role and explicit date parameter
 */
router.post('/leaves/run-auto-revert-check', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { date } = req.body;
        
        if (!date) {
            return res.status(400).json({
                error: 'Date is required (format: YYYY-MM-DD).'
            });
        }
        
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return res.status(400).json({
                error: 'Invalid date format. Use YYYY-MM-DD.'
            });
        }
        
        const { autoRevertIncorrectConversions } = require('../../services/halfDayAutoConversionService');
        
        if (process.env.NODE_ENV !== 'production') console.log(`[Admin] Manual auto-revert check triggered by ${req.user.userId} for date: ${date}`);
        
        const result = await autoRevertIncorrectConversions(date);
        
        // Invalidate cache after revert
        const cacheService = require('../../services/cacheService');
        cacheService.invalidatePendingLeaves(date);
        cacheService.invalidateDashboard(date);
        cacheService.invalidateLeaveAnalytics();
        
        res.json({
            success: true,
            message: 'Auto-revert check completed.',
            summary: {
                targetDate: result.targetDate,
                checked: result.checked,
                reverted: result.reverted,
                errors: result.errors
            },
            details: result.details
        });
        
    } catch (error) {
        console.error('[Admin] Error in auto-revert check:', error);
        res.status(500).json({
            error: 'Failed to run auto-revert check.',
            details: error.message
        });
    }
});

/**
 * POST /api/admin/leaves/revert-auto-conversion/:leaveId
 * Revert an auto-converted leave back to its original state.
 * Restores original leaveType/requestType, removes auto flags, resyncs attendance, logs revert event.
 * SAFETY: Requires Admin role, validates leave was auto-converted
 */
router.post('/leaves/revert-auto-conversion/:leaveId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { leaveId } = req.params;

        if (!leaveId) {
            return res.status(400).json({ error: 'Leave ID is required.' });
        }
        if (!mongoose.Types.ObjectId.isValid(leaveId)) {
            return res.status(400).json({ error: 'Invalid leave ID format.' });
        }

        const { revertAutoConversion } = require('../../services/halfDayAutoConversionService');
        const adminUserId = req.user.userId;

        const result = await revertAutoConversion(leaveId, adminUserId);

        res.json({
            success: result.success,
            message: result.message,
            leave: {
                _id: result.leave._id,
                leaveType: result.leave.leaveType,
                requestType: result.leave.requestType,
                autoConvertedToLOP: result.leave.autoConvertedToLOP,
            },
        });
    } catch (error) {
        if (error.message === 'Leave request not found') {
            return res.status(404).json({ error: 'Leave request not found.' });
        }
        if (error.message === 'Leave was not auto-converted') {
            return res.status(400).json({ error: 'Leave was not auto-converted. Cannot revert.' });
        }
        console.error('[Admin] Error reverting auto-conversion:', error);
        res.status(500).json({
            error: 'Failed to revert auto-conversion.',
            details: error.message,
        });
    }
});

/**
 * GET /api/admin/leaves/auto-conversion-log
 * Get history of auto-converted leaves for audit purposes.
 * 
 * Query params:
 * - startDate: YYYY-MM-DD (optional)
 * - endDate: YYYY-MM-DD (optional)
 * - page: number (default: 1)
 * - limit: number (default: 50)
 */
router.get('/leaves/auto-conversion-log', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const { startDate, endDate } = req.query;
        
        // Build query
        const query = { autoConvertedToLOP: true };
        
        if (startDate || endDate) {
            query.autoConversionDate = {};
            if (startDate) {
                const { parseISTDate, startOfISTDay } = require('../../utils/istTime');
                query.autoConversionDate.$gte = startOfISTDay(parseISTDate(startDate));
            }
            if (endDate) {
                const { parseISTDate, endOfISTDay } = require('../../utils/istTime');
                query.autoConversionDate.$lte = endOfISTDay(parseISTDate(endDate));
            }
        }
        
        // Fetch converted leaves with employee details
        const [conversions, totalCount] = await Promise.all([
            LeaveRequest.find(query)
                .populate('employee', 'fullName employeeCode email')
                .select('employee leaveType requestType leaveDates autoConversionDate autoConversionReason originalLeaveType originalRequestType reason')
                .sort({ autoConversionDate: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            LeaveRequest.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            conversions,
            pagination: {
                totalCount,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
                limit
            }
        });
        
    } catch (error) {
        console.error('[Admin] Error fetching auto-conversion log:', error);
        res.status(500).json({
            error: 'Failed to fetch auto-conversion log.',
            details: error.message
        });
    }
});

module.exports = router;
