/**
 * DwarfVault - Módulo Native Click (desbloqueo de menú contextual).
 *
 * Algunas páginas (Spotify, Notion, editores online…) interceptan el evento
 * 'contextmenu' para mostrar su propio menú modificado. Este módulo inyecta
 * un handler en fase de captura con stopImmediatePropagation() que impide
 * que esos handlers se ejecuten, devolviendo el menú nativo del navegador.
 *
 * Estado por-pestaña: el flag vive en `window.__dwarfCtxUnlock` de la página.
 * Al desactivar el toggle, el flag pasa a false y el handler deja pasar el
 * evento, restaurando el menú modificado de la página sin recargar.
 *
 * Se carga en index.html con <script src="scripts/contextUnlock.js"> ANTES
 * de popup.js, que llama a DwarfContextUnlock.init(buttonElement).
 *
 * Patrón IIFE → expone DwarfContextUnlock en el global. Compatible con la
 * CSP de MV3 (script-src 'self', sin módulos ES).
 */
(function (root) {
    'use strict';

    // ── Funciones que se inyectan EN LA PÁGINA ───────────────────────────────
    // Importante: deben ser self-contained — no pueden capturar variables del
    // scope del popup. chrome.scripting.executeScript las serializa y ejecuta
    // en el contexto de la pestaña, no aquí.

    /** Lee el flag actual desde la pestaña activa. */
    function readUnlockInPage() {
        return !!window.__dwarfCtxUnlock;
    }

    /**
     * Instala los handlers (idempotente) y aplica el flag.
     * @param {boolean} enable
     */
    function applyUnlockInPage(enable) {
        if (!window.__dwarfCtxInstalled) {
            // capture=true → corremos ANTES que los listeners del propio sitio.
            const ctxHandler = (e) => {
                if (window.__dwarfCtxUnlock) e.stopImmediatePropagation();
            };
            // Algunos sitios bloquean el menú desde mousedown/mouseup en
            // lugar de contextmenu (p. ej. ciertos editores tipo Notion).
            const mouseHandler = (e) => {
                if (window.__dwarfCtxUnlock && e.button === 2) {
                    e.stopImmediatePropagation();
                }
            };
            document.addEventListener('contextmenu', ctxHandler,   true);
            document.addEventListener('mousedown',   mouseHandler, true);
            document.addEventListener('mouseup',     mouseHandler, true);
            window.__dwarfCtxInstalled = true;
        }
        window.__dwarfCtxUnlock = !!enable;
        return window.__dwarfCtxUnlock;
    }

    // ── Helpers del popup ────────────────────────────────────────────────────

    async function getActiveTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            return tab || null;
        } catch {
            return null;
        }
    }

    /**
     * Conecta el botón con la pestaña activa: lee el estado, pinta el botón,
     * y registra el listener de click. Llamar una sola vez al cargar el popup.
     *
     * @param {HTMLButtonElement} btn - Elemento botón (#toggleContextUnlock).
     */
    async function init(btn) {
        if (!btn) return;

        const paint = (enabled) => {
            if (enabled) {
                btn.classList.add('ctx-btn-on');
                btn.textContent = '🔓 NATIVE CLICK — ON';
            } else {
                btn.classList.remove('ctx-btn-on');
                btn.textContent = '🔒 NATIVE CLICK — OFF';
            }
        };

        const tab = await getActiveTab();
        if (!tab || !tab.id) {
            btn.disabled = true;
            btn.title    = 'No active tab.';
            paint(false);
            return;
        }

        // Leer estado actual de la pestaña. En páginas restringidas
        // (chrome://, Web Store, PDFs) executeScript falla — desactivamos
        // el botón y mostramos por qué en el tooltip.
        try {
            const [{ result }] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func:   readUnlockInPage
            });
            paint(!!result);
        } catch {
            btn.disabled = true;
            btn.title    = 'This page does not allow scripts (chrome://, Web Store, PDF, etc.).';
            paint(false);
            return;
        }

        btn.addEventListener('click', async () => {
            const next = !btn.classList.contains('ctx-btn-on');
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func:   applyUnlockInPage,
                    args:   [next]
                });
                paint(next);
            } catch (err) {
                console.warn('[DwarfVault] No se pudo alternar Native Click:', err);
                alert('No se puede alternar el menú contextual en esta página.');
            }
        });
    }

    root.DwarfContextUnlock = { init };
})(typeof self !== 'undefined' ? self : globalThis);
