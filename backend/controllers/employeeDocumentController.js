// backend/controllers/employeeDocumentController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const EmployeeDocument = require('../models/EmployeeDocument');
const Setting = require('../models/Setting');
const NewNotificationService = require('../services/NewNotificationService');
const cacheService = require('../services/cacheService');
const { getPolicyBucket } = require('../db');

const DOCUMENT_TYPES_KEY = 'employeeDocumentTypes';
const AUTO_RULE_KEY = 'employeeDocumentAutoRule';

const DEFAULT_DOCUMENT_TYPES = [
    { key: 'joining_letter', label: 'Joining Letter', isBuiltIn: true },
    { key: 'kra', label: 'KRA Letter', isBuiltIn: true },
    { key: 'probation_confirmation', label: 'Probation Confirmation', isBuiltIn: true },
    { key: 'probation_extension', label: 'Probation Extension', isBuiltIn: true },
];

const DEFAULT_AUTO_RULE = {
    enabled: true,
    outcome: 'pending_hr_decision',
};

function parseUA(ua = '') {
    let device = 'Desktop';
    if (/mobile/i.test(ua)) device = 'Mobile';
    else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

    let browser = 'Unknown';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/opr\//i.test(ua)) browser = 'Opera';
    else if (/chrome/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/msie|trident/i.test(ua)) browser = 'IE';

    return { device, browser };
}

function isAdminOrHr(role) {
    return ['Admin', 'HR'].includes(role);
}

function resolveDocumentStatus(doc) {
    if (doc.status === 'hr_pending') return 'hr_pending';
    if (doc.acknowledgedAt) return 'acknowledged';
    if (doc.requiresAcknowledgment) {
        return doc.viewedAt ? 'viewed' : 'pending';
    }
    return doc.viewedAt ? 'viewed' : 'pending';
}

async function getDocumentTypesConfig() {
    const setting = await Setting.findOne({ key: DOCUMENT_TYPES_KEY }).lean();
    if (setting?.value && Array.isArray(setting.value) && setting.value.length > 0) {
        return setting.value;
    }
    return DEFAULT_DOCUMENT_TYPES;
}

async function getAutoRuleConfig() {
    const setting = await Setting.findOne({ key: AUTO_RULE_KEY }).lean();
    return { ...DEFAULT_AUTO_RULE, ...(setting?.value || {}) };
}

function findTypeLabel(types, documentType, customLabel) {
    if (documentType === 'custom' && customLabel) return customLabel.trim();
    const found = types.find((t) => t.key === documentType);
    return found?.label || documentType;
}

function parseEmployeeIds(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (_) {
        // fall through
    }
    return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

async function notifyEmployeeDocumentAssigned(employee, doc) {
    await NewNotificationService.createAndEmitNotification({
        message: `A new document "${doc.documentTypeLabel}" has been assigned to you.`,
        type: 'employee_document_assigned',
        userId: employee._id,
        userName: employee.fullName,
        recipientType: 'user',
        category: 'system',
        priority: 'high',
        navigationData: {
            page: 'profile',
            params: { section: 'documents', documentId: doc._id.toString() },
        },
        metadata: {
            documentId: doc._id.toString(),
            documentType: doc.documentType,
            requiresAcknowledgment: doc.requiresAcknowledgment,
        },
    });
}

async function notifyEmploymentStatusChanged(employee, previousStatus, newStatus) {
    await NewNotificationService.createAndEmitNotification({
        message: `Your employment status has been updated to ${newStatus}.`,
        type: 'employment_status_changed',
        userId: employee._id,
        userName: employee.fullName,
        recipientType: 'user',
        category: 'system',
        priority: 'high',
        navigationData: { page: 'profile', params: { section: 'documents' } },
        metadata: { previousStatus, newStatus },
    });
}

// ─── Config endpoints ─────────────────────────────────────────────────────────

exports.getDocumentTypes = async (req, res) => {
    try {
        const types = await getDocumentTypesConfig();
        res.json({ types });
    } catch (err) {
        console.error('[EmployeeDoc] getDocumentTypes error:', err);
        res.status(500).json({ error: 'Failed to fetch document types.' });
    }
};

exports.updateDocumentTypes = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { types } = req.body;
        if (!Array.isArray(types) || types.length === 0) {
            return res.status(400).json({ error: 'types array is required.' });
        }

        const normalized = types.map((t) => ({
            key: String(t.key || t.label || '').trim().toLowerCase().replace(/\s+/g, '_'),
            label: String(t.label || t.key || '').trim(),
            isBuiltIn: !!t.isBuiltIn,
        })).filter((t) => t.key && t.label);

        await Setting.findOneAndUpdate(
            { key: DOCUMENT_TYPES_KEY },
            { key: DOCUMENT_TYPES_KEY, value: normalized },
            { upsert: true, new: true }
        );

        res.json({ types: normalized });
    } catch (err) {
        console.error('[EmployeeDoc] updateDocumentTypes error:', err);
        res.status(500).json({ error: 'Failed to update document types.' });
    }
};

