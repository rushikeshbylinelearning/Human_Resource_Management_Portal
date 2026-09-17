const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // For streaming
const Policy = require('../models/Policy');
const AnonymousFeedback = require('../models/AnonymousFeedback');
const requireAuth = require('../middleware/requireAuth');
const NewNotificationService = require('../services/NewNotificationService');
const User = require('../models/User');

// Configure multer for PDF uploads - SECURITY: Store in protected directory
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../storage/policies');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'policy-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// SECURITY: Authenticated PDF file serving with streaming and range support
router.get('/file/:filename', requireAuth, async (req, res) => {
    try {
        // TEMPORARY: Debug logging for cookie troubleshooting
        console.log('[PDF Route] Request received for:', req.params.filename);
        console.log('[PDF Route] Cookies:', req.cookies);
        console.log('[PDF Route] Authorization header:', req.headers.authorization ? 'present' : 'missing');
        console.log('[PDF Route] User authenticated:', req.user ? req.user.email : 'NO USER');
        
        const { filename } = req.params;

        // Prevent directory traversal attack
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            console.warn(`⚠️ Directory traversal attempt blocked: ${filename}`);
            return res.status(400).json({ error: 'Invalid file name' });
        }

        // Validate filename format (policy-timestamp-random.pdf)
        if (!/^policy-\d+-\d+\.pdf$/.test(filename)) {
            console.warn(`⚠️ Invalid filename format: ${filename}`);
            return res.status(400).json({ error: 'Invalid file name format' });
        }

        const filePath = path.join(__dirname, '../storage/policies', filename);

        // Check if file exists
        if (!fsSync.existsSync(filePath)) {
            console.error(`❌ File not found: ${filename}`);
            return res.status(404).json({ error: 'File not found' });
        }

        // Get file stats for size and range support
        const stat = fsSync.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        // Set security headers
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Content-Security-Policy', "default-src 'self'");

        // Support range requests for large PDFs (improves loading performance)
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;

            const file = fsSync.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Cache-Control': 'private, no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            file.pipe(res);
        } else {
            // Full file response
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'private, no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });

            const stream = fsSync.createReadStream(filePath);
            stream.pipe(res);
        }

        console.log(`✅ PDF served successfully: ${filename} to user: ${req.user.fullName || req.user.userId}`);
    } catch (error) {
        console.error('❌ PDF serve error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to load PDF' });
        }
    }
});

// Get all policies (accessible by all authenticated users)
router.get('/', requireAuth, async (req, res) => {
    try {
        const policies = await Policy.find({
            sourceKind: { $ne: 'consent_template' },
        })
            .sort({ effectiveFrom: -1, createdAt: -1 })
            .select('-__v')
            .lean();

        res.json({ policies });
    } catch (error) {
        console.error('Error fetching policies:', error);
        res.status(500).json({ error: 'Failed to fetch policies' });
    }
});

// Get active policies only
router.get('/active', requireAuth, async (req, res) => {
    try {
        const policies = await Policy.find({
            status: 'Active',
            sourceKind: { $ne: 'consent_template' },
        })
            .sort({ effectiveFrom: -1 })
            .select('-__v')
            .lean();

        res.json({ policies });
    } catch (error) {
        console.error('Error fetching active policies:', error);
        res.status(500).json({ error: 'Failed to fetch active policies' });
    }
});

