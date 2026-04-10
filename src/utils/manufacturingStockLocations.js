/**
 * Manufacturing module: consistent stock location ordering and defaults.
 * PMB is treated as the primary site; it appears first in dropdowns, then others A–Z by display name.
 */

function isPmbStockLocation(loc) {
    if (!loc) return false;
    const code = String(loc.code || loc.locationCode || '').trim().toUpperCase();
    const name = String(loc.name || loc.locationName || '').trim().toUpperCase();
    if (code === 'PMB') return true;
    if (name === 'PMB') return true;
    if (name.startsWith('PMB ')) return true;
    // Pietermaritzburg office / main site (not vehicle lines that end with "- PMB" in brackets)
    if (name.includes('PIETERMARITZBURG')) return true;
    return false;
}

function locationSortKey(loc) {
    return String(loc?.name || loc?.code || '').trim();
}

/**
 * @param {Array} locations
 * @returns {Array} new array: PMB location(s) first, remaining sorted by name (case-insensitive)
 */
function sortStockLocationsForManufacturing(locations) {
    if (!Array.isArray(locations) || locations.length === 0) {
        return Array.isArray(locations) ? [...locations] : [];
    }
    const copy = [...locations];
    const pmb = copy.filter(isPmbStockLocation).sort((a, b) =>
        locationSortKey(a).localeCompare(locationSortKey(b), undefined, { sensitivity: 'base' })
    );
    const rest = copy
        .filter((l) => !isPmbStockLocation(l))
        .sort((a, b) =>
            locationSortKey(a).localeCompare(locationSortKey(b), undefined, { sensitivity: 'base' })
        );
    return [...pmb, ...rest];
}

/**
 * Prefer PMB; otherwise legacy main warehouse heuristics, then first warehouse, then any.
 * @param {Array} locations
 * @returns {object|null}
 */
function getDefaultManufacturingStockLocation(locations) {
    if (!Array.isArray(locations) || locations.length === 0) return null;
    const pmb = locations.find(isPmbStockLocation);
    if (pmb) return pmb;
    return (
        locations.find((l) => l.code === 'LOC001') ||
        locations.find((l) => String(l.name || '').trim() === 'Main Warehouse') ||
        locations.find((l) => l.code === 'WH-MAIN') ||
        locations.find((l) => l.type === 'warehouse') ||
        locations[0]
    );
}

const manufacturingStockLocations = {
    isPmbStockLocation,
    sortStockLocationsForManufacturing,
    getDefaultManufacturingStockLocation
};

if (typeof window !== 'undefined') {
    window.manufacturingStockLocations = manufacturingStockLocations;
}
