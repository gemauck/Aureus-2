// Script to update notification settings for all users
// Enables emailTasks by default for all existing users
import { prisma } from './_lib/prisma.js';

async function updateNotificationSettings() {
    try {
        console.log('🔄 Updating notification settings for all users...');
        
        // Get all users
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true }
        });
        
        console.log(`📊 Found ${users.length} users`);
        
        let updated = 0;
        let created = 0;
        
        for (const user of users) {
            try {
                // Check if user has notification settings
                const existingSettings = await prisma.notificationSetting.findUnique({
                    where: { userId: user.id }
                });
                
                if (existingSettings) {
                    // Update existing settings - enable emailTasks if it's false
                    if (!existingSettings.emailTasks) {
                        await prisma.notificationSetting.update({
                            where: { userId: user.id },
                            data: { emailTasks: true }
                        });
                        console.log(`✅ Updated notification settings for user ${user.name || user.email} (${user.id}) - enabled emailTasks`);
                        updated++;
                    } else {
                        console.log(`ℹ️ User ${user.name || user.email} already has emailTasks enabled`);
                    }
                } else {
                    // Create new settings with all notifications enabled
                    await prisma.notificationSetting.create({
                        data: {
                            userId: user.id,
                            emailTasks: true,
                            emailMentions: true,
                            emailComments: true,
                            emailInvoices: true,
                            emailSystem: true,
                            inAppTasks: true,
                            inAppMentions: true,
                            inAppComments: true,
                            inAppInvoices: true,
                            inAppSystem: true
                        }
                    });
                    console.log(`✅ Created notification settings for user ${user.name || user.email} (${user.id}) - all notifications enabled`);
                    created++;
                }
            } catch (error) {
                console.error(`❌ Failed to update notification settings for user ${user.name || user.email} (${user.id}):`, error.message);
            }
        }
        
        console.log(`\n✅ Update complete!`);
        console.log(`   - Updated: ${updated} users`);
        console.log(`   - Created: ${created} users`);
        console.log(`   - Total: ${users.length} users`);
        
    } catch (error) {
        console.error('❌ Error updating notification settings:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the update
updateNotificationSettings()
    .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });





