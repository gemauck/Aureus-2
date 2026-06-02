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
    slack: false,
    inventoryStockView: 'all',
    crmClientsStatusFilter: 'all'
};

const INVENTORY_STOCK_VIEW_OPTIONS = ['all', 'in_stock', 'out_of_stock'];
const CRM_CLIENTS_STATUS_FILTER_OPTIONS = ['all', 'active', 'inactive'];

/** Columns added after initial UserSettings deploy — absent on some production DBs until migrated. */
const DRIFT_OPTIONAL_COLUMNS = ['inventoryStockView', 'crmClientsStatusFilter'];

function isUserSettingsSchemaDriftError(error) {
    const msg = String(error?.message || '');
    return (
        error?.code === 'P2022' ||
        DRIFT_OPTIONAL_COLUMNS.some((col) => msg.includes(col))
    );
}

function stripDriftColumns(fields) {
    const out = { ...fields };
    for (const col of DRIFT_OPTIONAL_COLUMNS) {
        delete out[col];
    }
    return out;
}

function pickDriftOverrides(updateFields) {
    const overrides = {};
    for (const col of DRIFT_OPTIONAL_COLUMNS) {
        if (updateFields[col] !== undefined) {
            overrides[col] = updateFields[col];
        }
    }
    return overrides;
}

function mergeSettingsResponse(row, driftOverrides = {}) {
    const base = row
        ? {
            ...USER_SETTINGS_DEFAULTS,
            ...row,
            inventoryStockView:
                normalizeInventoryStockView(row.inventoryStockView) ??
                USER_SETTINGS_DEFAULTS.inventoryStockView,
            crmClientsStatusFilter:
                normalizeCrmClientsStatusFilter(row.crmClientsStatusFilter) ??
                USER_SETTINGS_DEFAULTS.crmClientsStatusFilter
        }
        : { ...USER_SETTINGS_DEFAULTS };
    return { ...base, ...driftOverrides };
}

function buildSettingsUpdate(body) {
    return {
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
        inventoryStockView: body.inventoryStockView !== undefined
            ? (normalizeInventoryStockView(body.inventoryStockView) ?? USER_SETTINGS_DEFAULTS.inventoryStockView)
            : undefined,
        crmClientsStatusFilter: body.crmClientsStatusFilter !== undefined
            ? (normalizeCrmClientsStatusFilter(body.crmClientsStatusFilter) ?? USER_SETTINGS_DEFAULTS.crmClientsStatusFilter)
            : undefined
    };
}

async function upsertUserSettings(userId, updateFields) {
    const filtered = Object.fromEntries(Object.entries(updateFields).filter(([, v]) => v !== undefined));
    return prisma.userSettings.upsert({
        where: { userId },
        update: filtered,
        create: {
            userId,
            ...USER_SETTINGS_DEFAULTS,
            ...filtered
        }
    });
}

function normalizeInventoryStockView(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return INVENTORY_STOCK_VIEW_OPTIONS.includes(normalized) ? normalized : null;
}

function normalizeCrmClientsStatusFilter(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return CRM_CLIENTS_STATUS_FILTER_OPTIONS.includes(normalized) ? normalized : null;
}

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
                userSettings = { ...USER_SETTINGS_DEFAULTS };
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
                    slack: userSettings.slack ?? USER_SETTINGS_DEFAULTS.slack,
                    inventoryStockView:
                        normalizeInventoryStockView(userSettings.inventoryStockView) ??
                        USER_SETTINGS_DEFAULTS.inventoryStockView,
                    crmClientsStatusFilter:
                        normalizeCrmClientsStatusFilter(userSettings.crmClientsStatusFilter) ??
                        USER_SETTINGS_DEFAULTS.crmClientsStatusFilter
                };
            }
            const companyName = await getCompanyName();
            return ok(res, { settings: userSettings, companyName });
        } catch (error) {
            // Missing columns on older DBs (e.g. inventoryStockView) — return defaults instead of 500.
            const msg = String(error?.message || '');
            if (
                msg.includes('inventoryStockView') ||
                msg.includes('crmClientsStatusFilter') ||
                error?.code === 'P2022'
            ) {
                console.warn('Get user settings: schema drift, using defaults:', msg);
                const companyName = await getCompanyName().catch(() => 'Abcotronics');
                return ok(res, { settings: { ...USER_SETTINGS_DEFAULTS }, companyName });
            }
            console.error('Get user settings error:', error);
            return serverError(res, 'Failed to get settings', error.message);
        }
    }

    if (req.method === 'PUT') {
        try {
            const body = req.body || await parseJsonBody(req);
            const updateFields = buildSettingsUpdate(body);
            const driftOverrides = pickDriftOverrides(updateFields);
            const companyName = await getCompanyName();

            try {
                const settings = await upsertUserSettings(userId, updateFields);
                return ok(res, { settings: mergeSettingsResponse(settings, driftOverrides), companyName });
            } catch (error) {
                if (!isUserSettingsSchemaDriftError(error)) {
                    throw error;
                }
                console.warn(
                    'Update user settings: schema drift, retrying without optional columns:',
                    error.message
                );
                const persistable = stripDriftColumns(updateFields);
                const hasPersistable = Object.keys(
                    Object.fromEntries(Object.entries(persistable).filter(([, v]) => v !== undefined))
                ).length > 0;
                let row = null;
                if (hasPersistable) {
                    row = await upsertUserSettings(userId, persistable);
                } else {
                    row = await prisma.userSettings.findUnique({ where: { userId } });
                }
                return ok(res, {
                    settings: mergeSettingsResponse(row, driftOverrides),
                    companyName
                });
            }
        } catch (error) {
            if (isUserSettingsSchemaDriftError(error)) {
                console.warn('Update user settings: schema drift on fallback:', error.message);
                const body = req.body || {};
                const updateFields = buildSettingsUpdate(body);
                const driftOverrides = pickDriftOverrides(updateFields);
                const companyName = await getCompanyName().catch(() => 'Abcotronics');
                return ok(res, {
                    settings: mergeSettingsResponse(null, driftOverrides),
                    companyName
                });
            }
            console.error('Update user settings error:', error);
            return serverError(res, 'Failed to update settings', error.message);
        }
    }

    return badRequest(res, 'Method not allowed');
}

export default withLogging(withHttp(authRequired(handler)));
