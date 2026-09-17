// backend/middleware/uploadTemplateImageGridFS.js
// Consent-wizard hero image upload — GridFS (policyFiles bucket).
// JPEG / PNG / GIF / WebP, 5MB cap, magic-number check. Admin or HR.

const busboy = require('busboy');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { getPolicyBucket } = require('../db');

const uuidv4 = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
};

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

const IMAGE_SIGNATURES = {
    'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
    'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
    'image/gif': [
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    ],
    'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
};

const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

function validateMagicNumbers(buffer, mimeType) {
    const signatures = IMAGE_SIGNATURES[mimeType];
    if (!signatures) return false;
    return signatures.some((signature) => {
        if (buffer.length < signature.length) return false;
        return buffer.slice(0, signature.length).equals(signature);
    });
}

async function uploadToGridFS(buffer, userId, contentType) {
    const bucket = getPolicyBucket();
    const ext = contentType === 'image/png' ? 'png'
              : contentType === 'image/gif' ? 'gif'
              : contentType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `template-hero-${userId}-${uuidv4()}.${ext}`;

    const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: {
            kind: 'heroImage',
            uploadedBy: userId,
            uploadedAt: new Date(),
            size: buffer.length,
        },
    });

    return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => resolve({ fileId: uploadStream.id, filename }));
        uploadStream.on('error', (err) => reject(new Error('Failed to upload to GridFS: ' + err.message)));
        uploadStream.end(buffer);
    });
}

async function deleteOldHeroImage(oldImageUrl) {
    if (!oldImageUrl || typeof oldImageUrl !== 'string') return;
    const match = oldImageUrl.match(/\/policy-templates\/hero-image\/([a-f0-9]{24})/i);
    if (!match) return;
    try {
        const bucket = getPolicyBucket();
        await bucket.delete(new mongoose.Types.ObjectId(match[1]));
    } catch (e) {
        console.warn('[Hero Image Upload] Could not delete previous image:', e.message);
    }
}

function uploadTemplateImageGridFS(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Service temporarily unavailable. Please retry.' });
    }

    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    const chunks = [];
    let mimetype = '';
    let totalSize = 0;
    let foundFile = false;
    let rejected = false;
    const formFields = {};

    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        res.status(status).json({ error: message });
    }

    let bb;
    try {
        bb = busboy({ headers: { 'content-type': contentType } });
    } catch (bbErr) {
        return res.status(400).json({ error: 'Invalid multipart request: ' + bbErr.message });
    }

    bb.on('field', (fieldname, value) => {
        formFields[fieldname] = value;
    });

    bb.on('file', (fieldname, file, info) => {
        if (fieldname !== 'heroImage') {
            file.resume();
            return;
        }
        foundFile = true;
        mimetype = info.mimeType || 'application/octet-stream';
        if (mimetype === 'image/jpg') mimetype = 'image/jpeg';
        if (!ALLOWED_MIMES.includes(mimetype)) {
            sendError(400, 'Invalid file type. Only JPEG, PNG, GIF, or WebP allowed.');
            file.destroy();
            return;
        }
        file.on('data', (chunk) => {
            if (rejected) return;
            totalSize += chunk.length;
            if (totalSize > FILE_SIZE_LIMIT) {
                sendError(400, 'File exceeds 5MB limit.');
                file.destroy();
                return;
            }
            chunks.push(chunk);
        });
        file.on('error', () => {
            if (!rejected) sendError(500, 'Error reading file.');
        });
        file.resume();
    });

    bb.on('finish', async () => {
        if (rejected) return;
        if (!foundFile || chunks.length === 0) return sendError(400, 'No file provided.');
        try {
            const buffer = Buffer.concat(chunks);
            const magicType = mimetype === 'image/jpg' ? 'image/jpeg' : mimetype;
            if (!validateMagicNumbers(buffer, magicType)) {
                return sendError(400, 'Invalid image: file signature mismatch.');
            }
            const gridfsResult = await uploadToGridFS(buffer, req.user.userId, magicType);
            await deleteOldHeroImage(formFields.oldImageUrl);
            req.templateImageUpload = {
                fileId: gridfsResult.fileId,
                filename: gridfsResult.filename,
                contentType: magicType,
                size: buffer.length,
            };
            next();
        } catch (error) {
            console.error('[Hero Image Upload] Error:', error);
            sendError(500, error.message || 'Failed to upload image.');
        }
    });

    bb.on('error', () => {
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });
    req.pipe(bb);
}

module.exports = uploadTemplateImageGridFS;
