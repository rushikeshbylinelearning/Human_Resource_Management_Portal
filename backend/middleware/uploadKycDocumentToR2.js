// backend/middleware/uploadKycDocumentToR2.js
//
// Busboy-based multipart middleware that:
//   1. Streams the uploaded file into memory (capped at MAX_FILE_SIZE bytes — stream
//      is aborted before that limit is exceeded so memory usage is bounded).
//   2. Validates document type, file extension, Content-Type header, and actual magic
//      bytes (PDF / JPEG / PNG signatures).
//   3. Does NOT touch B2/R2 — the controller performs the PutObjectCommand after this
//      middleware attaches validated buffer + metadata to req.kycUpload.
//
// On success, attaches to the request:
//   req.kycUpload = {
//     buffer        : Buffer          — validated file bytes
//     originalFileName: string        — original filename from the multipart part
//     mimeType      : string          — validated/normalised MIME type
//     fileSize      : number          — byte length
//     documentType  : string          — from body field, validated against VALID_TYPES
//     ext           : string          — lowercase extension incl. leading dot
//   }
//   req.body fields for any other form fields are available via req.kycFormFields.
//
// Pattern modelled on uploadEmployeeDocumentGridFS.js.
'use strict';

const busboy = require('busboy');
const { VALID_TYPES } = require('../models/EmployeeKycDocument');

// ─── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE        = 5 * 1024 * 1024; // 5 MB hard cap
const ALLOWED_EXTENSIONS   = ['.pdf', '.jpg', '.jpeg', '.png'];
const ALLOWED_MIME_TYPES   = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

// Magic-byte signatures for each allowed file type.
// Each entry: { mime: canonical-mime, ext: [allowed-extensions], sig: Buffer }
const MAGIC_SIGNATURES = [
    {
        label: 'PDF',
        sig:   Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
        mime:  'application/pdf',
        exts:  ['.pdf'],
    },
    {
        label: 'JPEG',
        sig:   Buffer.from([0xff, 0xd8, 0xff]),        // SOI marker
        mime:  'image/jpeg',
        exts:  ['.jpg', '.jpeg'],
    },
    {
        label: 'PNG',
        sig:   Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // \x89PNG\r\n\x1a\n
        mime:  'image/png',
        exts:  ['.png'],
    },
];

// Maps reported MIME types to their canonical form (image/jpg → image/jpeg).
const MIME_CANONICAL = {
    'application/pdf': 'application/pdf',
    'image/jpeg':      'image/jpeg',
    'image/jpg':       'image/jpeg',
    'image/png':       'image/png',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename = '') {
    const idx = filename.lastIndexOf('.');
    if (idx === -1) return '';
    return filename.slice(idx).toLowerCase();
}

/**
 * Detect magic-byte signature in the first bytes of a buffer.
 * Returns the matching entry from MAGIC_SIGNATURES, or null if no match.
 */
function detectSignature(buffer) {
    for (const entry of MAGIC_SIGNATURES) {
        if (buffer.length >= entry.sig.length &&
            buffer.slice(0, entry.sig.length).equals(entry.sig)) {
            return entry;
        }
    }
    return null;
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * uploadKycDocumentToR2(options)
 *
 * @param {object} options
 * @param {'authenticated'|'public'} options.context
 *   'authenticated' — requires req.user.userId (set by authenticateToken)
 *   'public'        — requires req.employeeId (set by validatePublicFormToken)
 *
 * Returns an Express middleware function.
 */
function uploadKycDocumentToR2({ context = 'authenticated' } = {}) {
    return function kycUploadMiddleware(req, res, next) {
        // ── Content-Type guard ──
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
        }

        // ── Auth guard ──
        if (context === 'authenticated' && !req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (context === 'public' && !req.employeeId) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const chunks          = [];
        let originalFileName  = '';
        let reportedMime      = '';
        let totalSize         = 0;
        let foundFile         = false;
        let rejected          = false;
        const formFields      = {};

        // Helper: send error exactly once, then stop processing.
        function sendError(status, message) {
            if (rejected) return;
            rejected = true;
            // Attempt to destroy the busboy instance so no further file data is buffered.
            try { bb.destroy(); } catch (_) { /* ignore */ }
            return res.status(status).json({ error: message });
        }

        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: {
                // Hard cap at the stream level — busboy will emit a 'filesLimit' or
                // truncate the file once this many bytes have been received on a single
                // part.  We also do a manual running-total check below for belt-and-
                // suspenders safety; busboy's own limit aborts the stream cleanly.
                fileSize: MAX_FILE_SIZE + 1, // +1 so we can detect oversized vs exact
                files:    1,
                fields:   10,
            },
        });

        // ── Field handler ──
        bb.on('field', (fieldname, value) => {
            formFields[fieldname] = value;
        });

        // ── File handler ──
        bb.on('file', (fieldname, file, info) => {
            // Only process the field named 'file'; ignore anything else.
            if (fieldname !== 'file') {
                file.resume();
                return;
            }

            foundFile        = true;
            originalFileName = info.filename || 'unknown';
            reportedMime     = (info.mimeType || 'application/octet-stream').toLowerCase();

            // ── Extension validation ──
            const ext = getExtension(originalFileName);
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                sendError(400, `File type not allowed. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`);
                file.destroy();
                return;
            }

            // ── Reported MIME validation ──
            const canonicalMime = MIME_CANONICAL[reportedMime];
            if (!canonicalMime) {
                sendError(400, `MIME type not allowed. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
                file.destroy();
                return;
            }

            // ── Collect chunks with running size check ──
            file.on('data', (chunk) => {
                if (rejected) return;
                totalSize += chunk.length;
                if (totalSize > MAX_FILE_SIZE) {
                    // Abort BEFORE buffering the oversized byte — do not push the chunk.
                    sendError(413, 'File size exceeds the 5 MB limit.');
                    file.destroy();
                    return;
                }
                chunks.push(chunk);
            });

            // busboy emits 'limit' on the file stream when fileSize limit is hit.
            file.on('limit', () => {
                if (!rejected) sendError(413, 'File size exceeds the 5 MB limit.');
            });

            file.on('error', () => {
                if (!rejected) sendError(500, 'Error reading uploaded file.');
            });
        });

        // ── Too many files ──
        bb.on('filesLimit', () => {
            if (!rejected) sendError(400, 'Only one file may be uploaded per request.');
        });

        // ── Finish: validate buffer and attach to request ──
        bb.on('finish', async () => {
            if (rejected) return;

            if (!foundFile || chunks.length === 0) {
                return sendError(400, 'No file provided. Please attach a file under the field name "file".');
            }

            // ── documentType from form fields ──
            const documentType = formFields.documentType || '';
            if (!VALID_TYPES.includes(documentType)) {
                return sendError(400, `Invalid documentType. Must be one of: ${VALID_TYPES.join(', ')}`);
            }

            const ext = getExtension(originalFileName);

            try {
                const buffer = Buffer.concat(chunks);

                // ── Magic-byte check ──
                const sigMatch = detectSignature(buffer);
                if (!sigMatch) {
                    return sendError(400, 'File content does not match any allowed format (PDF, JPEG, PNG).');
                }

                // ── Cross-check: magic-byte type must match reported MIME and extension ──
                const canonicalMime = MIME_CANONICAL[reportedMime];
                if (sigMatch.mime !== canonicalMime) {
                    return sendError(400,
                        `File content (${sigMatch.label}) does not match the reported MIME type (${reportedMime}).`
                    );
                }
                if (!sigMatch.exts.includes(ext)) {
                    return sendError(400,
                        `File extension (${ext}) does not match the detected file type (${sigMatch.label}).`
                    );
                }

                // ── Attach validated upload info to request ──
                req.kycUpload = {
                    buffer,
                    originalFileName,
                    mimeType:     sigMatch.mime,  // always the canonical/detected mime
                    fileSize:     buffer.length,
                    documentType,
                    ext,
                };
                req.kycFormFields = formFields;

                next();
            } catch (err) {
                console.error('[KYC Upload Middleware] Processing error:', err);
                sendError(500, 'Failed to process uploaded file.');
            }
        });

        bb.on('error', () => {
            if (!rejected) sendError(400, 'Invalid multipart request.');
        });

        req.pipe(bb);
    };
}

module.exports = uploadKycDocumentToR2;
