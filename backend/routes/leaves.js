// backend/routes/leaves.js

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const LeaveRequest = require('../models/LeaveRequest');
const Holiday = require('../models/Holiday');
const LeaveYear = require('../models/LeaveYear');
const { sendEmail } = require('../services/mailService');
const Setting = require('../models/Setting');
const User = require('../models/User');
const NewNotificationService = require('../services/NewNotificationService');
const LeaveValidationService = require('../services/leaveValidationService');
const LeavePolicyService = require('../services/LeavePolicyService');
const uploadMedicalCertificate = require('../middleware/uploadMedicalCertificate');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { parseISTDate, formatISTDate, getTodayISTKey, normalizeLeaveDatesForApi } = require('../utils/istTime');
const requireLeavesAccess = require('../middleware/requireLeavesAccess');

router.use(authenticateToken);
router.use((req, res, next) => {
    if (req.path === '/holidays') {
        return next();
    }
    return requireLeavesAccess(req, res, next);
});


const formatLeaveDateRangeForEmail = (leaveDates) => {
    if (!leaveDates || leaveDates.length === 0) return 'N/A';
    const startDate = formatISTDate(parseISTDate(leaveDates[0]));
    if (leaveDates.length === 1) return startDate;
    const endDate = formatISTDate(parseISTDate(leaveDates[leaveDates.length - 1]));
    return `${startDate} to ${endDate}`;
};

const sendLeaveNotificationEmails = async (request, employee) => {
    try {
        let recipients = [];
        const hrEmailSetting = await Setting.findOne({ key: 'hrNotificationEmails' });

        if (hrEmailSetting && Array.isArray(hrEmailSetting.value) && hrEmailSetting.value.length > 0) {
            recipients = hrEmailSetting.value;
        } else if (process.env.HR_EMAILS) {
            recipients = process.env.HR_EMAILS.split(',').map(email => email.trim());
        }

        const dateRange = formatLeaveDateRangeForEmail(request.leaveDates);
        const reasonText = request.reason.replace(/\n/g, '<br>');

        if (recipients.length > 0) {
            const hrSubject = `Leave Request: ${employee.fullName} (${request.requestType}) for ${dateRange}`;
            const hrHtml = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #D32F2F; color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px;">New Leave Request</h1>
                    </div>
                    <div style="padding: 20px;">
                        <p>A new leave request has been submitted by an employee. Please review it in the admin portal.</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                            <tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Employee:</td><td style="padding: 10px; border: 1px solid #eee;">${employee.fullName} (${employee.employeeCode})</td></tr>
                            <tr><td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Request Type:</td><td style="padding: 10px; border: 1px solid #eee;">${request.requestType}</td></tr>
                            <tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Date(s):</td><td style="padding: 10px; border: 1px solid #eee;">${dateRange}</td></tr>
                        </table>
                        <div style="margin-top: 20px;">
                            <strong style="color: #333;">Reason Provided:</strong>
                            <p style="padding: 15px; background-color: #f9f9f9; border-left: 4px solid #D32F2F; margin: 10px 0 0 0;">${reasonText}</p>
                        </div>
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="${process.env.FRONTEND_URL || 'https://attendance.bylinelms.com'}/admin/leaves" style="background-color: #D32F2F; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Review Request</a>
                        </div>
                    </div>
                    <div style="background-color: #f2f2f2; padding: 10px; text-align: center; font-size: 12px; color: #777;">
                        This is an automated notification from the AMS Portal.
                    </div>
                </div>`;
            await sendEmail({ to: recipients.join(','), subject: hrSubject, html: hrHtml, isHREmail: true });
        }

        const userSubject = `Your Leave Request for ${dateRange} has been submitted`;
        const userHtml = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #2c3e50; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">Request Received</h1>
                </div>
                <div style="padding: 20px;">
                    <p>Hello ${employee.fullName},</p>
                    <p>This is a confirmation that your leave request has been successfully submitted and is now pending approval. You will receive another notification once it has been reviewed.</p>
                    <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">Your Request Summary:</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Request Type:</td><td style="padding: 10px; border: 1px solid #eee;">${request.requestType}</td></tr>
                        <tr><td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Date(s):</td><td style="padding: 10px; border: 1px solid #eee;">${dateRange}</td></tr>
                        <tr style="background-color: #f9f9f9;"><td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Status:</td><td style="padding: 10px; border: 1px solid #eee;">Pending</td></tr>
                    </table>
                </div>
                <div style="background-color: #f2f2f2; padding: 10px; text-align: center; font-size: 12px; color: #777;">
                    This is an automated notification. Please do not reply to this email.
                </div>
            </div>`;
        await sendEmail({ to: employee.email, subject: userSubject, html: userHtml });
    } catch (error) {
        console.error(`[Email Service] Failed to send emails for leave request ${request._id}:`, error);
    }
};

// GET /api/leaves/my-leave-balances
router.get('/my-leave-balances', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('leaveBalances');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(user.leaveBalances);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leave balances.' });
    }
});

