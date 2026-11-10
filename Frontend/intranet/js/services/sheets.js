const CATALOG_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQzJYFzFmH-Gxp9uXBTISwc_tErhPdlgeVYteVfDCem-zMxPWWVivohxhX2fqfWaHt47rC_cPSaF_sQ/pub?gid=0&single=true&output=csv";

// =========================
// CACHE RUNTIME
// =========================
let catalogCache = null;

const sheetCache = {};

// =========================
// TTL
// =========================
const TTL = {

    catalog:
        1000 * 60 * 60 * 24, // 24h

    pages:
        1000 * 60 * 60 * 24, // 24h

    layout:
        1000 * 60 * 60 * 24, // 24h

    index:
        1000 * 60 * 30, // 30 min

    default:
        1000 * 60 * 10 // 10 min
};

// =========================
// STORAGE KEY
// =========================
function getCacheKey(name) {

    return `${CONFIG.appId}_sheet_cache_${name}`;
}

// function getCacheKey(name) {

//     return `sheet_cache_${name}`;
// }

// =========================
// OBTENER TTL
// =========================
function getTTL(name) {

    return TTL[name] || TTL.default;
}

// =========================
// LEER STORAGE
// =========================
function getStorageCache(name) {

    try {

        const raw =
            localStorage.getItem(
                getCacheKey(name)
            );

        if (!raw) {
            return null;
        }

        const parsed =
            JSON.parse(raw);

        const isExpired =
            Date.now() - parsed.timestamp >
            getTTL(name);

        if (isExpired) {

            localStorage.removeItem(
                getCacheKey(name)
            );

            return null;
        }

        return parsed.data;

    } catch (e) {

        console.error(
            'Error leyendo cache:',
            name,
            e
        );

        return null;
    }
}

// =========================
// GUARDAR STORAGE
// =========================
function setStorageCache(name, data) {

    try {

        localStorage.setItem(

            getCacheKey(name),

            JSON.stringify({

                timestamp:
                    Date.now(),

                data
            })
        );

    } catch (e) {

        console.error(
            'Error guardando cache:',
            name,
            e
        );
    }
}

// =========================
// OBTENER CATALOGO
// =========================
async function getCatalog() {

    // =========================
    // RUNTIME
    // =========================
    if (catalogCache) {

        return catalogCache;
    }

    // =========================
    // STORAGE
    // =========================
    const storageCache =
        getStorageCache('catalog');

    if (storageCache) {

        catalogCache =
            storageCache;

        return storageCache;
    }

    // =========================
    // FETCH
    // =========================
    const res =
        await fetch(CATALOG_URL);

    if (!res.ok) {

        throw new Error(
            'Error cargando catalog'
        );
    }

    const text =
        await res.text();

    const parsed =
        parseCSV(text);

    // =========================
    // SAVE
    // =========================
    catalogCache =
        parsed;

    setStorageCache(
        'catalog',
        parsed
    );

    return parsed;
}

// =========================
// OBTENER SHEET
// =========================
async function fetchSheet(name) {

    // =========================
    // RUNTIME
    // =========================
    if (sheetCache[name]) {

        return sheetCache[name];
    }

    // =========================
    // STORAGE
    // =========================
    const storageCache =
        getStorageCache(name);

    if (storageCache) {

        sheetCache[name] =
            storageCache;

        return storageCache;
    }

    // =========================
    // CATALOG
    // =========================
    const catalog =
        await getCatalog();

    const entry =
        catalog.find(i =>

            i.name?.trim() === name &&
            i.state?.trim() === 'activo'
        );

    if (!entry) {

        throw new Error(
            `Sheet no encontrada: ${name}`
        );
    }

    // =========================
    // FETCH
    // =========================
    const res =
        await fetch(entry.url_csv);

    if (!res.ok) {

        throw new Error(
            `Error cargando sheet: ${name}`
        );
    }

    const text =
        await res.text();

    // =========================
    // PARSE
    // =========================
    const parsed =
        parseCSV(text);

    // =========================
    // SAVE RUNTIME
    // =========================
    sheetCache[name] =
        parsed;

    // =========================
    // SAVE STORAGE
    // =========================
    setStorageCache(
        name,
        parsed
    );

    return parsed;
}