/**
 * DwarfVault — Style redirect (preferencia de vista)
 *
 * El popup por defecto (manifest → default_popup) es la vista CORPORATE.
 * Si el usuario fijó explícitamente la vista DWARVEN como preferida
 * (pulsando el switch), guardamos esa elección en localStorage. Este
 * script corre PRIMERO en el <head> de corporate.html y, de forma
 * síncrona (sin parpadeo), salta a index.html antes de pintar nada.
 *
 * Por qué localStorage y no chrome.storage: localStorage es SÍNCRONO,
 * así que podemos leer y redirigir en el mismo tick, antes del primer
 * render. chrome.storage es asíncrono y provocaría un flash de corporate.
 *
 * Por qué archivo externo: la CSP del manifest (script-src 'self') prohíbe
 * scripts inline.
 */
(function () {
    'use strict';
    try {
        if (localStorage.getItem('dwarfvault.style') === 'dwarven') {
            location.replace('index.html');
        }
    } catch (e) {
        /* localStorage no disponible → se queda en la vista corporate. */
    }
})();