// GET /api/leaves/allowed-types
// Get allowed leave types based on employee status
router.get('/allowed-types', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('employmentStatus');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const allowedLeaveTypes = getAllowedLeaveTypes(user.employmentStatus);
        
        res.json({ 
            allowedLeaveTypes,
            employmentStatus: user.employmentStatus 
        });
    } catch (error) {
        console.error('Error fetching allowed leave types:', error);
        res.status(500).json({ error: 'Failed to fetch allowed leave types.' });
    }
});

/**
 * Get allowed leave types based on employment status
 * @param {string} employmentStatus - Employee's employment status
 * @returns {Array} Array of allowed leave types
 */
// Single source aligned with frontend leaveTypePolicy; Backdated Leave for Permanent only.
function getAllowedLeaveTypes(employmentStatus) {
    if (employmentStatus === 'Permanent') {
        return ['Planned', 'Sick', 'Casual', 'Loss of Pay', 'Compensatory', 'Backdated Leave'];
    }
    if (employmentStatus === 'Probation' || employmentStatus === 'Intern') {
        return ['Loss of Pay', 'Compensatory'];
    }
    return ['Loss of Pay'];
}

// GET /api/leaves/holidays
router.get('/holidays', authenticateToken, async (req, res) => {
    try {
        // Get all holidays and sort: valid dates first (ASC), then tentative holidays at bottom (alphabetically)
        const holidays = await Holiday.find().lean();
        // Manual sort to ensure tentative holidays are at bottom
        const sortedHolidays = holidays.sort((a, b) => {
            const aIsTentative = !a.date || a.isTentative;
            const bIsTentative = !b.date || b.isTentative;
            
            // If both are tentative, sort alphabetically by name
            if (aIsTentative && bIsTentative) {
                return a.name.localeCompare(b.name);
            }
            // If only a is tentative, put it at bottom
            if (aIsTentative) return 1;
            // If only b is tentative, put it at bottom
            if (bIsTentative) return -1;
            // Both have dates, sort by date
            return new Date(a.date) - new Date(b.date);
        });
        res.json(sortedHolidays);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch holidays.' });
    }
});

