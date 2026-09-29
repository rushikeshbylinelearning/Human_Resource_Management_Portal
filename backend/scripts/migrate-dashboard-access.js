// backend/scripts/migrate-dashboard-access.js
/**
 * Migration script to add dashboardAccess field to all existing users
 * 
 * Rules:
 * - Admin users: { hr: true, it: true }
 * - HR users: { hr: true, it: false }
 * - Other users: { hr: false, it: false }
 * 
 * Also adds canManageITSupport permission field
 * 
 * Run: node backend/scripts/migrate-dashboard-access.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found in environment variables');
    process.exit(1);
}

async function migrateDashboardAccess() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Get all users
        const users = await User.find({}).select('_id employeeCode fullName role dashboardAccess featurePermissions');
        console.log(`\n📊 Found ${users.length} users to migrate\n`);

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const user of users) {
            try {
                let needsUpdate = false;
                const updates = {};

                // Check if dashboardAccess field exists and is properly structured
                if (!user.dashboardAccess || typeof user.dashboardAccess !== 'object') {
                    needsUpdate = true;
                    
                    // Set dashboard access based on role
                    if (user.role === 'Admin') {
                        updates.dashboardAccess = { hr: true, it: true };
                    } else if (user.role === 'HR') {
                        updates.dashboardAccess = { hr: true, it: false };
                    } else {
                        updates.dashboardAccess = { hr: false, it: false };
                    }
                } else {
                    // Check if fields exist within dashboardAccess
                    if (user.dashboardAccess.hr === undefined || user.dashboardAccess.it === undefined) {
                        needsUpdate = true;
                        updates.dashboardAccess = {
                            hr: user.role === 'Admin' || user.role === 'HR' ? true : false,
                            it: user.role === 'Admin' ? true : false
                        };
                    }
                }

                // Check if featurePermissions.canManageITSupport exists
                if (!user.featurePermissions) {
                    needsUpdate = true;
                    updates.featurePermissions = {
                        canManageITSupport: user.role === 'Admin' ? true : false
                    };
                } else if (user.featurePermissions.canManageITSupport === undefined) {
                    needsUpdate = true;
                    updates['featurePermissions.canManageITSupport'] = user.role === 'Admin' ? true : false;
                }

                if (needsUpdate) {
                    await User.updateOne({ _id: user._id }, { $set: updates });
                    updatedCount++;
                    console.log(`✅ Updated: ${user.employeeCode} - ${user.fullName} (${user.role})`);
                    
                    if (updates.dashboardAccess) {
                        console.log(`   Dashboard Access: HR=${updates.dashboardAccess.hr}, IT=${updates.dashboardAccess.it}`);
                    }
                } else {
                    skippedCount++;
                    console.log(`⏭️  Skipped: ${user.employeeCode} - ${user.fullName} (already migrated)`);
                }
            } catch (error) {
                errorCount++;
                console.error(`❌ Error updating user ${user.employeeCode}:`, error.message);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('📈 Migration Summary:');
        console.log('='.repeat(60));
        console.log(`✅ Updated: ${updatedCount} users`);
        console.log(`⏭️  Skipped: ${skippedCount} users (already had dashboardAccess)`);
        console.log(`❌ Errors: ${errorCount} users`);
        console.log('='.repeat(60));

        // Verify migration
        console.log('\n🔍 Verifying migration...');
        const adminUsers = await User.countDocuments({ 
            role: 'Admin',
            'dashboardAccess.hr': true,
            'dashboardAccess.it': true
        });
        
        const hrUsers = await User.countDocuments({ 
            role: 'HR',
            'dashboardAccess.hr': true,
            'dashboardAccess.it': false
        });

        const totalWithDashboardAccess = await User.countDocuments({
            dashboardAccess: { $exists: true }
        });

        console.log(`\n✅ Admin users with both dashboards: ${adminUsers}`);
        console.log(`✅ HR users with HR dashboard: ${hrUsers}`);
        console.log(`✅ Total users with dashboardAccess field: ${totalWithDashboardAccess}/${users.length}`);

        if (totalWithDashboardAccess === users.length) {
            console.log('\n🎉 Migration completed successfully!');
        } else {
            console.log('\n⚠️  Warning: Some users may not have been migrated correctly');
        }

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('\n👋 Database connection closed');
        process.exit(0);
    }
}

// Run migration
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║       Dashboard Access Migration Script                 ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

migrateDashboardAccess();
