/**
 * DwarfVault — Ember particles (corporate view only)
 *
 * Ascuas ambientales que ascienden lentamente desde la base del popup,
 * estilo "caverna profunda enana". 100% visual, sin lógica de negocio.
 *
 * Estrategia:
 *  - Un solo contenedor fijo a viewport (sale del overflow del body).
 *  - N partículas como <span>, cada una con duración/posición/color/drift
 *    aleatorios via CSS custom properties.
 *  - Animación pura CSS (transform + opacity). will-change indica al
 *    compositor que delegue a GPU.
 *
 * Mood: SÓBRIO CAVERNA PROFUNDA
 *   - 28 partículas simultáneas
 *   - 6–10s por ciclo
 *   - opacidad máxima 0.4
 *   - paleta cálida (HSL 25–55, naranja → dorado)
 */
(function () {
    'use strict';

    const NUM_EMBERS = 28;

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    function createEmber(container) {
        const ember = document.createElement('span');
        ember.className = 'ember';

        // Posición inicial horizontal (la animación la lleva hacia arriba).
        const left      = rand(0, 100);
        // Tamaño pequeño — chispas, no bolas.
        const size      = rand(2, 5);
        // Duración: sóbrio = lento, 6–10s.
        const duration  = rand(6, 10);
        // Delay negativo: cada partícula arranca en un punto diferente del
        // ciclo, así no nacen todas juntas en t=0.
        const delay     = -rand(0, duration);
        // Drift horizontal sutil (-30 a +30 px) para que no suban en línea recta.
        const driftX    = rand(-30, 30);
        // Color cálido: HSL 25–55 (naranja → amarillo dorado).
        const hue       = rand(25, 55);
        const sat       = rand(70, 100);
        const light     = rand(55, 72);
        const color     = `hsla(${hue}, ${sat}%, ${light}%, 0.85)`;

        ember.style.left              = `${left}%`;
        ember.style.width             = `${size}px`;
        ember.style.height            = `${size}px`;
        ember.style.animationDuration = `${duration}s`;
        ember.style.animationDelay    = `${delay}s`;
        ember.style.setProperty('--ember-drift', `${driftX}px`);
        ember.style.setProperty('--ember-color', color);

        container.appendChild(ember);
    }

    function init() {
        // Antes respetábamos prefers-reduced-motion del SO, pero el usuario
        // ha pedido las animaciones explícitamente como feature visual
        // central — la decisión es del producto, no del OS.
        const container = document.createElement('div');
        container.className = 'embers';
        container.setAttribute('aria-hidden', 'true');
        document.body.appendChild(container);

        for (let i = 0; i < NUM_EMBERS; i++) {
            createEmber(container);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