// POST /api/leaves/check-eligibility
// Check leave eligibility before applying (for frontend validation)
// Accept only YYYY-MM-DD for leaveDates at API boundary.
router.post('/check-eligibility', authenticateToken, async (req, res) => {
    const { requestType, leaveType, leaveDates, medicalCertificate, alternateDate } = req.body;
    const { userId } = req.user;

    if (!requestType || !leaveDates || leaveDates.length === 0 || !leaveType) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const dateNorm = normalizeLeaveDatesForApi(leaveDates);
    if (!dateNorm.valid) {
        return res.status(400).json({ error: dateNorm.error });
    }

    try {
        const employee = await User.findById(userId);
        if (!employee) return res.status(404).json({ error: 'Employee not found.' });

        const validation = await LeaveValidationService.validateLeaveRequest(
            employee,
            requestType,
            dateNorm.dateStrings,
            leaveType,
            medicalCertificate,
            alternateDate,
            {},
            req.body.reason
        );

        res.json({
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            ...(validation.halfYearPeriod && { halfYearPeriod: validation.halfYearPeriod }),
            ...(validation.availableDays !== undefined && { availableDays: validation.availableDays }),
            ...(validation.usedDays !== undefined && { usedDays: validation.usedDays }),
            // Include monthly limit info for frontend warnings
            ...(validation.alreadyUsed !== undefined && { alreadyUsed: validation.alreadyUsed }),
            ...(validation.requestedDays !== undefined && { requestedDays: validation.requestedDays }),
            ...(validation.remainingDays !== undefined && { remainingDays: validation.remainingDays }),
            ...(validation.totalAfterRequest !== undefined && { totalAfterRequest: validation.totalAfterRequest })
        });
    } catch (error) {
        console.error('Error checking leave eligibility:', error);
        res.status(500).json({ error: 'Internal server error while checking eligibility.' });
    }
});