// Upload new policy (Admin only)
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can upload policies' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'PDF file is required' });
        }

        const { name, version, effectiveFrom, department, status } = req.body;

        if (!name || !effectiveFrom) {
            return res.status(400).json({ error: 'Policy name and effective date are required' });
        }

        // Auto-generate version if requested
        let policyVersion = version;
        if (version === 'auto') {
            const latestPolicy = await Policy.findOne({ name })
                .sort({ createdAt: -1 })
                .select('version');
            
            if (latestPolicy) {
                const versionNum = parseFloat(latestPolicy.version) || 1.0;
                policyVersion = (versionNum + 0.1).toFixed(1);
            } else {
                policyVersion = '1.0';
            }
        }

        const fileUrl = `/api/policies/file/${req.file.filename}`;

        const policy = new Policy({
            name,
            version: policyVersion,
            effectiveFrom: new Date(effectiveFrom),
            department: department || '',
            status: status || 'Active',
            fileUrl,
            fileName: req.file.originalname,
            uploadedBy: req.user.userId || req.user._id
        });

        await policy.save();
        console.log(`✅ Policy saved successfully: ${policy._id}`);

        // Send response first to avoid blocking
        res.status(201).json({
            message: 'Policy uploaded successfully',
            policy
        });

        // Notify all active users about new policy (following the same pattern as check-in/break notifications)
        // Run asynchronously after response is sent
        setImmediate(async () => {
            try {
                console.log(`🔔 Starting notification process for policy: ${name}`);
                const allUsers = await User.find({ status: 'Active' }).select('_id fullName');
                console.log(`📋 Found ${allUsers.length} active users to notify about new policy: ${name}`);
                
                if (allUsers.length === 0) {
                    console.warn('⚠️ No active users found to notify');
                    return;
                }
                
                // Send notification to each user using NewNotificationService
                let successCount = 0;
                let errorCount = 0;
                
                for (const user of allUsers) {
                    try {
                        console.log(`📤 Sending notification to user: ${user.fullName} (${user._id})`);
                        await NewNotificationService.createAndEmitNotification({
                            message: `New policy "${name}" (v${policyVersion}) has been added. Click to view.`,
                            type: 'policy_added',
                            userId: user._id,
                            userName: user.fullName,
                            recipientType: 'user',
                            category: 'admin',
                            priority: 'high',
                            navigationData: {
                                page: 'profile',
                                params: { section: 'policies', policyId: policy._id.toString() }
                            },
                            metadata: {
                                policyId: policy._id.toString(),
                                policyName: name,
                                policyVersion: policyVersion,
                                fromAdmin: true
                            }
                        });
                        successCount++;
                        console.log(`✅ Notification sent successfully to ${user.fullName}`);
                    } catch (err) {
                        errorCount++;
                        console.error(`❌ Error sending policy notification to user ${user.fullName} (${user._id}):`, err);
                        console.error('Error stack:', err.stack);
                    }
                }
                
                console.log(`✅ Policy notifications complete: ${successCount} sent, ${errorCount} failed`);
            } catch (notifError) {
                console.error('❌ Critical error in notification process:', notifError);
                console.error('Error stack:', notifError.stack);
            }
        });
    } catch (error) {
        console.error('Error uploading policy:', error);
        // Clean up uploaded file if database save fails
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Failed to upload policy' });
    }
});

