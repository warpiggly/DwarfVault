/**
 * DwarfVault — Schema view
 *
 * Dibuja el mapa de relaciones de la base de datos como un diagrama tipo
 * ER/organigrama, con el estilo gráfico de la vista corporate:
 *
 *     🏔️ Root (la BD)  ──►  Vault (padre)  ──►  Chest (hijo)
 *
 * Modelo de datos (store `databases`, keyPath `name`):
 *     { name, parentDatabase?, entries: [{text, url, favicon}] }
 *   · Padres  → sin `parentDatabase`.
 *   · Hijos   → `parentDatabase === <nombre del padre>`.
 *
 * Los nodos de Vault/Chest son <a> absolutos que enlazan a la vista Home
 * (`corporate.html?open=<hoja>`), así que un click abre esa base de datos
 * con su contenido a la vista. El nodo raíz no es enlace: no es una BD.
 * Los conectores son <path> curvos en un
 * <svg> de fondo. Todo el layout se calcula en JS para poder dibujar las
 * curvas con coordenadas exactas y habilitar scroll cuando no cabe.
 */
(function () {
    'use strict';

    // ── Geometría del diagrama (px) ─────────────────────────────
    const ROOT   = { x: 16,  w: 152, h: 56 };
    const PARENT = { x: 214, w: 194, h: 50 };
    const CHILD  = { x: 476, w: 182, h: 40 };
    const PAD_TOP   = 18;
    const PAD_SIDE  = 22;
    const CHILD_GAP = 12;
    const PARENT_GAP = 22;

    // ── IndexedDB (reutiliza openDatabase de db.js) ─────────────
    function loadAll() {
        return new Promise((resolve, reject) => {
            try {
                openDatabase((db) => {
                    const tx  = db.transaction('databases', 'readonly');
                    const req = tx.objectStore('databases').getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror   = () => reject(req.error);
                });
            } catch (e) { reject(e); }
        });
    }

    const entryCount = (rec) => (Array.isArray(rec.entries) ? rec.entries.length : 0);
    const plural  = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const entries = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

    // ── Construcción de nodos + conectores ──────────────────────
    function curve(x1, y1, x2, y2) {
        const c = Math.max(28, (x2 - x1) * 0.5);
        return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
    }

    function makeNode(kind, rec, geo, delay) {
        // Vault/Chest son enlaces reales (no un <div> con listener) para que
        // funcionen con teclado, foco y el resto de la semántica de un link.
        // El raíz es la BD entera, no una hoja abrible → sigue siendo <div>.
        const isLink = kind !== 'root';
        const el = document.createElement(isLink ? 'a' : 'div');
        el.className = `schema-node node-${kind}`;
        el.style.left   = `${geo.x}px`;
        el.style.top    = `${geo.y}px`;
        el.style.width  = `${geo.w}px`;
        el.style.height = `${geo.h}px`;
        el.style.animationDelay = `${delay}ms`;

        const title = document.createElement('div');
        title.className = 'node-title';
        const meta = document.createElement('div');
        meta.className = 'node-meta';

        if (kind === 'root') {
            title.textContent = '🏔️ DwarfVault';
            meta.textContent  = rec; // aquí `rec` es el texto de meta ya formado
        } else {
            title.textContent = rec.name;
            meta.textContent  = rec.meta;
            el.title = `${rec.name} — ${rec.meta} · click to open in Home`;
        }

        if (isLink) {
            // `openSheet` lo consume corporate.js, que resuelve el vault padre
            // (y la pestaña, si es un chest) a partir de este nombre.
            el.href = `corporate.html?open=${encodeURIComponent(rec.name)}`;
            el.setAttribute('aria-label', `Open ${rec.name} in Home — ${rec.meta}`);
        }
        el.appendChild(title);
        el.appendChild(meta);
        return el;
    }

    function render(allDbs, canvas, stage, svg, emptyEl) {
        const parents  = allDbs.filter(d => !d.parentDatabase);
        const childrenOf = (name) => allDbs.filter(d => d.parentDatabase === name);

        // Limpia render previo (nodos y estado de hover, conserva el svg).
        stage.classList.remove('dimmed');
        stage.querySelectorAll('.schema-node').forEach(n => n.remove());
        svg.innerHTML = '';

        if (parents.length === 0) {
            emptyEl.hidden = false;
            stage.style.width = '';
            stage.style.height = '';
            return;
        }
        emptyEl.hidden = true;

        // 1) Layout vertical: cada padre reserva una "banda" tan alta como
        //    su bloque de hijos (o el propio padre si no tiene).
        let y = PAD_TOP;
        let anyKids = false;
        const parentLayout = parents.map((p) => {
            const kids = childrenOf(p.name);
            if (kids.length) anyKids = true;
            const kidsBlockH = kids.length
                ? kids.length * CHILD.h + (kids.length - 1) * CHILD_GAP
                : 0;
            const bandH  = Math.max(PARENT.h, kidsBlockH);
            const py     = y + (bandH - PARENT.h) / 2;
            let cy       = y + (bandH - kidsBlockH) / 2;
            const kidGeo = kids.map((k) => {
                const geo = { rec: k, x: CHILD.x, y: cy, w: CHILD.w, h: CHILD.h };
                cy += CHILD.h + CHILD_GAP;
                return geo;
            });
            const layout = { rec: p, x: PARENT.x, y: py, w: PARENT.w, h: PARENT.h, kids: kidGeo, bandTop: y, bandH };
            y += bandH + PARENT_GAP;
            return layout;
        });

        const contentBottom = y - PARENT_GAP + PAD_TOP;
        const rightEdge = anyKids ? (CHILD.x + CHILD.w) : (PARENT.x + PARENT.w);
        const contentRight = rightEdge + PAD_SIDE;

        // Centrado del bloque dentro del lienzo cuando sobra espacio: sin
        // esto el diagrama queda pegado arriba-izquierda y la mitad inferior
        // del card se ve vacia (parece que falta contenido). Si el contenido
        // NO cabe, el offset es 0 y manda el scroll.
        const offsetX = Math.max(0, (canvas.clientWidth  - contentRight)  / 2);
        const offsetY = Math.max(0, (canvas.clientHeight - contentBottom) / 2);

        parentLayout.forEach((pl) => {
            pl.x += offsetX;
            pl.y += offsetY;
            pl.kids.forEach((kg) => { kg.x += offsetX; kg.y += offsetY; });
        });

        const stageW = contentRight;
        const stageH = contentBottom;

        stage.style.width  = `${stageW}px`;
        stage.style.height = `${stageH}px`;
        svg.setAttribute('width',  stageW);
        svg.setAttribute('height', stageH);

        // 2) Nodo raíz, centrado verticalmente respecto a las bandas.
        const bandsMid = (PAD_TOP + (y - PARENT_GAP)) / 2;
        const rootX = ROOT.x + offsetX;
        const rootY = Math.max(PAD_TOP, bandsMid - ROOT.h / 2) + offsetY;
        const rootGeo = { x: rootX, y: rootY, w: ROOT.w, h: ROOT.h };
        const rootEl = makeNode('root', plural(parents.length, 'vault'), rootGeo, 0);
        const rootAnchor = { x: rootX + ROOT.w, y: rootY + ROOT.h / 2 };

        // Índices para el resaltado por relación.
        const parentEntries = []; // { el, rootLink, childLinks[], childEls[] }
        let delay = 60;

        parentLayout.forEach((pl) => {
            // Conector root → padre.
            const pAnchorL = { x: pl.x, y: pl.y + pl.h / 2 };
            const rootLink = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            rootLink.setAttribute('d', curve(rootAnchor.x, rootAnchor.y, pAnchorL.x, pAnchorL.y));
            rootLink.setAttribute('class', 'schema-link link-root');
            svg.appendChild(rootLink);

            // Nodo padre.
            const pMeta = `⛏ ${entries(entryCount(pl.rec))} · 📦 ${plural(pl.kids.length, 'chest')}`;
            const pEl = makeNode('parent', { name: pl.rec.name, meta: pMeta }, pl, delay);
            delay += 45;

            const rec = { el: pEl, rootLink, childLinks: [], childEls: [] };

            // Conectores + nodos hijos.
            const pAnchorR = { x: pl.x + pl.w, y: pl.y + pl.h / 2 };
            pl.kids.forEach((kg) => {
                const kAnchorL = { x: kg.x, y: kg.y + kg.h / 2 };
                const link = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                link.setAttribute('d', curve(pAnchorR.x, pAnchorR.y, kAnchorL.x, kAnchorL.y));
                link.setAttribute('class', 'schema-link');
                svg.appendChild(link);

                const kMeta = `⛏ ${entries(entryCount(kg.rec))}`;
                const kEl = makeNode('child', { name: kg.rec.name, meta: kMeta }, kg, delay);
                delay += 35;

                rec.childLinks.push(link);
                rec.childEls.push(kEl);
                stage.appendChild(kEl);

                // Hover en hijo → él + su conector + su padre + root-link + root.
                kEl.addEventListener('mouseenter', () => highlight([kEl, pEl, rootEl], [link, rootLink]));
                kEl.addEventListener('mouseleave', clearHighlight);
            });

            stage.appendChild(pEl);

            // Hover en padre → padre + root + sus hijos + todos sus conectores.
            pEl.addEventListener('mouseenter', () =>
                highlight([pEl, rootEl, ...rec.childEls], [rootLink, ...rec.childLinks]));
            pEl.addEventListener('mouseleave', clearHighlight);

            parentEntries.push(rec);
        });

        stage.appendChild(rootEl);

        // Hover en root → todo el primer nivel (root-links + padres).
        rootEl.addEventListener('mouseenter', () =>
            highlight([rootEl, ...parentEntries.map(r => r.el)], parentEntries.map(r => r.rootLink)));
        rootEl.addEventListener('mouseleave', clearHighlight);

        function highlight(nodeEls, linkEls) {
            stage.classList.add('dimmed');
            nodeEls.forEach(n => n.classList.add('is-active'));
            linkEls.forEach(l => l.classList.add('is-active'));
        }
        function clearHighlight() {
            stage.classList.remove('dimmed');
            stage.querySelectorAll('.is-active').forEach(e => e.classList.remove('is-active'));
        }
    }

    // ── Init ────────────────────────────────────────────────────
    async function init() {
        const canvas  = document.getElementById('schemaCanvas');
        const stage   = document.getElementById('schemaStage');
        const svg     = document.getElementById('schemaLinks');
        const emptyEl = document.getElementById('schemaEmpty');
        if (!canvas || !stage || !svg) return;

        let allDbs = [];
        try {
            allDbs = await loadAll();
        } catch (e) {
            console.error('[Schema] No se pudo leer la base de datos:', e);
            emptyEl.hidden = false;
            return;
        }

        let lastW = 0;
        let lastH = 0;
        let pending = 0;

        function draw() {
            lastW = canvas.clientWidth;
            lastH = canvas.clientHeight;
            render(allDbs, canvas, stage, svg, emptyEl);
        }

        draw();

        // Recalcula el layout si cambia el tamaño de la ventana del popup.
        // Se agrupa en un requestAnimationFrame y se descarta si el lienzo
        // mide lo mismo que en el último dibujo: el popup se auto-dimensiona
        // según su contenido, así que redibujar a ciegas en cada `resize`
        // puede realimentarse y hacer parpadear el diagrama.
        window.addEventListener('resize', () => {
            if (pending) cancelAnimationFrame(pending);
            pending = requestAnimationFrame(() => {
                pending = 0;
                if (canvas.clientWidth === lastW && canvas.clientHeight === lastH) return;
                draw();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
