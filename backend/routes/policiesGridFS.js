// backend/routes/policiesGridFS.js
// SECURE POLICY ROUTES - GridFS Implementation
// Features:
// - GridFS storage (no filesystem dependency)
// - JWT-based authentication (Authorization header)
// - Secure PDF streaming
// - No cookie dependency
// - Admin-only upload/delete
// - All users can view

const express = require('express');
const router = express.Router();
const Policy = require('../models/Policy');
const AnonymousFeedback = require('../models/AnonymousFeedback');
const authenticateToken = require('../middleware/authenticateToken');
const uploadPolicyGridFS = require('../middleware/uploadPolicyGridFS');
const NewNotificationService = require('../services/NewNotificationService');
const User = require('../models/User');
const { getPolicyBucket } = require('../db');
const mongoose = require('mongoose');

async function annotatePolicyFileAvailability(policies) {
    if (!policies?.length) return policies;

    const bucket = getPolicyBucket();
    const fileIds = [
        ...new Set(
            policies
                .filter((p) => p.fileId && p.sourceKind !== 'consent_template')
                .map((p) => String(p.fileId))
        ),
    ];

    const existing = new Set();
    await Promise.all(
        fileIds.map(async (id) => {
            try {
                const found = await bucket
                    .find({ _id: new mongoose.Types.ObjectId(id) })
                    .limit(1)
                    .toArray();
                if (found?.length) existing.add(id);
            } catch (_) {
                // treat as missing
            }
        })
    );

    return policies.map((p) => {
        if (!p.fileId || p.sourceKind === 'consent_template') {
            return { ...p, fileMissing: false };
        }
        return { ...p, fileMissing: !existing.has(String(p.fileId)) };
    });
}

// Get all policies (accessible by all authenticated users)
router.get('/', authenticateToken, async (req, res) => {
    try {
        const policies = await Policy.find()
            .sort({ effectiveFrom: -1, createdAt: -1 })
            .select('-__v')
            .lean();

        const enriched = await annotatePolicyFileAvailability(policies);
        res.json({ policies: enriched });
    } catch (error) {
        console.error('Error fetching policies:', error);
        res.status(500).json({ error: 'Failed to fetch policies' });
    }
});

// Get active policies only
router.get('/active', authenticateToken, async (req, res) => {
    try {
        const policies = await Policy.find({ status: 'Active' })
            .sort({ effectiveFrom: -1 })
            .select('-__v')
            .lean();

        res.json({ policies });
    } catch (error) {
        console.error('Error fetching active policies:', error);
        res.status(500).json({ error: 'Failed to fetch active policies' });
    }
});