exports.getAutoRule = async (req, res) => {
    try {
        const rule = await getAutoRuleConfig();
        res.json({ rule });
    } catch (err) {
        console.error('[EmployeeDoc] getAutoRule error:', err);
        res.status(500).json({ error: 'Failed to fetch auto rule.' });
    }
};

exports.updateAutoRule = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { enabled, outcome } = req.body;
        const validOutcomes = ['probation_confirmation', 'probation_extension', 'pending_hr_decision'];
        if (outcome && !validOutcomes.includes(outcome)) {
            return res.status(400).json({ error: 'Invalid outcome value.' });
        }

        const current = await getAutoRuleConfig();
        const rule = {
            enabled: enabled !== undefined ? !!enabled : current.enabled,
            outcome: outcome || current.outcome,
        };

        await Setting.findOneAndUpdate(
            { key: AUTO_RULE_KEY },
            { key: AUTO_RULE_KEY, value: rule },
            { upsert: true, new: true }
        );

        res.json({ rule });
    } catch (err) {
        console.error('[EmployeeDoc] updateAutoRule error:', err);
        res.status(500).json({ error: 'Failed to update auto rule.' });
    }
};

// ─── Manual assign ────────────────────────────────────────────────────────────

exports.assignDocuments = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (!req.employeeDocumentUpload) {
            return res.status(400).json({ error: 'File upload failed.' });
        }

        const {
            documentType,
            customTypeLabel,
            requiresAcknowledgment,
            note,
        } = req.body;

        const employeeIds = parseEmployeeIds(req.body.employeeIds);
        if (!employeeIds.length) {
            return res.status(400).json({ error: 'At least one employee must be selected.' });
        }
        if (!documentType) {
            return res.status(400).json({ error: 'documentType is required.' });
        }

        const types = await getDocumentTypesConfig();
        const typeLabel = findTypeLabel(types, documentType, customTypeLabel);
        const requiresAck = requiresAcknowledgment === true || requiresAcknowledgment === 'true';

        const admin = await User.findById(req.user.userId).select('fullName').lean();
        const employees = await User.find({ _id: { $in: employeeIds }, isActive: true })
            .select('fullName employeeCode department employmentStatus')
            .lean();

        if (!employees.length) {
            return res.status(400).json({ error: 'No valid employees found.' });
        }

        const created = [];
        for (const employee of employees) {
            const doc = await EmployeeDocument.create({
                employeeId: employee._id,
                employeeName: employee.fullName,
                employeeCode: employee.employeeCode,
                department: employee.department || '',
                employmentStatus: employee.employmentStatus || '',
                documentType,
                documentTypeLabel: typeLabel,
                fileRef: req.employeeDocumentUpload.fileId,
                fileName: req.employeeDocumentUpload.originalFilename,
                assignedBy: req.user.userId,
                assignedByName: admin?.fullName || 'Admin',
                assignedAt: new Date(),
                method: 'manual',
                requiresAcknowledgment: requiresAck,
                note: note || '',
                status: 'pending',
                timeline: [{
                    event: 'assigned',
                    timestamp: new Date(),
                    notes: `Manually assigned by ${admin?.fullName || 'Admin'}`,
                    performedBy: admin?.fullName || 'Admin',
                }],
            });

            created.push(doc);
            await notifyEmployeeDocumentAssigned(employee, doc);
        }

        res.status(201).json({ message: `Assigned to ${created.length} employee(s).`, documents: created });
    } catch (err) {
        console.error('[EmployeeDoc] assignDocuments error:', err);
        res.status(500).json({ error: 'Failed to assign documents.' });
    }
};

// ─── Admin compliance table ───────────────────────────────────────────────────

