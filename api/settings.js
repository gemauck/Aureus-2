// User Settings API endpoint (per-user preferences) + system company name
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'
import { parseJsonBody } from './_lib/body.js'

const USER_SETTINGS_DEFAULTS = {
    timezone: 'Africa/Johannesburg',
    currency: 'ZAR',
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
    sessionTimeout: 30,
    requirePasswordChange: false,
    twoFactorAuth: false,
    auditLogging: true,
    emailProvider: 'gmail',
    googleCalendar: false,
    quickbooks: false,
    slack: false
};

async function getCompanyName() {
    const system = await prisma.systemSettings.findUnique({
        where: { id: 'system' }
    });
    return system?.companyName ?? 'Abcotronics';
}

async function handler(req, res) {
    const userId = req.user?.sub || req.user?.id;

    if (!userId) {
        console.error('❌ Settings: No user ID found in token. req.user =', req.user);
        return serverError(res, 'Authentication required', 'No user ID found');
    }

    if (req.method === 'GET') {
        try {
            let userSettings = await prisma.userSettings.findUnique({
                where: { userId }
            });
            if (!userSettings) {
                userSettings = USER_SETTINGS_DEFAULTS;
            } else {
                userSettings = {
                    ...USER_SETTINGS_DEFAULTS,
                    ...userSettings,
                    timezone: userSettings.timezone ?? USER_SETTINGS_DEFAULTS.timezone,
                    currency: userSettings.currency ?? USER_SETTINGS_DEFAULTS.currency,
                    dateFormat: userSettings.dateFormat ?? USER_SETTINGS_DEFAULTS.dateFormat,
                    language: userSettings.language ?? USER_SETTINGS_DEFAULTS.language,
                    sessionTimeout: userSettings.sessionTimeout ?? USER_SETTINGS_DEFAULTS.sessionTimeout,
                    requirePasswordChange: userSettings.requirePasswordChange ?? USER_SETTINGS_DEFAULTS.requirePasswordChange,
                    twoFactorAuth: userSettings.twoFactorAuth ?? USER_SETTINGS_DEFAULTS.twoFactorAuth,
                    auditLogging: userSettings.auditLogging ?? USER_SETTINGS_DEFAULTS.auditLogging,
                    emailProvider: userSettings.emailProvider ?? USER_SETTINGS_DEFAULTS.emailProvider,
                    googleCalendar: userSettings.googleCalendar ?? USER_SETTINGS_DEFAULTS.googleCalendar,
                    quickbooks: userSettings.quickbooks ?? USER_SETTINGS_DEFAULTS.quickbooks,
                    slack: userSettings.slack ?? USER_SETTINGS_DEFAULTS.slack
                };
            }
            const companyName = await getCompanyName();
            return ok(res, { settings: userSettings, companyName });
        } catch (error) {
            console.error('Get user settings error:', error);
            return serverError(res, 'Failed to get settings', error.message);
        }
    }

    if (req.method === 'PUT') {
        try {
            const body = req.body || await parseJsonBody(req);
            const update = {
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
                slack: body.slack !== undefined ? body.slack : undefined
            };
            const filtered = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
            const settings = await prisma.userSettings.upsert({
                where: { userId },
                update: filtered,
                create: {
                    userId,
                    ...USER_SETTINGS_DEFAULTS,
                    ...filtered
                }
            });
            const companyName = await getCompanyName();
            return ok(res, { settings, companyName });
        } catch (error) {
            console.error('Update user settings error:', error);
            return serverError(res, 'Failed to update settings', error.message);
        }
    }

    return badRequest(res, 'Method not allowed');
}

export default withLogging(withHttp(authRequired(handler)));
