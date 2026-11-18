// backend/models/EmployeeKycDocument.js
// Metadata-only record for employee KYC/compliance documents stored in Cloudflare R2.
// The actual file bytes live in R2; MongoDB holds only a few hundred bytes per record.
//
// Re-uploads create a NEW record with supersedesId pointing to the previous one —
// the old record is NEVER deleted so there is always a full audit trail.
const mongoose = require('mongoose');

// ─── Document type catalogue ──────────────────────────────────────────────────
const KYC_DOCUMENT_TYPES = [
    // Always required
    { key: 'aadhaar',                 label: 'Aadhaar Card',               isOptional: false },
    { key: 'pan',                     label: 'PAN Card',                   isOptional: false },
    { key: 'educational_certificate', label: 'Educational Certificates',   isOptional: false },
    // One document from each pair is required (orGroup)
    { key: 'utility_bill',            label: 'Utility Bill',               isOptional: false, orGroup: 'address_proof' },
    { key: 'rent_agreement',          label: 'Rent Agreement',             isOptional: false, orGroup: 'address_proof' },
    { key: 'salary_slip',             label: 'Salary Slips',               isOptional: false, orGroup: 'income_proof' },
    { key: 'bank_statement',          label: 'Bank Statements',            isOptional: false, orGroup: 'income_proof' },
    { key: 'bank_details',            label: 'Bank Details',               isOptional: false, orGroup: 'bank_proof' },
    { key: 'cancelled_cheque',        label: 'Cancelled Cheque',           isOptional: false, orGroup: 'bank_proof' },
    // Optional
    { key: 'passport',                label: 'Passport',                   isOptional: true },
    { key: 'driving_license',         label: "Driver's License",           isOptional: true },
    { key: 'relieving_letter',        label: 'Relieving Letter',           isOptional: true },
    { key: 'experience_letter',       label: 'Experience Letter',          isOptional: true },
];

const VALID_TYPES = KYC_DOCUMENT_TYPES.map((d) => d.key);

const employeeKycDocumentSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    documentType: {
        type: String,
        enum: VALID_TYPES,
        required: true,
        index: true,
    },

    // R2 object key (e.g. "kyc/{employeeId}/{documentType}/{uuid}.pdf")
    // Never expose this to clients — only the backend generates presigned URLs from it.
    storageKey: {
        type: String,
        required: true,
    },

    originalFileName: { type: String, required: true },
    mimeType:         { type: String, required: true },
    fileSize:         { type: Number, required: true }, // bytes

    uploadedAt: { type: Date, default: Date.now, index: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    status: {
        type: String,
        enum: ['pending_review', 'verified', 'rejected'],
        default: 'pending_review',
        index: true,
    },

    // Set when an Admin/HR verifies the document
    verifiedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt:  { type: Date, default: null },

    // Set when an Admin/HR rejects the document
    rejectionReason: { type: String, default: '' },

    // True for passport, driving_license, relieving_letter, experience_letter
    isOptional: { type: Boolean, required: true },

    // When an employee re-uploads a document type, the new record points here.
    // The old record is preserved for audit; only records with supersedesId === null
    // (or the most recent chain head) are treated as "current".
    supersedesId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmployeeKycDocument',
        default: null,
    },

    // True if a newer record has been uploaded that supersedes this one.
    // Updated by the confirm-upload endpoint.
    superseded: { type: Boolean, default: false, index: true },
}, {
    timestamps: true,
});

employeeKycDocumentSchema.index({ employeeId: 1, documentType: 1, superseded: 1, uploadedAt: -1 });
employeeKycDocumentSchema.index({ status: 1, uploadedAt: -1 });

const EmployeeKycDocument = mongoose.model('EmployeeKycDocument', employeeKycDocumentSchema);

module.exports = { EmployeeKycDocument, KYC_DOCUMENT_TYPES, VALID_TYPES };