// POST /api/leaves/request
// Accept only YYYY-MM-DD for leaveDates. All leave calendar dates normalized to IST.
router.post('/request', authenticateToken, async (req, res) => {
    const { requestType, leaveType, leaveDates, alternateDate, reason, medicalCertificate } = req.body;
    const { userId } = req.user;

    if (!requestType || !leaveDates || leaveDates.length === 0 || !reason || !leaveType) {
        return res.status(400).json({ error: 'Missing required fields for the request.' });
    }
    if (requestType === 'Compensatory' && !alternateDate) {
        return res.status(400).json({ error: 'Alternate date is required for a compensatory request.' });
    }

    const dateNorm = normalizeLeaveDatesForApi(leaveDates);
    if (!dateNorm.valid) {
        return res.status(400).json({ error: dateNorm.error });
    }

    try {
        const employee = await User.findById(userId);
        if (!employee) return res.status(404).json({ error: 'Employee not found.' });

        const validation = await LeaveValidationService.validateLeaveRequest(
            employee,
            requestType,
            dateNorm.dateStrings,
            leaveType,
            medicalCertificate,
            alternateDate,
            {},
            reason
        );

        if (!validation.valid) {
            return res.status(400).json({
                error: validation.errors.join(' '),
                errors: validation.errors,
                warnings: validation.warnings || []
            });
        }

        if (validation.warnings && validation.warnings.length > 0) {
            console.log(`Leave request warnings for user ${userId}:`, validation.warnings);
        }

        const { startOfISTDay } = require('../utils/istTime');
        // Note: Saturday clubbing is now handled in validateApply, so we use the dates from validation
        // But we need to get the clubbed dates for saving. Let's club again here to ensure consistency.
        const finalRequestType = requestType === 'Backdate' ? 'Backdated Leave' : requestType;
        let leaveDatesArray = dateNorm.dateStrings.map(d => parseISTDate(d));
        
        // Apply Saturday clubbing for Planned Leave (Paid Leave) only.
        // Saturday is only clubbed when advance notice ≥ 30 days is met.
        // Casual, Sick, and LOP are never eligible for Saturday clubbing.
        if (finalRequestType === 'Planned') {
            const clubbedDates = LeavePolicyService.clubSaturdayInLeaveDates(
                employee,
                leaveDatesArray,
                finalRequestType,
                new Date()   // appliedDate = today (employee-apply flow)
            );
            // Convert clubbed date strings back to Date objects
            leaveDatesArray = clubbedDates.map(d => parseISTDate(d));
        }
        
        const today = startOfISTDay();
        const firstLeaveDate = startOfISTDay(leaveDatesArray[0]);
        const isBackdated = firstLeaveDate < today;

        // Prepare leave request data
        const leaveRequestData = {
            employee: userId,
            requestType: finalRequestType,
            leaveType,
            leaveDates: leaveDatesArray,
            alternateDate: alternateDate ? parseISTDate(alternateDate) : null,
            reason,
            isBackdated,
        };

        // Add medical certificate and proof status for sick leave
        if (requestType === 'Sick') {
            if (medicalCertificate) {
                leaveRequestData.medicalCertificate = medicalCertificate;
                leaveRequestData.medicalCertificateUploadedAt = new Date();
            }
            // Medical proof status fields are set by validateApply in LeavePolicyService
            if (validation.medicalProofStatus) {
                leaveRequestData.medicalProofStatus = validation.medicalProofStatus;
                leaveRequestData.medicalProofRequired = validation.medicalProofRequired || false;
                leaveRequestData.medicalProofDeadline = validation.medicalProofDeadline || null;
            }
            leaveRequestData.appliedAfterReturn = validation.appliedAfterReturn || false;
        }

        // Add half-year period for planned leave
        if (requestType === 'Planned' && validation.halfYearPeriod) {
            leaveRequestData.halfYearPeriod = validation.halfYearPeriod;
        }

        const newRequest = await LeaveRequest.create(leaveRequestData);

        // Invalidate pending-leaves cache so admin dashboard shows new request (IST date for cache key)
        try {
            const cacheService = require('../services/cacheService');
            cacheService.invalidatePendingLeaves(getTodayISTKey());
            cacheService.invalidateLeaveAnalytics();
        } catch (e) {
            // Cache invalidation must not break leave creation
        }
        
        // --- NOTIFICATIONS ---
        // Asynchronously send emails
        sendLeaveNotificationEmails(newRequest, employee)
            .catch(err => console.error('Error in sendLeaveNotificationEmails:', err));
        
        // Send real-time notifications via socket
        // Use the saved request's leaveDates to ensure consistency with database values
        // Format dates consistently using IST utilities
        const savedLeaveDates = newRequest.leaveDates || leaveDatesArray;
        if (!savedLeaveDates || savedLeaveDates.length === 0) {
            console.error('Error: No leave dates found in saved request for notification');
            return;
        }
        
        const startDate = formatISTDate(parseISTDate(savedLeaveDates[0]));
        const endDate = savedLeaveDates.length === 1 
            ? startDate 
            : formatISTDate(parseISTDate(savedLeaveDates[savedLeaveDates.length - 1]));
        
        // Store actual leave dates as ISO strings in metadata for consistency and future reference
        const leaveDatesISO = savedLeaveDates.map(d => {
            const dateObj = d instanceof Date ? d : new Date(d);
            return dateObj.toISOString();
        });
        
        NewNotificationService.notifyLeaveRequest(
            userId, 
            employee.fullName, 
            requestType, 
            startDate, 
            endDate,
            newRequest._id.toString(),
            leaveDatesISO
        )
            .catch(err => console.error('Error sending real-time leave request notification:', err));

        res.status(201).json({ 
            message: 'Request submitted successfully!', 
            request: newRequest,
            warnings: validation.warnings || []
        });
    } catch (error) {
        console.error('Error submitting leave request:', error);
        res.status(500).json({ error: 'Internal server error while submitting request.' });
    }
});