// Replace policy (Admin only)
router.post('/:id/replace', requireAuth, upload.single('file'), async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can replace policies' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'PDF file is required' });
        }

        const oldPolicy = await Policy.findById(req.params.id);
        if (!oldPolicy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        const { name, version, effectiveFrom, department, status } = req.body;

        // Auto-generate version
        let policyVersion = version;
        if (version === 'auto') {
            const versionNum = parseFloat(oldPolicy.version) || 1.0;
            policyVersion = (versionNum + 0.1).toFixed(1);
        }

        const fileUrl = `/api/policies/file/${req.file.filename}`;

        // Create new policy version
        const newPolicy = new Policy({
            name: name || oldPolicy.name,
            version: policyVersion,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
            department: department || oldPolicy.department,
            status: status || 'Active',
            fileUrl,
            fileName: req.file.originalname,
            uploadedBy: req.user.userId || req.user._id
        });

        await newPolicy.save();

        // Archive old policy
        oldPolicy.status = 'Archived';
        oldPolicy.replacedBy = newPolicy._id;
        await oldPolicy.save();
        console.log(`✅ Policy updated successfully: ${newPolicy._id}`);

        // Send response first to avoid blocking
        res.json({
            message: 'Policy replaced successfully',
            policy: newPolicy
        });

        // Notify all active users about policy update (following the same pattern as check-in/break notifications)
        // Run asynchronously after response is sent
        setImmediate(async () => {
            try {
                console.log(`🔔 Starting notification process for policy update: ${newPolicy.name}`);
                const allUsers = await User.find({ status: 'Active' }).select('_id fullName');
                console.log(`📋 Found ${allUsers.length} active users to notify about policy update: ${newPolicy.name}`);
                
                if (allUsers.length === 0) {
                    console.warn('⚠️ No active users found to notify');
                    return;
                }
                
                // Send notification to each user using NewNotificationService
                let successCount = 0;
                let errorCount = 0;
                
                for (const user of allUsers) {
                    try {
                        console.log(`📤 Sending update notification to user: ${user.fullName} (${user._id})`);
                        await NewNotificationService.createAndEmitNotification({
                            message: `Policy "${newPolicy.name}" has been updated to version ${policyVersion}. Click to view.`,
                            type: 'policy_updated',
                            userId: user._id,
                            userName: user.fullName,
                            recipientType: 'user',
                            category: 'admin',
                            priority: 'high',
                            navigationData: {
                                page: 'profile',
                                params: { section: 'policies', policyId: newPolicy._id.toString() }
                            },
                            metadata: {
                                policyId: newPolicy._id.toString(),
                                policyName: newPolicy.name,
                                policyVersion: policyVersion,
                                oldVersion: oldPolicy.version,
                                fromAdmin: true
                            }
                        });
                        successCount++;
                        console.log(`✅ Update notification sent successfully to ${user.fullName}`);
                    } catch (err) {
                        errorCount++;
                        console.error(`❌ Error sending policy update notification to user ${user.fullName} (${user._id}):`, err);
                        console.error('Error stack:', err.stack);
                    }
                }
                
                console.log(`✅ Policy update notifications complete: ${successCount} sent, ${errorCount} failed`);
            } catch (notifError) {
                console.error('❌ Critical error in notification process:', notifError);
                console.error('Error stack:', notifError.stack);
            }
        });
    } catch (error) {
        console.error('Error replacing policy:', error);
        // Clean up uploaded file if database save fails
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }
        res.status(500).json({ error: 'Failed to replace policy' });
    }
});

// Delete policy (Admin only)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can delete policies' });
        }

        const policy = await Policy.findById(req.params.id);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        // Delete file from filesystem (now in storage/policies)
        const filename = path.basename(policy.fileUrl);
        const filePath = path.join(__dirname, '../storage/policies', filename);
        try {
            await fs.unlink(filePath);
            console.log(`✅ File deleted: ${filename}`);
        } catch (error) {
            console.error('Error deleting file:', error);
        }

        await Policy.findByIdAndDelete(req.params.id);

        res.json({ message: 'Policy deleted successfully' });
    } catch (error) {
        console.error('Error deleting policy:', error);
        res.status(500).json({ error: 'Failed to delete policy' });
    }
});

// Submit anonymous feedback
router.post('/anonymous-feedback', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const feedback = new AnonymousFeedback({
            message: message.trim(),
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('user-agent')
        });

        await feedback.save();
        console.log('✅ Anonymous feedback saved successfully');

        // Send response immediately to avoid blocking the user
        res.status(201).json({
            message: 'Feedback submitted successfully'
        });

        // Notify admins/HR asynchronously after response is sent
        // CRITICAL: Only pass message content and timestamp - NO user identification
        setImmediate(async () => {
            try {
                console.log('🔔 Triggering anonymous feedback notification');
                await NewNotificationService.notifyAnonymousFeedback(
                    message.trim(),
                    feedback.submittedAt
                );
            } catch (notifError) {
                // Log error but don't fail the submission
                console.error('❌ Error sending anonymous feedback notification:', notifError);
            }
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

// Get all anonymous feedback (Admin only)
router.get('/anonymous-feedback', requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can view feedback' });
        }

        const feedback = await AnonymousFeedback.find()
            .sort({ submittedAt: -1 })
            .select('-__v')
            .lean();

        res.json({ feedback });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ error: 'Failed to fetch feedback' });
    }
});

// Delete anonymous feedback (Admin only)
router.delete('/anonymous-feedback/:id', requireAuth, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can delete feedback' });
        }

        const { id } = req.params;
        
        const feedback = await AnonymousFeedback.findByIdAndDelete(id);
        
        if (!feedback) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        console.log(`✅ Anonymous feedback deleted by admin: ${req.user.fullName}`);
        res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).json({ error: 'Failed to delete feedback' });
    }
});

module.exports = router;