exports.getAdminCompliance = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.department) filter.department = new RegExp(req.query.department, 'i');
        if (req.query.documentType) filter.documentType = req.query.documentType;
        if (req.query.employeeId) filter.employeeId = req.query.employeeId;

        const [records, total] = await Promise.all([
            EmployeeDocument.find(filter)
                .sort({ assignedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            EmployeeDocument.countDocuments(filter),
        ]);

        const enriched = records.map((doc) => ({
            ...doc,
            displayStatus: resolveDocumentStatus(doc),
            assignedByDisplay: doc.assignedBy === 'system' ? 'System' : (doc.assignedByName || 'Admin'),
        }));

        res.json({ records: enriched, total, page, limit });
    } catch (err) {
        console.error('[EmployeeDoc] getAdminCompliance error:', err);
        res.status(500).json({ error: 'Failed to fetch compliance records.' });
    }
};

// ─── Employee endpoints ─────────────────────────────────────────────────────

exports.getMyDocuments = async (req, res) => {
    try {
        const docs = await EmployeeDocument.find({ employeeId: req.user.userId })
            .sort({ assignedAt: -1 })
            .lean();

        const enriched = docs.map((doc) => ({
            ...doc,
            displayStatus: resolveDocumentStatus(doc),
        }));

        res.json({ documents: enriched });
    } catch (err) {
        console.error('[EmployeeDoc] getMyDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch your documents.' });
    }
};

exports.getDocumentFile = async (req, res) => {
    try {
        const doc = await EmployeeDocument.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        const isOwner = doc.employeeId.toString() === req.user.userId;
        if (!isOwner && !isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (!doc.fileRef) {
            return res.status(404).json({ error: 'No file attached to this record.' });
        }

        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'inline');
        res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'SAMEORIGIN');

        const policyBucket = getPolicyBucket();
        const downloadStream = policyBucket.openDownloadStream(
            new mongoose.Types.ObjectId(doc.fileRef)
        );

        downloadStream.on('error', (error) => {
            console.error('[EmployeeDoc PDF] Stream error:', error);
            if (!res.headersSent) res.status(404).json({ error: 'File not found in storage' });
        });

        downloadStream.pipe(res);
    } catch (err) {
        console.error('[EmployeeDoc] getDocumentFile error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to load PDF.' });
    }
};

