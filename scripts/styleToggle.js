/**
 * DwarfVault — Style toggle (visual switch)
 *
 * Pill toggle profesional: la bolita desliza de izquierda (dwarven)
 * a derecha (corporate). Al click:
 *   1) Invierte `aria-checked` → CSS anima la bolita
 *   2) Tras la duración de la animación, navega
 *
 * Estado inicial al cargar la página se determina por `body.dataset.style`
 * para que la bolita aparezca en su posición correcta sin animar al abrir.
 */
(function () {
    'use strict';

    const TARGET_BY_STYLE = {
        corporate: 'index.html',
        default:   'index-corporate.html'
    };

    // Debe coincidir con la duración de `transition: left ...` en CSS (0.28s).
    const SLIDE_MS = 280;

    function init() {
        const btn = document.getElementById('styleToggleBtn');
        if (!btn) return;

        const isCorporate = document.body.dataset.style === 'corporate';
        const target      = TARGET_BY_STYLE[isCorporate ? 'corporate' : 'default'];

        // Estado inicial = el de la página actual (no anima al cargar).
        btn.setAttribute('aria-checked', isCorporate ? 'true' : 'false');

        let navigating = false;
        btn.addEventListener('click', () => {
            if (navigating) return;
            navigating = true;

            // Flip visual del aria-checked → CSS dispara la transición.
            btn.setAttribute('aria-checked', isCorporate ? 'false' : 'true');

            // Navega cuando la animación termina, para que el usuario VEA
            // la bolita llegando al otro lado antes del salto.
            setTimeout(() => {
                window.location.href = target;
            }, SLIDE_MS);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