// Stream policy PDF securely from GridFS
router.get('/:id/file', authenticateToken, async (req, res) => {
    try {
        console.log('================== PDF REQUEST START ==================');
        console.log('[Policy PDF] Request received for policy:', req.params.id);
        console.log('[Policy PDF] User authenticated:', req.user.email);
        console.log('[Policy PDF] Request headers:', {
            accept: req.headers.accept,
            userAgent: req.headers['user-agent']?.substring(0, 50)
        });
        
        const policy = await Policy.findById(req.params.id);
        if (!policy) {
            console.error('[Policy PDF] Policy not found:', req.params.id);
            return res.status(404).json({ error: 'Policy not found' });
        }
        
        if (!policy.fileId) {
            console.error('[Policy PDF] Policy has no fileId:', req.params.id);
            return res.status(404).json({ error: 'Policy file not found' });
        }
        
        const policyBucket = getPolicyBucket();
        const fileObjectId = new mongoose.Types.ObjectId(policy.fileId);
        
        // First, verify the file exists in GridFS and get metadata
        const files = await policyBucket.find({ _id: fileObjectId }).toArray();
        if (!files || files.length === 0) {
            console.error('[Policy PDF] File not found in GridFS:', policy.fileId);
            return res.status(404).json({ error: 'File not found in storage' });
        }
        
        const file = files[0];
        console.log('[Policy PDF] File found in GridFS:', {
            id: policy.fileId,
            length: file.length,
            filename: file.filename,
            contentType: file.contentType
        });
        
        // Set proper filename for Content-Disposition
        const safePolicyName = (policy.name || 'policy').replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `${safePolicyName}_v${policy.version || '1.0'}.pdf`;
        
        // Set security and content headers BEFORE streaming
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="${filename}"`);
        res.set('Content-Length', file.length.toString());
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'SAMEORIGIN');
        
        // Create download stream from GridFS
        const downloadStream = policyBucket.openDownloadStream(fileObjectId);
        
        // Handle stream errors
        downloadStream.on('error', (error) => {
            console.error('[Policy PDF] Stream error:', error);
            // Can't send JSON after headers are sent, just end the response
            if (!res.headersSent) {
                res.status(500).end();
            } else {
                res.end();
            }
        });
        
        downloadStream.on('end', () => {
            console.log('[Policy PDF] ✅ Stream complete for:', policy.name);
            console.log('================== PDF REQUEST END (SUCCESS) ==================');
        });
        
        // Pipe the stream to response
        downloadStream.pipe(res);
        
    } catch (error) {
        console.error('================== PDF REQUEST ERROR ==================');
        console.error('[Policy PDF] Error:', error);
        console.error('[Policy PDF] Stack:', error.stack);
        console.error('========================================================');
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to load PDF', details: error.message });
        } else {
            res.end();
        }
    }
});

// Upload new policy (Admin only)
router.post('/upload', authenticateToken, uploadPolicyGridFS, async (req, res) => {
    try {
        if (!req.policyUpload) {
            return res.status(400).json({ error: 'File upload failed' });
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

        const policy = new Policy({
            name,
            version: policyVersion,
            effectiveFrom: new Date(effectiveFrom),
            department: department || '',
            status: status || 'Active',
            fileId: req.policyUpload.fileId,
            fileName: req.policyUpload.originalFilename,
            fileSize: req.policyUpload.size,
            uploadedBy: req.user.userId
        });

        await policy.save();
        console.log(`✅ Policy saved successfully: ${policy._id}`);

        // Send response first
        res.status(201).json({
            message: 'Policy uploaded successfully',
            policy
        });

        // Notify all active users asynchronously
        setImmediate(async () => {
            try {
                console.log(`🔔 Starting notification process for policy: ${name}`);
                const allUsers = await User.find({ status: 'Active' }).select('_id fullName');
                console.log(`📋 Found ${allUsers.length} active users to notify`);
                
                if (allUsers.length === 0) {
                    console.warn('⚠️ No active users found to notify');
                    return;
                }
                
                let successCount = 0;
                let errorCount = 0;
                
                for (const user of allUsers) {
                    try {
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
                    } catch (err) {
                        errorCount++;
                        console.error(`❌ Error sending notification to ${user.fullName}:`, err);
                    }
                }
                
                console.log(`✅ Notifications complete: ${successCount} sent, ${errorCount} failed`);
            } catch (notifError) {
                console.error('❌ Critical error in notification process:', notifError);
            }
        });
    } catch (error) {
        console.error('Error uploading policy:', error);
        res.status(500).json({ error: 'Failed to upload policy' });
    }
});

// Replace policy (Admin only)
router.post('/:id/replace', authenticateToken, uploadPolicyGridFS, async (req, res) => {
    try {
        if (!req.policyUpload) {
            return res.status(400).json({ error: 'File upload failed' });
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

        // Create new policy version
        const newPolicy = new Policy({
            name: name || oldPolicy.name,
            version: policyVersion,
            effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
            department: department || oldPolicy.department,
            status: status || 'Active',
            fileId: req.policyUpload.fileId,
            fileName: req.policyUpload.originalFilename,
            fileSize: req.policyUpload.size,
            uploadedBy: req.user.userId
        });

        await newPolicy.save();

        // Archive old policy
        oldPolicy.status = 'Archived';
        oldPolicy.replacedBy = newPolicy._id;
        await oldPolicy.save();
        
        // Delete old file from GridFS
        try {
            const policyBucket = getPolicyBucket();
            await policyBucket.delete(new mongoose.Types.ObjectId(oldPolicy.fileId));
            console.log(`✅ Deleted old policy file from GridFS: ${oldPolicy.fileId}`);
        } catch (deleteError) {
            console.warn('⚠️ Could not delete old policy file:', deleteError.message);
        }
        
        console.log(`✅ Policy updated successfully: ${newPolicy._id}`);

        // Send response first
        res.json({
            message: 'Policy replaced successfully',
            policy: newPolicy
        });

        // Notify all active users asynchronously
        setImmediate(async () => {
            try {
                console.log(`🔔 Starting notification for policy update: ${newPolicy.name}`);
                const allUsers = await User.find({ status: 'Active' }).select('_id fullName');
                console.log(`📋 Found ${allUsers.length} active users to notify`);
                
                if (allUsers.length === 0) return;
                
                let successCount = 0;
                let errorCount = 0;
                
                for (const user of allUsers) {
                    try {
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
                    } catch (err) {
                        errorCount++;
                        console.error(`❌ Error sending update notification to ${user.fullName}:`, err);
                    }
                }
                
                console.log(`✅ Update notifications complete: ${successCount} sent, ${errorCount} failed`);
            } catch (notifError) {
                console.error('❌ Critical error in notification process:', notifError);
            }
        });
    } catch (error) {
        console.error('Error replacing policy:', error);
        res.status(500).json({ error: 'Failed to replace policy' });
    }
});

// Delete policy (Admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can delete policies' });
        }

        const policy = await Policy.findById(req.params.id);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        // Delete file from GridFS
        try {
            const policyBucket = getPolicyBucket();
            await policyBucket.delete(new mongoose.Types.ObjectId(policy.fileId));
            console.log(`✅ Deleted policy file from GridFS: ${policy.fileId}`);
        } catch (error) {
            console.error('Error deleting file from GridFS:', error);
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

        res.status(201).json({
            message: 'Feedback submitted successfully'
        });

        setImmediate(async () => {
            try {
                console.log('🔔 Triggering anonymous feedback notification');
                await NewNotificationService.notifyAnonymousFeedback(
                    message.trim(),
                    feedback.submittedAt
                );
            } catch (notifError) {
                console.error('❌ Error sending anonymous feedback notification:', notifError);
            }
        });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ error: 'Failed to submit feedback' });
    }
});

// Get all anonymous feedback (Admin only)
router.get('/anonymous-feedback', authenticateToken, async (req, res) => {
    try {
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
router.delete('/anonymous-feedback/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can delete feedback' });
        }

        const { id } = req.params;
        
        const feedback = await AnonymousFeedback.findByIdAndDelete(id);
        
        if (!feedback) {
            return res.status(404).json({ error: 'Feedback not found' });
        }

        console.log(`✅ Anonymous feedback deleted by admin: ${req.user.email}`);
        res.json({ message: 'Feedback deleted successfully' });
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).json({ error: 'Failed to delete feedback' });
    }
});

module.exports = router;