exports.recordView = async (req, res) => {
    try {
        const doc = await EmployeeDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        if (doc.employeeId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (!doc.viewedAt) {
            const now = new Date();
            doc.viewedAt = now;
            if (!doc.requiresAcknowledgment && doc.status !== 'hr_pending') {
                doc.status = 'viewed';
            }
            doc.timeline.push({
                event: 'viewed',
                timestamp: now,
                notes: 'Document opened',
                performedBy: req.user.email || 'Employee',
            });
            await doc.save();
        }

        res.json({ document: doc });
    } catch (err) {
        console.error('[EmployeeDoc] recordView error:', err);
        res.status(500).json({ error: 'Failed to record view.' });
    }
};

exports.startReading = async (req, res) => {
    try {
        const doc = await EmployeeDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        if (doc.employeeId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        if (!doc.requiresAcknowledgment) {
            return res.status(400).json({ error: 'This document does not require acknowledgment.' });
        }

        const hasStarted = doc.timeline.some((t) => t.event === 'reading_started');
        if (!hasStarted) {
            doc.timeline.push({
                event: 'reading_started',
                timestamp: new Date(),
                notes: 'Employee started reading document',
                performedBy: req.user.email || 'Employee',
            });
            await doc.save();
        }

        res.json({ message: 'Reading start recorded.' });
    } catch (err) {
        console.error('[EmployeeDoc] startReading error:', err);
        res.status(500).json({ error: 'Failed to record reading start.' });
    }
};

exports.acknowledgeDocument = async (req, res) => {
    try {
        const {
            checkboxAcknowledged,
            readingDurationSeconds,
            scrolledToBottom,
        } = req.body;

        const doc = await EmployeeDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });
        if (doc.employeeId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        if (!doc.requiresAcknowledgment) {
            return res.status(400).json({ error: 'This document does not require acknowledgment.' });
        }
        if (doc.acknowledgedAt) {
            return res.json({ message: 'Already acknowledged.', document: doc });
        }
        if (!checkboxAcknowledged) {
            return res.status(400).json({ error: 'You must acknowledge the checkbox.' });
        }
        if (!scrolledToBottom) {
            return res.status(400).json({ error: 'You must scroll to the bottom before acknowledging.' });
        }

        const minSeconds = 60;
        if (!readingDurationSeconds || readingDurationSeconds < minSeconds) {
            return res.status(400).json({
                error: `Minimum reading time not met. Required: ${minSeconds}s, Recorded: ${readingDurationSeconds || 0}s.`,
            });
        }

        const now = new Date();
        const ip = req.ip || req.connection?.remoteAddress || '';
        const ua = req.headers['user-agent'] || '';
        const { device, browser } = parseUA(ua);

        doc.acknowledgedAt = now;
        doc.checkboxAcknowledged = true;
        doc.scrolledToBottom = true;
        doc.readingDurationSeconds = readingDurationSeconds;
        doc.acknowledgmentIp = ip;
        doc.acknowledgmentUserAgent = ua;
        doc.acknowledgmentDeviceType = device;
        doc.acknowledgmentBrowser = browser;
        doc.status = 'acknowledged';
        if (!doc.viewedAt) doc.viewedAt = now;

        doc.timeline.push({
            event: 'acknowledged',
            timestamp: now,
            notes: `Acknowledged from ${ip} via ${browser}`,
            performedBy: req.user.email || 'Employee',
            ipAddress: ip,
        });

        await doc.save();
        res.json({ message: 'Document acknowledged.', document: doc });
    } catch (err) {
        console.error('[EmployeeDoc] acknowledgeDocument error:', err);
        res.status(500).json({ error: 'Failed to acknowledge document.' });
    }
};

// ─── Forward to personal email ────────────────────────────────────────────────

exports.forwardToPersonalEmail = async (req, res) => {
    const COOLDOWN_MS = 5 * 60 * 1000; // 5-minute cooldown per document

    try {
        // 1. Load and verify ownership — never trust client-supplied email
        const doc = await EmployeeDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        if (doc.employeeId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (!doc.fileRef) {
            return res.status(400).json({ error: 'No file attached to this document.' });
        }

        // 2. Rate-limit: timestamp-based cooldown
        if (doc.forwardedToPersonalEmailAt) {
            const elapsed = Date.now() - new Date(doc.forwardedToPersonalEmailAt).getTime();
            if (elapsed < COOLDOWN_MS) {
                const waitSec = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
                return res.status(429).json({
                    error: `Please wait ${waitSec} second${waitSec !== 1 ? 's' : ''} before sending again.`,
                });
            }
        }

        // 3. Read personal email from the authenticated user's own profile — server-side only
        const user = await User.findById(req.user.userId)
            .select('personalDetails fullName')
            .lean();

        const personalEmail = user?.personalDetails?.personalEmail;
        if (!personalEmail) {
            return res.status(400).json({
                error: 'No personal email address found on your profile. Please add one in Profile → Contact Information.',
            });
        }

        // 4. Stream the PDF from GridFS into a Buffer for the email attachment
        const policyBucket = getPolicyBucket();
        const downloadStream = policyBucket.openDownloadStream(
            new mongoose.Types.ObjectId(doc.fileRef)
        );

        const pdfBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            downloadStream.on('data', (chunk) => chunks.push(chunk));
            downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
            downloadStream.on('error', reject);
        });

        // 5. Send via the existing mail utility — reuses the singleton SMTP transporter
        const { sendEmail } = require('../services/mailService');
        const companyName = process.env.COMPANY_NAME || 'Your Company';

        await sendEmail({
            to: personalEmail,
            subject: `Your ${doc.documentTypeLabel} from ${companyName}`,
            text: [
                `Hi ${user.fullName},`,
                '',
                `Please find your "${doc.documentTypeLabel}" attached to this email.`,
                '',
                'This is a system-generated compliance document. Please do not reply to this message if it was sent from a no-reply address.',
                '',
                `Issued: ${new Date(doc.assignedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                '',
                `— ${companyName} HR`,
            ].join('\n'),
            html: `
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1e293b;max-width:560px;margin:0 auto">
                    <p>Hi ${user.fullName},</p>
                    <p>Please find your <strong>${doc.documentTypeLabel}</strong> attached to this email.</p>
                    <p style="color:#64748b;font-size:13px">
                        This is a system-generated compliance document.
                        Please do not reply to this message if it was sent from a no-reply address.
                    </p>
                    <p style="color:#94a3b8;font-size:12px">
                        Issued: ${new Date(doc.assignedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
                    <p style="color:#94a3b8;font-size:12px">&mdash; ${companyName} HR</p>
                </div>
            `,
            attachments: [{
                filename: doc.fileName || `${doc.documentTypeLabel}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
        });

        // 6. Update audit fields on the existing record — no new collection
        const now = new Date();
        doc.forwardedToPersonalEmailAt = now;
        doc.forwardedCount = (doc.forwardedCount || 0) + 1;
        doc.lastForwardStatus = 'success';
        doc.timeline.push({
            event: 'forwarded_to_personal_email',
            timestamp: now,
            notes: `Forwarded to personal email (send #${doc.forwardedCount})`,
            performedBy: req.user.email || 'Employee',
        });
        await doc.save();

        // 7. Return a masked email address (e.g. j•••e@gmail.com) for the toast
        const atIdx = personalEmail.lastIndexOf('@');
        const localPart = personalEmail.slice(0, atIdx);
        const domain = personalEmail.slice(atIdx + 1);
        const maskedLocal = localPart.length <= 2
            ? `${localPart[0]}•••`
            : `${localPart[0]}•••${localPart.slice(-1)}`;
        const maskedEmail = `${maskedLocal}@${domain}`;

        res.json({ message: `Sent to ${maskedEmail}`, maskedEmail });
    } catch (err) {
        console.error('[EmployeeDoc] forwardToPersonalEmail error:', err);

        // Best-effort: record the failure in the timeline
        try {
            const docForAudit = await EmployeeDocument.findById(req.params.id);
            if (docForAudit && docForAudit.employeeId.toString() === req.user.userId) {
                docForAudit.lastForwardStatus = 'failure';
                docForAudit.timeline.push({
                    event: 'forwarded_to_personal_email',
                    timestamp: new Date(),
                    notes: `Forward failed: ${err.message}`,
                    performedBy: req.user.email || 'Employee',
                });
                await docForAudit.save();
            }
        } catch (_) { /* ignore secondary failure */ }

        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to send email. Please try again.' });
        }
    }
};

// ─── Employment status change ─────────────────────────────────────────────────

exports.changeEmploymentStatus = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { userId } = req.params;
        const {
            employmentStatus,
            effectiveDate,
            note,
            documentId,
        } = req.body;

        if (!employmentStatus || employmentStatus !== 'Permanent') {
            return res.status(400).json({ error: 'Only change to Permanent is supported via this action.' });
        }
        if (!effectiveDate) {
            return res.status(400).json({ error: 'effectiveDate is required.' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'Employee not found.' });

        const admin = await User.findById(req.user.userId).select('fullName').lean();
        const previousStatus = user.employmentStatus;
        const effective = new Date(effectiveDate);

        user.employmentStatus = 'Permanent';
        user.probationStatus = 'Permanent';
        user.confirmationDate = effective;
        await user.save();
        cacheService.invalidateUser(user._id.toString());

        let linkedDoc = null;
        if (documentId) {
            linkedDoc = await EmployeeDocument.findOne({
                _id: documentId,
                employeeId: user._id,
            });
        }

        const auditDoc = await EmployeeDocument.create({
            employeeId: user._id,
            employeeName: user.fullName,
            employeeCode: user.employeeCode,
            department: user.department || '',
            employmentStatus: 'Permanent',
            documentType: 'employment_status_change',
            documentTypeLabel: 'Employment Status Change',
            fileRef: linkedDoc?.fileRef || null,
            fileName: linkedDoc?.fileName || '',
            assignedBy: req.user.userId,
            assignedByName: admin?.fullName || 'Admin',
            assignedAt: effective,
            method: 'manual',
            requiresAcknowledgment: false,
            note: note || '',
            status: 'acknowledged',
            statusChangeMeta: {
                previousStatus,
                newStatus: 'Permanent',
                effectiveDate: effective,
                approverId: req.user.userId,
                approverName: admin?.fullName || 'Admin',
            },
            timeline: [{
                event: 'status_changed',
                timestamp: new Date(),
                notes: `Status changed from ${previousStatus} to Permanent by ${admin?.fullName || 'Admin'}`,
                performedBy: admin?.fullName || 'Admin',
            }],
        });

        await notifyEmploymentStatusChanged(user, previousStatus, 'Permanent');

        res.json({
            message: 'Employment status updated.',
            user: {
                _id: user._id,
                employmentStatus: user.employmentStatus,
                confirmationDate: user.confirmationDate,
            },
            auditRecord: auditDoc,
        });
    } catch (err) {
        console.error('[EmployeeDoc] changeEmploymentStatus error:', err);
        res.status(500).json({ error: 'Failed to change employment status.' });
    }
};
