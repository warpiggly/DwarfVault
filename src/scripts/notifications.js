/**
 * DwarfVault - Módulo compartido de notificaciones.
 *
 * Envuelve chrome.notifications.create para respetar la preferencia del
 * usuario (botón 🔔/🔕 en index.html). Mantiene una caché en memoria para
 * que los callers síncronos (toasts in-app) puedan decidir sin await.
 *
 * Se carga en el service worker con importScripts y en los HTMLs del popup
 * con <script src="scripts/notifications.js">.
 *
 * La fuente de verdad vive en chrome.storage.local.notificationsEnabled.
 * Default: true (comportamiento compatible con la versión previa).
 */
(function (root) {
    'use strict';

    const STORAGE_KEY = 'notificationsEnabled';

    // Caché en memoria. Se inicializa en la primera llamada y se mantiene
    // sincronizada vía chrome.storage.onChanged. Sirve para los call sites
    // síncronos (toast de "Text copied!" y feedback de emoji).
    let cachedEnabled = null;

    /**
     * Refresca la caché desde storage. Idempotente — solo lee.
     * @returns {Promise<boolean>}
     */
    function refresh() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get(STORAGE_KEY, (result) => {
                    cachedEnabled = result[STORAGE_KEY] !== false;
                    resolve(cachedEnabled);
                });
            } catch {
                cachedEnabled = true;
                resolve(true);
            }
        });
    }

    /**
     * Lee el estado actual (asíncrono, siempre fiable).
     * @returns {Promise<boolean>}
     */
    async function isEnabled() {
        if (cachedEnabled === null) return refresh();
        return cachedEnabled;
    }

    /**
     * Lee el estado desde la caché. Si todavía no está inicializada,
     * asume true (el comportamiento por defecto). Útil para toasts
     * que no pueden esperar una Promise.
     * @returns {boolean}
     */
    function isEnabledSync() {
        return cachedEnabled === null ? true : cachedEnabled;
    }

    /**
     * Actualiza la preferencia y la sincroniza con storage.
     * El listener de onChanged (más abajo) refrescará la caché en todos
     * los contextos (popup, background, otras páginas abiertas).
     *
     * @param {boolean} value
     * @returns {Promise<void>}
     */
    function setEnabled(value) {
        const next = !!value;
        cachedEnabled = next;
        return new Promise((resolve) => {
            try {
                chrome.storage.local.set({ [STORAGE_KEY]: next }, () => resolve());
            } catch {
                resolve();
            }
        });
    }

    /**
     * Envía una notificación del sistema respetando la preferencia del usuario.
     * Si las notificaciones están desactivadas, no hace nada.
     *
     * @param {Object} options - Mismo shape que chrome.notifications.create.
     * @returns {Promise<void>}
     */
    async function send(options) {
        if (!options || typeof chrome === 'undefined' || !chrome.notifications) return;
        const enabled = await isEnabled();
        if (!enabled) return;
        chrome.notifications.create(options);
    }

    // Mantener la caché sincronizada entre contextos (popup y service worker
    // se ejecutan en procesos distintos, así que sin esto quedarían desfasados).
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && STORAGE_KEY in changes) {
                cachedEnabled = changes[STORAGE_KEY].newValue !== false;
            }
        });
    } catch { /* noop en contextos sin chrome.storage */ }

    // Pre-cargar para tener la caché lista lo antes posible.
    refresh();

    root.DwarfNotify = { isEnabled, isEnabledSync, setEnabled, send, refresh, STORAGE_KEY };
})(typeof self !== 'undefined' ? self : globalThis);