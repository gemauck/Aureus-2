// System Settings API endpoint
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { parseJsonBody } from './_lib/body.js'

async function handler(req, res) {
    // JWT payload uses 'sub' for user ID, not 'id'
    const userId = req.user?.sub || req.user?.id;
    
    if (!userId) {
        console.error('❌ System Settings: No user ID found in token. req.user =', req.user);
        return serverError(res, 'Authentication required', 'No user ID found');
    }

    if (req.method === 'GET') {
        try {
            // Get system settings (singleton record with id='system')
            let settings = await prisma.systemSettings.findUnique({
                where: { id: 'system' }
            });
            
            // If no settings exist, create default ones
            if (!settings) {
                settings = await prisma.systemSettings.create({
                    data: { id: 'system' }
                });
            }
            
            return ok(res, { settings });
        } catch (error) {
            console.error('Get system settings error:', error);
            return serverError(res, 'Failed to get system settings', error.message);
        }
    }
    
    if (req.method === 'PUT') {
        try {
            const body = req.body || await parseJsonBody(req);
            
            // Update system settings (upsert)
            const settings = await prisma.systemSettings.upsert({
                where: { id: 'system' },
                update: {
                    companyName: body.companyName !== undefined ? body.companyName : undefined,
                    timezone: body.timezone !== undefined ? body.timezone : undefined,
                    currency: body.currency !== undefined ? body.currency : undefined,
                    dateFormat: body.dateFormat !== undefined ? body.dateFormat : undefined,
                    language: body.language !== undefined ? body.language : undefined,
                    sessionTimeout: body.sessionTimeout !== undefined ? body.sessionTimeout : undefined,
                    requirePasswordChange: body.requirePasswordChange !== undefined ? body.requirePasswordChange : undefined,
                    twoFactorAuth: body.twoFactorAuth !== undefined ? body.twoFactorAuth : undefined,
                    auditLogging: body.auditLogging !== undefined ? body.auditLogging : undefined,
                    emailProvider: body.emailProvider !== undefined ? body.emailProvider : undefined,
                    googleCalendar: body.googleCalendar !== undefined ? body.googleCalendar : undefined,
                    quickbooks: body.quickbooks !== undefined ? body.quickbooks : undefined,
                    slack: body.slack !== undefined ? body.slack : undefined,
                    updatedBy: userId
                },
                create: {
                    id: 'system',
                    companyName: body.companyName !== undefined ? body.companyName : 'Abcotronics',
                    timezone: body.timezone !== undefined ? body.timezone : 'Africa/Johannesburg',
                    currency: body.currency !== undefined ? body.currency : 'ZAR',
                    dateFormat: body.dateFormat !== undefined ? body.dateFormat : 'DD/MM/YYYY',
                    language: body.language !== undefined ? body.language : 'en',
                    sessionTimeout: body.sessionTimeout !== undefined ? body.sessionTimeout : 30,
                    requirePasswordChange: body.requirePasswordChange !== undefined ? body.requirePasswordChange : false,
                    twoFactorAuth: body.twoFactorAuth !== undefined ? body.twoFactorAuth : false,
                    auditLogging: body.auditLogging !== undefined ? body.auditLogging : true,
                    emailProvider: body.emailProvider !== undefined ? body.emailProvider : 'gmail',
                    googleCalendar: body.googleCalendar !== undefined ? body.googleCalendar : false,
                    quickbooks: body.quickbooks !== undefined ? body.quickbooks : false,
                    slack: body.slack !== undefined ? body.slack : false,
                    updatedBy: userId
                }
            });
            
            return ok(res, { settings });
        } catch (error) {
            console.error('Update system settings error:', error);
            return serverError(res, 'Failed to update system settings', error.message);
        }
    }
    
    return badRequest(res, 'Method not allowed');
}

export default withLogging(withHttp(authRequired(handler)));

