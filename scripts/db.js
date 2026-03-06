/**
 * DwarfVault - Módulo compartido de base de datos
 *
 * Proporciona openDatabase() para popup.js y Viewboard.js.
 * El background service worker usa su propia versión Promise-based.
 *
 * IMPORTANTE: Nunca borramos el object store en onupgradeneeded —
 * hacerlo destruiría todos los datos del usuario en actualizaciones.
 */

const DB_NAME    = 'Dott-yDB';
const DB_VERSION = 2;

/**
 * Abre (o crea) la base de datos IndexedDB y entrega la conexión
 * mediante un callback.
 *
 * @param {function(IDBDatabase): void} callback
 */
function openDatabase(callback) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Se ejecuta solo cuando la BD no existe o la versión sube.
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Crear el store únicamente si todavía no existe.
        if (!db.objectStoreNames.contains('databases')) {
            db.createObjectStore('databases', { keyPath: 'name' });
        }
    };

    request.onsuccess = (event) => {
        callback(event.target.result);
    };

    request.onerror = (event) => {
        console.error('[DwarfVault] Error al abrir la base de datos:', event.target.error);
    };
}
