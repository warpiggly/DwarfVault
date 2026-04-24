/**
 * DwarfVault - Módulo compartido de validación y saneamiento.
 *
 * Este archivo centraliza toda la lógica de seguridad de entrada/salida
 * para que no se dupliquen reglas entre background.js, popup.js y Viewboard.js.
 *
 * Se carga en el service worker con importScripts('scripts/security.js')
 * y en los HTMLs del popup con <script src="scripts/security.js">.
 *
 * No altera el schema de IndexedDB — únicamente valida/limpia los datos
 * antes de escribir o antes de renderizar.
 */
(function (root) {
    'use strict';

    // ── Constantes ────────────────────────────────────────────────────────────

    /** Longitud máxima permitida para el nombre de una base de datos. */
    const MAX_DB_NAME_LENGTH   = 100;
    /** Longitud máxima de texto de una entrada (1 MB de caracteres). */
    const MAX_ENTRY_TEXT       = 1_000_000;
    /** Longitud máxima de una URL. */
    const MAX_URL_LENGTH       = 8_192;
    /** Tope de entradas permitidas en un import. */
    const MAX_ENTRIES_PER_DB   = 100_000;
    /** Tope de BDs hijas permitidas en un import. */
    const MAX_CHILD_DATABASES  = 1_000;

    // ── Validadores ───────────────────────────────────────────────────────────

    /**
     * Comprueba si una URL es segura para usarse como `href`, `tabs.create({url})`
     * o `img.src`. Solo acepta http: y https: — rechaza javascript:, data:,
     * file:, blob: y cualquier otro esquema.
     *
     * @param {*} url
     * @returns {boolean}
     */
    function isSafeUrl(url) {
        if (typeof url !== 'string' || !url || url.length > MAX_URL_LENGTH) return false;
        try {
            const u = new URL(url);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * Comprueba si una URL de favicon es segura para `img.src`.
     * Acepta http(s) y `data:image/...;base64,` (Chrome genera data URLs
     * para algunos favicons — son estáticas y no ejecutan código).
     *
     * @param {*} url
     * @returns {boolean}
     */
    function isSafeFaviconUrl(url) {
        if (typeof url !== 'string' || !url || url.length > MAX_URL_LENGTH) return false;
        try {
            const u = new URL(url);
            if (u.protocol === 'http:' || u.protocol === 'https:') return true;
            // Solo data: image de tipos conocidos — nunca data:text/html.
            if (u.protocol === 'data:') {
                return /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);/i.test(url);
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Devuelve la URL si es segura; si no, devuelve cadena vacía.
     * Úsalo justo antes de asignar a `img.src` o `tabs.create({url})`.
     *
     * @param {*} url
     * @returns {string}
     */
    function safeUrlOrEmpty(url) {
        return isSafeUrl(url) ? url : '';
    }

    /**
     * Idem para favicons.
     *
     * @param {*} url
     * @returns {string}
     */
    function safeFaviconOrEmpty(url) {
        return isSafeFaviconUrl(url) ? url : '';
    }

    /**
     * Limpia un nombre de base de datos: quita caracteres de control que
     * podrían romper el menú contextual o la UI, recorta longitud y espacios.
     *
     * No escapa HTML — el render se hace siempre con textContent, así que
     * `<` y `>` no son peligrosos; solo nos preocupan \n, \r, \t y los chars
     * de control que afectan el layout de chrome.contextMenus.create.
     *
     * @param {*} name
     * @returns {string} - Nombre saneado (posiblemente vacío).
     */
    function sanitizeDbName(name) {
        if (typeof name !== 'string') return '';
        return name
            .replace(/[\x00-\x1F\x7F]/g, ' ')   // control chars → espacio
            .replace(/\s+/g, ' ')               // colapsar whitespace
            .trim()
            .slice(0, MAX_DB_NAME_LENGTH);
    }

    /**
     * Valida que un nombre de BD no esté vacío después de sanear.
     *
     * @param {*} name
     * @returns {boolean}
     */
    function isValidDbName(name) {
        return sanitizeDbName(name).length > 0;
    }

    // ── Saneamiento de entradas y imports ─────────────────────────────────────

    /**
     * Devuelve una entry saneada con el mismo schema que usa IndexedDB
     * (`{ text, url, favicon, date }`) pero con URLs validadas y longitudes
     * limitadas. Si la entry es inválida (sin texto), devuelve null.
     *
     * @param {*} raw
     * @returns {{text:string,url:string,favicon:string,date:string}|null}
     */
    function sanitizeEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;

        const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_ENTRY_TEXT) : '';
        if (!text.trim()) return null;

        return {
            text,
            url:     safeUrlOrEmpty(raw.url),
            favicon: safeFaviconOrEmpty(raw.favicon),
            date:    typeof raw.date === 'string' ? raw.date : new Date().toISOString()
        };
    }

    /**
     * Sanea un objeto de base de datos completo (con sus entries).
     * Descarta entries inválidas y recorta al límite máximo.
     *
     * @param {*} rawDb
     * @returns {{name:string,entries:Array,parentDatabase:string|null}|null}
     */
    function sanitizeDatabase(rawDb) {
        if (!rawDb || typeof rawDb !== 'object') return null;

        const name = sanitizeDbName(rawDb.name);
        if (!name) return null;

        const rawEntries = Array.isArray(rawDb.entries) ? rawDb.entries : [];
        const entries = rawEntries
            .slice(0, MAX_ENTRIES_PER_DB)
            .map(sanitizeEntry)
            .filter(Boolean);

        const parentDatabase = rawDb.parentDatabase
            ? sanitizeDbName(rawDb.parentDatabase) || null
            : null;

        return { name, entries, parentDatabase };
    }

    /**
     * Valida y sanea la estructura de un JSON exportado por DwarfVault.
     * Rechaza si falta la firma (`version`) o el padre.
     *
     * @param {*} data
     * @returns {{version:string,exportDate?:string,parentDatabase:Object,childDatabases:Array}|null}
     */
    function sanitizeImportData(data) {
        if (!data || typeof data !== 'object') return null;
        if (typeof data.version !== 'string' || !data.version) return null;

        const parent = sanitizeDatabase(data.parentDatabase);
        if (!parent) return null;
        // Un padre importado no puede quedar marcado como hijo.
        parent.parentDatabase = null;

        const rawChildren = Array.isArray(data.childDatabases) ? data.childDatabases : [];
        const children = rawChildren
            .slice(0, MAX_CHILD_DATABASES)
            .map(sanitizeDatabase)
            .filter(Boolean)
            // Forzar que cada hija apunte al padre importado.
            .map(child => ({ ...child, parentDatabase: parent.name }));

        return {
            version:        data.version,
            exportDate:     typeof data.exportDate === 'string' ? data.exportDate : undefined,
            parentDatabase: parent,
            childDatabases: children
        };
    }

    // ── Exportar al ámbito global ─────────────────────────────────────────────

    const DwarfSecurity = {
        isSafeUrl,
        isSafeFaviconUrl,
        safeUrlOrEmpty,
        safeFaviconOrEmpty,
        sanitizeDbName,
        isValidDbName,
        sanitizeEntry,
        sanitizeDatabase,
        sanitizeImportData,
        MAX_DB_NAME_LENGTH,
        MAX_ENTRY_TEXT,
        MAX_URL_LENGTH
    };

    root.DwarfSecurity = DwarfSecurity;
})(typeof self !== 'undefined' ? self : globalThis);