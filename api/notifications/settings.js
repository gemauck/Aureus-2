// Notification Settings API endpoint
import { authRequired } from '../_lib/authRequired.js'
import { prisma } from '../_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from '../_lib/response.js'
import { withHttp } from '../_lib/withHttp.js'
import { withLogging } from '../_lib/logger.js'
import { parseJsonBody } from '../_lib/body.js'

async function handler(req, res) {
    const userId = req.user?.id;
    
    if (!userId) {
        return unauthorized(res, 'Authentication required');
    }

    if (req.method === 'GET') {
        try {
            // Get user's notification settings
            let settings = await prisma.notificationSetting.findUnique({
                where: { userId }
            });
            
            // If no settings exist, create default ones
            if (!settings) {
                settings = await prisma.notificationSetting.create({
                    data: { userId }
                });
            }
            
            return ok(res, { settings });
        } catch (error) {
            console.error('Get notification settings error:', error);
            return serverError(res, 'Failed to get notification settings', error.message);
        }
    }
    
    if (req.method === 'PUT') {
        try {
            const body = req.body || await parseJsonBody(req);
            const {
                emailMentions,
                emailComments,
                emailTasks,
                emailInvoices,
                emailSystem,
                inAppMentions,
                inAppComments,
                inAppTasks,
                inAppInvoices,
                inAppSystem
            } = body;
            
            // Update settings (upsert)
            const settings = await prisma.notificationSetting.upsert({
                where: { userId },
                update: {
                    emailMentions: emailMentions !== undefined ? emailMentions : undefined,
                    emailComments: emailComments !== undefined ? emailComments : undefined,
                    emailTasks: emailTasks !== undefined ? emailTasks : undefined,
                    emailInvoices: emailInvoices !== undefined ? emailInvoices : undefined,
                    emailSystem: emailSystem !== undefined ? emailSystem : undefined,
                    inAppMentions: inAppMentions !== undefined ? inAppMentions : undefined,
                    inAppComments: inAppComments !== undefined ? inAppComments : undefined,
                    inAppTasks: inAppTasks !== undefined ? inAppTasks : undefined,
                    inAppInvoices: inAppInvoices !== undefined ? inAppInvoices : undefined,
                    inAppSystem: inAppSystem !== undefined ? inAppSystem : undefined
                },
                create: {
                    userId,
                    emailMentions: emailMentions !== undefined ? emailMentions : true,
                    emailComments: emailComments !== undefined ? emailComments : false,
                    emailTasks: emailTasks !== undefined ? emailTasks : false,
                    emailInvoices: emailInvoices !== undefined ? emailInvoices : true,
                    emailSystem: emailSystem !== undefined ? emailSystem : true,
                    inAppMentions: inAppMentions !== undefined ? inAppMentions : true,
                    inAppComments: inAppComments !== undefined ? inAppComments : true,
                    inAppTasks: inAppTasks !== undefined ? inAppTasks : true,
                    inAppInvoices: inAppInvoices !== undefined ? inAppInvoices : true,
                    inAppSystem: inAppSystem !== undefined ? inAppSystem : true
                }
            });
            
            return ok(res, { settings });
        } catch (error) {
            console.error('Update notification settings error:', error);
            return serverError(res, 'Failed to update notification settings', error.message);
        }
    }
    
    return badRequest(res, 'Method not allowed');
}

export default withLogging(withHttp(authRequired(handler)));

