// backend/controllers/kycController.js
// KYC document management.
//
// POST /kyc/upload and POST /public/kyc/upload:
//   Browser → backend (multipart/form-data) → backend uploads to B2 via AWS SDK.
//   No CORS or presigned-URL involvement.  Handled by uploadDocument /
//   publicUploadDocument below.
'use strict';

const { randomUUID } = require('crypto');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getR2Client, BUCKET_NAME } = require('../config/r2');
const { EmployeeKycDocument, KYC_DOCUMENT_TYPES } = require('../models/EmployeeKycDocument');

// ─── Constants ────────────────────────────────────────────────────────────────
const DOWNLOAD_URL_EXPIRY_SECONDS = 5 * 60; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isAdminOrHr(role) {
    return ['Admin', 'HR'].includes(role);
}

function buildStorageKey(employeeId, documentType, ext) {
    const uuid = randomUUID();
    return `kyc/${employeeId}/${documentType}/${uuid}${ext}`;
}

function getDocTypeMeta(key) {
    return KYC_DOCUMENT_TYPES.find((d) => d.key === key) || null;
}

// ─── GET /kyc/types ───────────────────────────────────────────────────────────
// Returns the full catalogue of KYC document types.
exports.getDocumentTypes = (req, res) => {
    res.json({ types: KYC_DOCUMENT_TYPES });
};

// ─── GET /kyc/my-documents ────────────────────────────────────────────────────
// Returns the current (non-superseded) KYC document record for each type for
// the authenticated employee. Does NOT return presigned URLs — the client must
// call the view endpoint to get a short-lived URL per document.
exports.getMyDocuments = async (req, res) => {
    try {
        const employeeId = req.user.userId;

        // Fetch the latest non-superseded record per type
        const docs = await EmployeeKycDocument.find({
            employeeId,
            superseded: false,
        })
            .sort({ uploadedAt: -1 })
            .lean();

        // Index by type so the UI gets one entry per type
        const byType = {};
        for (const doc of docs) {
            if (!byType[doc.documentType]) byType[doc.documentType] = doc;
        }

        // Return an entry for every known type (even if not uploaded yet)
        const result = KYC_DOCUMENT_TYPES.map((typeMeta) => ({
            ...typeMeta,
            document: byType[typeMeta.key] || null,
        }));

        res.json({ documents: result });
    } catch (err) {
        console.error('[KYC] getMyDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch KYC documents.' });
    }
};

// ─── GET /kyc/view/:docId ─────────────────────────────────────────────────────
// Returns a short-lived presigned GET URL.
// Employees can only access their own documents; Admin/HR can access any.
exports.viewDocument = async (req, res) => {
    try {
        const { docId } = req.params;
        const doc = await EmployeeKycDocument.findById(docId).lean();

        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        // ── Ownership check ──
        const isOwner = doc.employeeId.toString() === req.user.userId;
        if (!isOwner && !isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // ── Generate presigned GET URL ──
        const client = getR2Client();
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME(),
            Key: doc.storageKey,
        });

        const presignedGetUrl = await getSignedUrl(client, command, {
            expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
        });

        res.json({ presignedGetUrl, expiresInSeconds: DOWNLOAD_URL_EXPIRY_SECONDS });
    } catch (err) {
        console.error('[KYC] viewDocument error:', err);
        res.status(500).json({ error: 'Failed to generate view URL.' });
    }
};

// ─── GET /kyc/admin/employee/:employeeId ──────────────────────────────────────
// Admin/HR: get all KYC document records (current + history) for an employee.
exports.getEmployeeDocuments = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { employeeId } = req.params;
        const { status, documentType } = req.query;

        const filter = { employeeId, superseded: false };
        if (status) filter.status = status;
        if (documentType) filter.documentType = documentType;

        const docs = await EmployeeKycDocument.find(filter)
            .sort({ uploadedAt: -1 })
            .lean();

        // Index by type (current records) and enrich with type meta
        const byType = {};
        for (const doc of docs) {
            if (!byType[doc.documentType]) byType[doc.documentType] = doc;
        }

        const result = KYC_DOCUMENT_TYPES.map((typeMeta) => ({
            ...typeMeta,
            document: byType[typeMeta.key] || null,
        }));

        res.json({ documents: result });
    } catch (err) {
        console.error('[KYC] getEmployeeDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch KYC documents.' });
    }
};

// ─── POST /kyc/admin/verify/:docId ───────────────────────────────────────────
// Admin/HR: verify a document (immutable audit: verifiedBy + verifiedAt set).
exports.verifyDocument = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const doc = await EmployeeKycDocument.findById(req.params.docId);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        if (doc.status === 'verified') {
            return res.status(400).json({ error: 'Document is already verified.' });
        }

        doc.status = 'verified';
        doc.verifiedBy = req.user.userId;
        doc.verifiedAt = new Date();
        doc.rejectionReason = '';
        await doc.save();

        res.json({ message: 'Document verified.', document: sanitizeDoc(doc.toObject()) });
    } catch (err) {
        console.error('[KYC] verifyDocument error:', err);
        res.status(500).json({ error: 'Failed to verify document.' });
    }
};

// ─── POST /kyc/admin/reject/:docId ───────────────────────────────────────────
// Admin/HR: reject a document with a required reason.
exports.rejectDocument = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ error: 'A rejection reason is required.' });
        }

        const doc = await EmployeeKycDocument.findById(req.params.docId);
        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        doc.status = 'rejected';
        doc.rejectionReason = reason.trim();
        doc.verifiedBy = req.user.userId;
        doc.verifiedAt = new Date();
        await doc.save();

        res.json({ message: 'Document rejected.', document: sanitizeDoc(doc.toObject()) });
    } catch (err) {
        console.error('[KYC] rejectDocument error:', err);
        res.status(500).json({ error: 'Failed to reject document.' });
    }
};

// ─── GET /kyc/admin/all ───────────────────────────────────────────────────────
// Admin/HR: paginated list of all KYC records across all employees.
// Query params: status, documentType, page, limit
exports.getAllDocuments = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;

        const filter = { superseded: false };
        if (req.query.status) filter.status = req.query.status;
        if (req.query.documentType) filter.documentType = req.query.documentType;
        if (req.query.employeeId) filter.employeeId = req.query.employeeId;

        const [records, total] = await Promise.all([
            EmployeeKycDocument.find(filter)
                .populate('employeeId', 'fullName employeeCode department')
                .populate('verifiedBy', 'fullName')
                .sort({ uploadedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            EmployeeKycDocument.countDocuments(filter),
        ]);

        res.json({ records: records.map(sanitizeDoc), total, page, limit });
    } catch (err) {
        console.error('[KYC] getAllDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch KYC records.' });
    }
};

// ─── GET /api/public/kyc/my-documents ────────────────────────────────────────
// Public-token variant of getMyDocuments — returns current KYC status for the
// employee associated with the token so the form can render existing uploads.
exports.publicGetMyDocuments = async (req, res) => {
    try {
        const employeeId = req.employeeId;
        if (!employeeId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const docs = await EmployeeKycDocument.find({ employeeId, superseded: false })
            .sort({ uploadedAt: -1 })
            .lean();

        const byType = {};
        for (const doc of docs) {
            if (!byType[doc.documentType]) byType[doc.documentType] = doc;
        }

        const result = KYC_DOCUMENT_TYPES.map((typeMeta) => ({
            ...typeMeta,
            document: byType[typeMeta.key] || null,
        }));

        res.json({ documents: result });
    } catch (err) {
        console.error('[KYC] publicGetMyDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch KYC documents.' });
    }
};

// ─── POST /kyc/upload ────────────────────────────────────────────────────────
// NEW proxy-upload handler (authenticated employees).
//
// The uploadKycDocumentToR2({ context: 'authenticated' }) middleware runs first
// and attaches req.kycUpload with the validated buffer + metadata.  This handler
// then uploads the buffer to B2 and creates the EmployeeKycDocument record in one
// atomic sequence.  If the B2 upload fails, no DB record is created.
//
// Multipart form fields expected:
//   file         — the file part (fieldname must be "file")
//   documentType — one of VALID_TYPES
exports.uploadDocument = async (req, res) => {
    try {
        // req.kycUpload is guaranteed to be present and fully validated by the
        // uploadKycDocumentToR2 middleware — no need to re-validate here.
        const { buffer, originalFileName, mimeType, fileSize, documentType, ext } = req.kycUpload;
        const employeeId = req.user.userId;

        // ── Generate storage key ──
        const storageKey = buildStorageKey(employeeId, documentType, ext);

        // ── Upload buffer to B2 ──
        let uploadErr = null;
        try {
            const client  = getR2Client();
            const command = new PutObjectCommand({
                Bucket:        BUCKET_NAME(),
                Key:           storageKey,
                Body:          buffer,
                ContentType:   mimeType,
                ContentLength: fileSize,
            });
            await client.send(command);
        } catch (b2Err) {
            // Log the full SDK error for debugging, return a generic message to the client.
            console.error('[KYC] uploadDocument — B2 PutObject failed:', b2Err);
            uploadErr = b2Err;
        }

        if (uploadErr) {
            return res.status(502).json({ error: 'File upload to storage failed. Please try again.' });
        }

        // ── Mark any existing active record for this type as superseded ──
        const previous = await EmployeeKycDocument.findOneAndUpdate(
            { employeeId, documentType, superseded: false },
            { $set: { superseded: true } },
            { new: false, sort: { uploadedAt: -1 } }
        );

        // ── Create the new metadata record ──
        const typeMeta = getDocTypeMeta(documentType);
        const newDoc = await EmployeeKycDocument.create({
            employeeId,
            documentType,
            storageKey,
            originalFileName,
            mimeType,
            fileSize,
            uploadedBy:   req.user.userId,
            status:       'pending_review',
            isOptional:   typeMeta ? typeMeta.isOptional : false,
            supersedesId: previous ? previous._id : null,
            superseded:   false,
        });

        res.status(201).json({
            message:  'Document uploaded successfully and is pending review.',
            document: sanitizeDoc(newDoc.toObject()),
        });
    } catch (err) {
        console.error('[KYC] uploadDocument error:', err);
        res.status(500).json({ error: 'Failed to upload document.' });
    }
};

// ─── POST /public/kyc/upload ─────────────────────────────────────────────────
// NEW proxy-upload handler (public token / onboarding form flow).
//
// The uploadKycDocumentToR2({ context: 'public' }) middleware runs first and
// attaches req.kycUpload.  validatePublicFormToken middleware (in the route file)
// must run before the upload middleware and sets req.employeeId.
//
// The employeeId is ALWAYS taken from req.employeeId (set by the token middleware) —
// client-supplied employeeId values are never trusted.
//
// Multipart form fields expected:
//   file         — the file part (fieldname must be "file")
//   token        — public form token (consumed by validatePublicFormToken before
//                  this middleware runs — included here for documentation only)
//   documentType — one of VALID_TYPES
exports.publicUploadDocument = async (req, res) => {
    try {
        const employeeId = req.employeeId; // set by validatePublicFormToken — never from client body
        if (!employeeId) {
            // Defensive: middleware should have already rejected the request.
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const { buffer, originalFileName, mimeType, fileSize, documentType, ext } = req.kycUpload;

        // ── Generate storage key ──
        const storageKey = buildStorageKey(employeeId, documentType, ext);

        // ── Upload buffer to B2 ──
        let uploadErr = null;
        try {
            const client  = getR2Client();
            const command = new PutObjectCommand({
                Bucket:        BUCKET_NAME(),
                Key:           storageKey,
                Body:          buffer,
                ContentType:   mimeType,
                ContentLength: fileSize,
            });
            await client.send(command);
        } catch (b2Err) {
            console.error('[KYC] publicUploadDocument — B2 PutObject failed:', b2Err);
            uploadErr = b2Err;
        }

        if (uploadErr) {
            return res.status(502).json({ error: 'File upload to storage failed. Please try again.' });
        }

        // ── Mark any existing active record for this type as superseded ──
        const previous = await EmployeeKycDocument.findOneAndUpdate(
            { employeeId, documentType, superseded: false },
            { $set: { superseded: true } },
            { new: false, sort: { uploadedAt: -1 } }
        );

        // ── Create the new metadata record ──
        const typeMeta = getDocTypeMeta(documentType);
        const newDoc = await EmployeeKycDocument.create({
            employeeId,
            documentType,
            storageKey,
            originalFileName,
            mimeType,
            fileSize,
            uploadedBy:   employeeId,  // same as employee in public-form context
            status:       'pending_review',
            isOptional:   typeMeta ? typeMeta.isOptional : false,
            supersedesId: previous ? previous._id : null,
            superseded:   false,
        });

        res.status(201).json({
            message:  'Document uploaded successfully and is pending review.',
            document: sanitizeDoc(newDoc.toObject()),
        });
    } catch (err) {
        console.error('[KYC] publicUploadDocument error:', err);
        res.status(500).json({ error: 'Failed to upload document.' });
    }
};

// ─── Private helpers ──────────────────────────────────────────────────────────
// Strip the storageKey before sending to clients — presigned URLs are generated
// on demand through the /view endpoint. The key itself must never be exposed.
function sanitizeDoc(doc) {
    const { storageKey: _s, ...rest } = doc; // eslint-disable-line no-unused-vars
    return rest;
}