// POST /api/leaves/upload-medical-certificate
// Upload medical certificate for sick leave (stored in MongoDB GridFS)
router.post('/upload-medical-certificate', authenticateToken, uploadMedicalCertificate, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Medical certificate file is required.' });
        }

        const db = mongoose.connection.db;
        if (!db) {
            return res.status(503).json({ error: 'Database not available.' });
        }
        const bucket = new GridFSBucket(db, { bucketName: 'medicalCertificates' });
        const employeeId = req.user.userId;
        const { buffer, originalname, mimetype } = req.file;
        const uploadTimestamp = new Date();

        const uploadStream = bucket.openUploadStream(originalname || 'medical-cert', {
            metadata: {
                employeeId: String(employeeId),
                originalFilename: originalname || '',
                mimetype: mimetype || '',
                uploadTimestamp: uploadTimestamp.toISOString()
            },
            contentType: mimetype || undefined
        });

        const { Readable } = require('stream');
        await new Promise((resolve, reject) => {
            const bufStream = Readable.from(buffer);
            uploadStream.on('finish', resolve).on('error', reject);
            bufStream.on('error', reject);
            bufStream.pipe(uploadStream);
        });

        const fileId = uploadStream.id.toString();
        const baseUrl = process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/medical-certificates/${fileId}`;

        res.json({
            message: 'Medical certificate uploaded successfully.',
            fileUrl: fileUrl
        });
    } catch (error) {
        console.error('Medical certificate upload error:', error);
        res.status(500).json({ error: 'Failed to upload medical certificate.' });
    }
});

// GET /api/leaves/my-requests
router.get('/my-requests', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const totalCount = await LeaveRequest.countDocuments({ employee: req.user.userId });
        const requests = await LeaveRequest.find({ employee: req.user.userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
            
        res.json({
            requests,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch your requests.' });
    }
});

// PUT /api/leaves/request/:id/correct — employee updates a Returned request and resubmits
router.put('/request/:id/correct', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { requestType, leaveType, leaveDates, alternateDate, reason, medicalCertificate } = req.body;
    const { userId } = req.user;

    if (!requestType || !leaveDates || leaveDates.length === 0 || !reason || !leaveType) {
        return res.status(400).json({ error: 'Missing required fields for the request.' });
    }

    const dateNorm = normalizeLeaveDatesForApi(leaveDates);
    if (!dateNorm.valid) {
        return res.status(400).json({ error: dateNorm.error });
    }

    try {
        const existing = await LeaveRequest.findOne({ _id: id, employee: userId });
        if (!existing) {
            return res.status(404).json({ error: 'Leave request not found.' });
        }
        if (existing.status !== 'Returned') {
            return res.status(400).json({ error: 'Only requests returned for correction can be updated.' });
        }

        const employee = await User.findById(userId);
        if (!employee) return res.status(404).json({ error: 'Employee not found.' });

        const validation = await LeaveValidationService.validateLeaveRequest(
            employee,
            requestType,
            dateNorm.dateStrings,
            leaveType,
            medicalCertificate,
            alternateDate,
            { excludeRequestId: existing._id },
            reason
        );

        if (!validation.valid) {
            return res.status(400).json({
                error: validation.errors.join(' '),
                errors: validation.errors,
                warnings: validation.warnings || [],
            });
        }

        const finalRequestType = requestType === 'Backdate' ? 'Backdated Leave' : requestType;
        let leaveDatesArray = dateNorm.dateStrings.map((d) => parseISTDate(d));

        if (finalRequestType === 'Planned') {
            const clubbedDates = LeavePolicyService.clubSaturdayInLeaveDates(
                employee,
                leaveDatesArray,
                finalRequestType,
                new Date()
            );
            leaveDatesArray = clubbedDates.map((d) => parseISTDate(d));
        }

        const { startOfISTDay } = require('../utils/istTime');
        const today = startOfISTDay();
        const firstLeaveDate = startOfISTDay(leaveDatesArray[0]);
        const isBackdated = firstLeaveDate < today;

        existing.requestType = finalRequestType;
        existing.leaveType = leaveType;
        existing.leaveDates = leaveDatesArray;
        existing.alternateDate = alternateDate ? parseISTDate(alternateDate) : null;
        existing.reason = reason;
        existing.isBackdated = isBackdated;
        existing.status = 'Pending';
        existing.employeeCorrectedAt = new Date();
        existing.dayTypeAllocations = [];
        existing.dayAllocationsUpdatedBy = undefined;
        existing.dayAllocationsUpdatedAt = undefined;

        if (finalRequestType === 'Sick') {
            if (medicalCertificate) {
                existing.medicalCertificate = medicalCertificate;
                existing.medicalCertificateUploadedAt = new Date();
            }
            if (validation.medicalProofStatus) {
                existing.medicalProofStatus = validation.medicalProofStatus;
                existing.medicalProofRequired = validation.medicalProofRequired || false;
                existing.medicalProofDeadline = validation.medicalProofDeadline || null;
            }
            existing.appliedAfterReturn = validation.appliedAfterReturn || false;
        }

        if (finalRequestType === 'Planned' && validation.halfYearPeriod) {
            existing.halfYearPeriod = validation.halfYearPeriod;
        }

        await existing.save();

        try {
            const cacheService = require('../services/cacheService');
            cacheService.invalidatePendingLeaves(getTodayISTKey());
            cacheService.invalidateLeaveAnalytics();
        } catch (e) { /* non-fatal */ }

        const savedLeaveDates = existing.leaveDates;
        const startDate = formatISTDate(parseISTDate(savedLeaveDates[0]));
        const endDate = savedLeaveDates.length === 1
            ? startDate
            : formatISTDate(parseISTDate(savedLeaveDates[savedLeaveDates.length - 1]));

        NewNotificationService.notifyLeaveResubmitted(
            userId,
            employee.fullName,
            finalRequestType,
            startDate,
            endDate,
            existing._id.toString()
        ).catch((err) => console.error('Error sending resubmit notification:', err));

        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('leave_request_updated', {
                    leaveId: existing._id,
                    employeeId: userId,
                    status: 'Pending',
                    requestType: existing.requestType,
                    timestamp: new Date().toISOString(),
                    message: 'Leave corrected and resubmitted',
                });
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
        }

        res.json({
            message: 'Leave request updated and resubmitted for approval.',
            request: existing,
            warnings: validation.warnings || [],
        });
    } catch (error) {
        console.error('Error correcting leave request:', error);
        res.status(500).json({ error: 'Internal server error while updating request.' });
    }
});

// POST /api/leaves/year-end-request
// Employee submits Year-End leave request (Carry Forward or Encash)
router.post('/year-end-request', authenticateToken, async (req, res) => {
    const { leaveType, subType, days } = req.body;
    const { userId } = req.user;

    if (!leaveType || !subType || !days || days <= 0) {
        return res.status(400).json({ error: 'Missing required fields: leaveType, subType, and days.' });
    }

    if (!['CARRY_FORWARD', 'ENCASH'].includes(subType)) {
        return res.status(400).json({ error: 'Invalid subType. Must be CARRY_FORWARD or ENCASH.' });
    }

    if (!['Sick', 'Casual', 'Planned'].includes(leaveType)) {
        return res.status(400).json({ error: 'Invalid leaveType. Must be Sick, Casual, or Planned.' });
    }

    try {
        // CRITICAL YEAR-END REQUEST YEAR DETECTION:
        // Year-End requests are for the CLOSING year (the year that's ending)
        // If we're in December 2025, the request is for 2025 (closing year)
        // If we're in January 2026, we might still process 2025 year-end requests (late submissions)
        // Rule: Use current year if in December, otherwise use previous year if in January
        const { getISTNow, getISTDateParts } = require('../utils/istTime');
        const currentDate = getISTNow();
        const dateParts = getISTDateParts(currentDate);
        const currentYear = dateParts.year;
        const currentMonth = dateParts.monthIndex; // 0-11 (0 = January, 11 = December)
        
        // Determine the closing year for the year-end request
        // If we're in December, use current year (closing year)
        // If we're in January, use previous year (still processing last year's year-end)
        // Otherwise, use current year (assume we're processing current year's year-end)
        const closingYear = (currentMonth === 0) ? (currentYear - 1) : currentYear;
        
        // CRITICAL: Check for duplicate requests FIRST, before any other logic
        // This prevents duplicate submissions even if API is called manually
        const existingRequest = await LeaveRequest.findOne({
            employee: userId,
            requestType: 'YEAR_END',
            yearEndLeaveType: leaveType,
            yearEndYear: closingYear,
            status: { $in: ['Pending', 'Approved'] }
        });

        if (existingRequest) {
            return res.status(409).json({ 
                error: `Year-End request already submitted for ${leaveType} leave for ${closingYear}.`,
                existingRequest: {
                    _id: existingRequest._id,
                    status: existingRequest.status,
                    yearEndSubType: existingRequest.yearEndSubType,
                    yearEndDays: existingRequest.yearEndDays,
                    yearEndYear: existingRequest.yearEndYear
                }
            });
        }

        const employee = await User.findById(userId);
        if (!employee) return res.status(404).json({ error: 'Employee not found.' });

        // Check if employee is permanent - Year-End requests are only for permanent employees
        if (employee.employmentStatus !== 'Permanent') {
            return res.status(403).json({ 
                error: 'Year-End leave requests are only available for permanent employees.' 
            });
        }

        // Check if Year-End feature is enabled
        const Setting = require('../models/Setting');
        const yearEndSetting = await Setting.findOne({ key: 'yearEndFeature' });
        if (!yearEndSetting || !yearEndSetting.value) {
            return res.status(403).json({ error: 'Year-End leave actions are currently disabled by Admin.' });
        }

        // Map leaveType to balance field
        const balanceField = leaveType === 'Sick' ? 'sick' : leaveType === 'Casual' ? 'casual' : 'paid';
        const remainingBalance = employee.leaveBalances[balanceField] || 0;

        if (remainingBalance <= 0) {
            return res.status(400).json({ error: `No remaining ${leaveType} leave balance available.` });
        }

        if (days > remainingBalance) {
            return res.status(400).json({ error: `Requested days (${days}) exceed remaining balance (${remainingBalance}).` });
        }

        // Create Year-End leave request
        // Store the closing year (e.g., 2025) - this is the year that's ending
        // The target year (e.g., 2026) will be calculated during approval
        const leaveRequestData = {
            employee: userId,
            requestType: 'YEAR_END',
            leaveType: 'Full Day', // Default for Year-End
            leaveDates: [], // Year-End doesn't use specific dates
            reason: `Year-End ${subType === 'CARRY_FORWARD' ? 'Carry Forward' : 'Encash'} request for ${leaveType} leave (${closingYear} → ${closingYear + 1})`,
            yearEndSubType: subType,
            yearEndLeaveType: leaveType,
            yearEndDays: days,
            yearEndYear: closingYear, // Store the closing year (e.g., 2025)
            status: 'Pending',
            isProcessed: false
        };

        const newRequest = await LeaveRequest.create(leaveRequestData);

        // Send notification to admins
        await NewNotificationService.broadcastToAdmins({
            message: `${employee.fullName} submitted a Year-End ${subType === 'CARRY_FORWARD' ? 'Carry Forward' : 'Encash'} request for ${days} day(s) of ${leaveType} leave.`,
            type: 'leave_request',
            category: 'leave',
            priority: 'high',
            navigationData: { 
                page: '/admin/leaves',
                params: { 
                    requestId: newRequest._id.toString(),
                    tab: 'year-end',
                    actionId: newRequest._id.toString()
                }
            },
            metadata: {
                type: 'YEAR_END_LEAVE',
                requestId: newRequest._id.toString(),
                targetTab: 'year-end'
            }
        }, userId);

        res.status(201).json({ 
            message: 'Year-End leave request submitted successfully!', 
            request: newRequest
        });
    } catch (error) {
        console.error('Error submitting Year-End leave request:', error);
        res.status(500).json({ error: 'Internal server error while submitting Year-End request.' });
    }
});

// GET /api/leaves/year-end-feature-status
// Check if Year-End feature is enabled and if user is permanent
router.get('/year-end-feature-status', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const employee = await User.findById(userId);
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const Setting = require('../models/Setting');
        const yearEndSetting = await Setting.findOne({ key: 'yearEndFeature' });
        const featureEnabled = yearEndSetting ? yearEndSetting.value : false;
        
        // Check if employee is permanent
        const isPermanent = employee.employmentStatus === 'Permanent';
        
        // Year-end feature is available only if:
        // 1. Feature is enabled by admin
        // 2. Employee is permanent
        const available = featureEnabled && isPermanent;
        
        res.json({ 
            enabled: available,
            featureEnabled: featureEnabled,
            isPermanent: isPermanent
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch Year-End feature status.' });
    }
});

// =================================================================
// AGGREGATE ENDPOINT: /api/leaves/dashboard
// Combines: /leaves/my-requests, /leaves/my-leave-balances, /leaves/holidays,
//           /leaves/carryforward-status, /leaves/year-end-feature-status
// Purpose: Single endpoint for leaves page (reduces 5 calls to 1)
// =================================================================
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Fetch user data once (employmentStatus and leaveBalances)
        const user = await User.findById(userId).select('leaveBalances employmentStatus').lean();
        const employmentStatus = user?.employmentStatus || null;
        const leaveBalances = user?.leaveBalances || { paid: 0, sick: 0, casual: 0 };

        // Parallelize remaining data fetches
        const [
            requestsResult,
            holidays,
            carryforwardStatus,
            yearEndFeatureStatus
        ] = await Promise.all([
            // 1. Leave requests (paginated)
            (async () => {
                const totalCount = await LeaveRequest.countDocuments({ employee: userId });
                const requests = await LeaveRequest.find({ employee: userId })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean();
                return {
                    requests: Array.isArray(requests) ? requests : [],
                    totalCount,
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit)
                };
            })(),
            // 2. Holidays (only from active leave year)
            (async () => {
                // Get active leave year
                const activeYear = await LeaveYear.findOne({ isActive: true }).lean();
                if (!activeYear) {
                    return []; // No active year, return empty array
                }
                
                // Fetch holidays for active year only
                const holidays = await Holiday.find({ leaveYearId: activeYear._id }).lean();
                return holidays.sort((a, b) => {
                    const aIsTentative = !a.date || a.isTentative;
                    const bIsTentative = !b.date || b.isTentative;
                    if (aIsTentative && bIsTentative) {
                        return a.name.localeCompare(b.name);
                    }
                    if (aIsTentative) return 1;
                    if (bIsTentative) return -1;
                    return new Date(a.date) - new Date(b.date);
                });
            })(),
            // 3. Carryforward status - NOT IMPLEMENTED: previous-year-balances and carryforward-decision APIs do not exist.
            // UI should not show carryforward banner (hasPendingDecision always false). See audit: option B - remove exposure.
            (async () => ({ hasPendingDecision: false }))(),
            // 4. Year-end feature status - SINGLE key: yearEndFeature (aligned with year-end-request and feature-status)
            (async () => {
                try {
                    const isPermanent = employmentStatus === 'Permanent';
                    const featureSetting = await Setting.findOne({ key: 'yearEndFeature' });
                    const featureEnabled = featureSetting?.value === true || featureSetting?.value === 'true';
                    return { enabled: featureEnabled && isPermanent };
                } catch (err) {
                    return { enabled: false };
                }
            })()
        ]);

        res.json({
            requests: requestsResult,
            leaveBalances,
            employmentStatus, // Include employmentStatus in response for frontend to use as source of truth
            holidays: Array.isArray(holidays) ? holidays : [],
            carryforwardStatus: carryforwardStatus || { hasPendingDecision: false },
            yearEndFeatureEnabled: yearEndFeatureStatus?.enabled || false
        });
    } catch (error) {
        console.error('Error fetching leaves dashboard data:', error);
        res.status(500).json({ error: 'Failed to fetch leaves dashboard data.' });
    }
});

module.exports = router;