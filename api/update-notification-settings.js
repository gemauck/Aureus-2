// Script to update notification settings for all users
// Enables emailTasks by default for all existing users
import { prisma } from './_lib/prisma.js';

async function updateNotificationSettings() {
    try {
        
        // Get all users
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true }
        });
        
        
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
                        updated++;
                    } else {
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
                    created++;
                }
            } catch (error) {
                console.error(`❌ Failed to update notification settings for user ${user.name || user.email} (${user.id}):`, error.message);
            }
        }
        
        
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
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });









