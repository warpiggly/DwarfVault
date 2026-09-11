/**
 * DwarfVault - Offscreen document (portapapeles).
 *
 * El service worker no tiene DOM, así que no puede usar execCommand ni la
 * Clipboard API. Inyectar la copia en la pestaña activa tampoco es fiable:
 * al hacer clic en un ítem del menú contextual el documento de la página
 * pierde el foco, y tanto document.execCommand('copy') como
 * navigator.clipboard.writeText() fallan cuando el documento no está enfocado.
 *
 * Un documento offscreen sí puede copiar de forma síncrona con
 * execCommand('copy') sobre un textarea propio — es la vía documentada para
 * escribir en el portapapeles desde MV3 (permiso "clipboardWrite").
 *
 * Protocolo: recibe { target: 'dwarf-offscreen', action: 'copyToClipboard', text }
 * y responde { ok: boolean }.
 */
'use strict';

const OFFSCREEN_TARGET = 'dwarf-offscreen';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Defensa en profundidad: solo mensajes originados en esta extensión.
    if (sender?.id !== chrome.runtime.id) return;

    // Ignorar cualquier mensaje que no vaya dirigido a este documento, para
    // no interferir con los mensajes del popup ni del service worker.
    if (!message || message.target !== OFFSCREEN_TARGET) return;
    if (message.action !== 'copyToClipboard') return;

    const sink = document.getElementById('clipboardSink');

    // Si el textarea no existe, responder explícitamente en vez de dejar al
    // service worker esperando hasta su timeout.
    if (!sink) {
        console.error('[DwarfVault][offscreen] Falta #clipboardSink.');
        sendResponse({ ok: false });
        return;
    }

    let ok = false;

    try {
        sink.value = typeof message.text === 'string' ? message.text : '';
        // Sin texto no hay nada que copiar; execCommand devolvería true sobre
        // una selección vacía y borraría el portapapeles del usuario.
        if (sink.value.length > 0) {
            sink.focus();
            sink.select();
            ok = document.execCommand('copy'); // eslint-disable-line
        }
    } catch (error) {
        console.error('[DwarfVault][offscreen] Copy failed:', error);
        ok = false;
    } finally {
        // No dejar el texto del usuario residente en el DOM.
        sink.value = '';
    }

    // Respuesta síncrona: no devolvemos true.
    sendResponse({ ok });
});
