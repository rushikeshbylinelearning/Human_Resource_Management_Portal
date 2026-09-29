// Test script to diagnose PDF streaming issues
// Run with: node test-pdf-stream.js <policyId>

const mongoose = require('mongoose');
require('dotenv').config();

const Policy = require('./models/Policy');

async function testPdfStream(policyId) {
    try {
        console.log('Connecting to MongoDB...');
        const connectDB = require('./db');
        await connectDB();
        console.log('✅ Connected to MongoDB');

        console.log('\n📄 Testing Policy ID:', policyId);
        
        // Find the policy
        const policy = await Policy.findById(policyId);
        if (!policy) {
            console.error('❌ Policy not found');
            process.exit(1);
        }

        console.log('✅ Policy found:', {
            name: policy.name,
            version: policy.version,
            fileId: policy.fileId,
            fileName: policy.fileName,
            fileSize: policy.fileSize
        });

        if (!policy.fileId) {
            console.error('❌ Policy has no fileId!');
            process.exit(1);
        }

        // Check if file exists in GridFS
        const { getPolicyBucket } = require('./db');
        const policyBucket = getPolicyBucket();
        const fileObjectId = new mongoose.Types.ObjectId(policy.fileId);
        
        console.log('\n🔍 Checking GridFS for file:', policy.fileId);
        const files = await policyBucket.find({ _id: fileObjectId }).toArray();
        
        if (!files || files.length === 0) {
            console.error('❌ File NOT found in GridFS!');
            console.log('\n💡 The policy document references a fileId that does not exist in GridFS.');
            console.log('   This happens when:');
            console.log('   1. The file was deleted from GridFS but the policy record remains');
            console.log('   2. The fileId in the policy document is incorrect');
            console.log('   3. The database was restored from a backup without GridFS files');
            process.exit(1);
        }

        const file = files[0];
        console.log('✅ File found in GridFS:', {
            _id: file._id,
            filename: file.filename,
            length: file.length,
            contentType: file.contentType,
            uploadDate: file.uploadDate,
            metadata: file.metadata
        });

        // Verify it's a PDF
        if (file.contentType !== 'application/pdf') {
            console.warn('⚠️  WARNING: Content-Type is not application/pdf!');
            console.warn('   Content-Type:', file.contentType);
        }

        // Test streaming the file
        console.log('\n🔄 Testing stream...');
        const downloadStream = policyBucket.openDownloadStream(fileObjectId);
        
        let bytesRead = 0;
        let firstBytes = null;
        
        downloadStream.on('data', (chunk) => {
            bytesRead += chunk.length;
            if (!firstBytes && chunk.length > 0) {
                firstBytes = chunk.slice(0, Math.min(8, chunk.length));
            }
        });

        downloadStream.on('end', () => {
            console.log('✅ Stream completed successfully');
            console.log('   Bytes read:', bytesRead);
            console.log('   Expected bytes:', file.length);
            
            if (firstBytes) {
                const hex = Buffer.from(firstBytes).toString('hex');
                const isPdf = hex.startsWith('25504446'); // %PDF
                console.log('   First bytes (hex):', hex);
                console.log('   Is valid PDF:', isPdf ? '✅ YES' : '❌ NO - NOT A PDF!');
                
                if (!isPdf) {
                    console.log('\n❌ ERROR: The file in GridFS is not a valid PDF!');
                    console.log('   The file may be corrupted or was uploaded incorrectly.');
                }
            }
            
            if (bytesRead !== file.length) {
                console.warn('⚠️  WARNING: Bytes read does not match expected file length!');
            }
            
            console.log('\n✅ PDF streaming test PASSED');
            process.exit(0);
        });

        downloadStream.on('error', (error) => {
            console.error('❌ Stream error:', error);
            console.error('   This indicates a problem reading from GridFS');
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Get policy ID from command line
const policyId = process.argv[2];
if (!policyId) {
    console.error('Usage: node test-pdf-stream.js <policyId>');
    console.error('\nTo find policy IDs, run:');
    console.error('  mongo <your-db> --eval "db.policies.find({}, {_id:1, name:1}).pretty()"');
    process.exit(1);
}

testPdfStream(policyId);
