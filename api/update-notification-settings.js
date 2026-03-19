// Script to set notification settings to "all on" for all users
// Run once to default every user to all notifications enabled (email + in-app for all types)
import { prisma } from './_lib/prisma.js';

const ALL_ON = {
    emailMentions: true,
    emailComments: true,
    emailTasks: true,
    emailInvoices: true,
    emailSystem: true,
    inAppMentions: true,
    inAppComments: true,
    inAppTasks: true,
    inAppInvoices: true,
    inAppSystem: true
};

async function updateNotificationSettings() {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true }
        });
        let updated = 0;
        let created = 0;

        for (const user of users) {
            try {
                const existing = await prisma.notificationSetting.findUnique({
                    where: { userId: user.id }
                });
                if (existing) {
                    await prisma.notificationSetting.update({
                        where: { userId: user.id },
                        data: ALL_ON
                    });
                    updated++;
                } else {
                    await prisma.notificationSetting.create({
                        data: { userId: user.id, ...ALL_ON }
                    });
                    created++;
                }
            } catch (error) {
                console.error(`❌ Failed for user ${user.name || user.email} (${user.id}):`, error.message);
            }
        }

        console.log(`✅ Notification settings: ${updated} updated, ${created} created (all on).`);
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










