// backend/middleware/uploadITSupportImageGridFS.js
// IT Support ticket image upload: GridFS storage (MongoDB)
// Supports: images (JPEG, JPG, PNG, GIF, WEBP)
// Max file size: 500KB per image
// Multiple image upload support

const busboy = require('busboy');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

// SAFE LAZY INITIALIZATION - GridFSBucket
let bucket;

function getBucket() {
    if (!bucket) {
        if (!mongoose.connection || !mongoose.connection.db) {
            throw new Error("MongoDB not connected yet");
        }
        
        bucket = new mongoose.mongo.GridFSBucket(
            mongoose.connection.db,
            { bucketName: "itSupportImages" }
        );
    }
    
    return bucket;
}

// UUID generation function
const uuidv4 = () => {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    } else {
        return crypto.randomBytes(16).toString('hex');
    }
};

const FILE_SIZE_LIMIT = 500 * 1024; // 500KB per image
const ALLOWED_EXT = /\.(jpeg|jpg|png|gif|webp)$/i;
const ALLOWED_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/i;

function checkFileType(originalname, mimetype) {
    const extOk = ALLOWED_EXT.test(path.extname(originalname || ''));
    const mimeOk = ALLOWED_MIME.test(mimetype || '');
    return extOk && mimeOk;
}

/**
 * Upload image to GridFS
 */
async function uploadToGridFS(buffer, originalName, mimetype, userId) {
    try {
        const bucket = getBucket();
        
        // Generate secure filename
        const ext = path.extname(originalName) || '.jpg';
        const filename = `it-support-${uuidv4()}${ext}`;
        
        // Upload to GridFS
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: mimetype,
            metadata: {
                originalName: originalName,
                uploadedBy: userId,
                uploadedAt: new Date(),
                fileSize: buffer.length,
                type: 'it_support_image'
            }
        });
        
        return new Promise((resolve, reject) => {
            uploadStream.on('finish', () => {
                console.log('[IT Support Image] GridFS upload complete:', {
                    fileId: uploadStream.id,
                    filename: filename,
                    size: buffer.length
                });
                resolve({
                    fileId: uploadStream.id,
                    filename: filename,
                    originalName: originalName,
                    mimetype: mimetype,
                    size: buffer.length
                });
            });
            
            uploadStream.on('error', (error) => {
                console.error('[IT Support Image] GridFS upload error:', error);
                reject(new Error('Failed to upload image to GridFS'));
            });
            
            uploadStream.end(buffer);
        });
        
    } catch (error) {
        console.error('[IT Support Image] GridFS error:', error);
        throw new Error(`GridFS upload failed: ${error.message}`);
    }
}

/**
 * Express middleware: parse multipart/form-data for IT Support images
 * Supports multiple images (up to 5 images per ticket)
 * Sets req.uploadedImages = [{ fileId, filename, originalName, mimetype, size }]
 */
function uploadITSupportImageGridFS(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    
    if (!req.user || (!req.user.userId && !req.user._id)) {
        console.error('[IT Support Image Upload] Authentication check failed. req.user:', req.user);
        return res.status(401).json({ error: 'Authentication required.' });
    }

    console.log('[IT Support Image Upload] Starting GridFS upload for user:', req.user.userId || req.user._id);

    const uploadedImages = [];
    const imageBuffers = []; // Store image data temporarily
    const formFields = {}; // Store other form fields
    let rejected = false;
    const MAX_IMAGES = 5;

    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        console.error('[IT Support Image Upload] Error:', message);
        res.status(status).json({ error: message });
    }

    const bb = busboy({ headers: { 'content-type': contentType } });

    // Handle regular form fields (category, title, description, etc.)
    bb.on('field', (fieldname, value) => {
        formFields[fieldname] = value;
    });

    bb.on('file', (fieldname, file, info) => {
        if (fieldname !== 'images') {
            file.resume();
            return;
        }

        // Check max images limit
        if (imageBuffers.length >= MAX_IMAGES) {
            sendError(400, `Maximum ${MAX_IMAGES} images allowed per ticket.`);
            file.destroy();
            return;
        }

        const originalname = info.filename || 'unknown';
        const mimetype = info.mimeType || 'application/octet-stream';
        
        if (!checkFileType(originalname, mimetype)) {
            sendError(400, `Invalid file type: ${originalname}. Only images (JPEG, PNG, GIF, WEBP) are allowed.`);
            file.destroy();
            return;
        }

        const chunks = [];
        let totalSize = 0;

        file.on('data', (chunk) => {
            if (rejected) return;
            totalSize += chunk.length;
            if (totalSize > FILE_SIZE_LIMIT) {
                sendError(400, `Image ${originalname} exceeds 500KB limit.`);
                file.destroy();
                return;
            }
            chunks.push(chunk);
        });

        file.on('end', () => {
            if (rejected) return;
            
            const buffer = Buffer.concat(chunks);
            imageBuffers.push({
                buffer,
                originalName: originalname,
                mimetype,
                size: totalSize
            });
        });

        file.on('error', () => {
            if (!rejected) sendError(500, 'Error reading uploaded image.');
        });
    });

    bb.on('finish', async () => {
        if (rejected) return;
        
        // Attach form fields to request body
        req.body = { ...req.body, ...formFields };

        // If no images, just continue (images are optional)
        if (imageBuffers.length === 0) {
            req.uploadedImages = [];
            return next();
        }

        try {
            const userId = req.user._id || req.user.userId;
            
            // Upload all images to GridFS
            const uploadPromises = imageBuffers.map(imageData =>
                uploadToGridFS(
                    imageData.buffer,
                    imageData.originalName,
                    imageData.mimetype,
                    userId
                )
            );
            
            const results = await Promise.all(uploadPromises);
            
            console.log('[IT Support Image Upload] Successfully processed', results.length, 'image(s) to GridFS');
            
            req.uploadedImages = results;
            next();
            
        } catch (error) {
            console.error('[IT Support Image Upload] GridFS upload error:', error);
            sendError(500, error.message || 'Failed to upload images to GridFS');
        }
    });

    bb.on('error', (err) => {
        console.error('[IT Support Image Upload] Busboy error:', err);
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });

    req.pipe(bb);
}

module.exports = uploadITSupportImageGridFS;
module.exports.getBucket = getBucket;
