export const DEFAULT_POA_REVIEW_SETTINGS = {
    smrUsageMaxPerActivity: 1000,
    batchWindowHours: 1,
    shiftProofWindowHours: 24,
};

export function normalizePoaReviewSettings(raw) {
    const base = { ...DEFAULT_POA_REVIEW_SETTINGS };
    if (!raw || typeof raw !== 'object') return base;
    for (const key of Object.keys(DEFAULT_POA_REVIEW_SETTINGS)) {
        if (raw[key] != null && raw[key] !== '') {
            const n = Number(raw[key]);
            base[key] = Number.isFinite(n) ? n : raw[key];
        }
    }
    return base;
}

export async function loadPoaReviewSettings(prisma) {
    try {
        const row = await prisma.systemSettings.findUnique({ where: { id: 'system' } });
        if (row?.poaReviewSettingsJson) {
            return normalizePoaReviewSettings(JSON.parse(row.poaReviewSettingsJson));
        }
    } catch (e) {
        console.warn('POA settings load failed, using defaults:', e?.message);
    }
    return { ...DEFAULT_POA_REVIEW_SETTINGS };
}

export async function savePoaReviewSettings(prisma, settings, updatedBy) {
    const normalized = normalizePoaReviewSettings(settings);
    await prisma.systemSettings.upsert({
        where: { id: 'system' },
        create: {
            id: 'system',
            poaReviewSettingsJson: JSON.stringify(normalized),
            updatedBy: updatedBy || null,
        },
        update: {
            poaReviewSettingsJson: JSON.stringify(normalized),
            updatedBy: updatedBy || null,
        },
    });
    return normalized;
}
