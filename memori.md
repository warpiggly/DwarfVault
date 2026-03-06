 DwarfVault - Memoria del proyecto

## Stack
- Chrome Extension Manifest V3
- HTML + CSS + Vanilla JavaScript
- IndexedDB (`Dott-yDB`, versión 2, store `databases`)

## Arquitectura principal
- `manifest.json` — Permisos, service worker, content scripts
- `background.js` — Service worker: menú contextual, guardar texto, mensajes
- `popup.js` — UI principal (index.html): CRUD de BDs, RELICS, importar/exportar
- `Viewboard.js` — Vista de tablas (View Board.html)
- `scripts/db.js` — Módulo compartido: `openDatabase(callback)` (callback-based)
- `scripts/Menu.js` — Hamburger menu (compartido por todas las páginas)
- `scripts/Butons.js` — Animación del GIF del enano en el header

## Modelo de datos
Cada registro en IndexedDB tiene:
```js
{ name: string, entries: Array<{text, url, favicon, date}>, parentDatabase: string|null }
```
- `parentDatabase === null` → BD padre o independiente
- `parentDatabase === "NombrePadre"` → BD hija

## IDs del menú contextual (background.js)
Usan `::` como separador para evitar conflictos con nombres que tengan `_`:
- `save::NombreBD` → guardar texto seleccionado
- `copy::NombreBD::indice` → abrir popup con entrada

## Bugs corregidos (sesión de refactoring)
1. `overwriteDatabaseEntry` (background.js) — eliminado; sobrescribía datos cada 5s
2. `deleteObjectStore` en `onupgradeneeded` — corregido; nunca borrar store existente
3. XSS en `entryUrlElement.innerHTML` con URL — corregido con `createElement`
4. `onInstalled` listener duplicado — eliminado el duplicado
5. `split("_")` para parsear IDs de menú — reemplazado por `lastIndexOf("::")`
6. `chrome.commands.onCommand` roto — corregido (usaba openPopup como URL)
7. `searchBar` sin implementar — implementado en popup.js
8. `clipboardRead` permiso no usado — eliminado de manifest.json

## Archivos CSS
- `styles.css` → popup (index.html)
- `styles Board.css` → View Board (View Board.html) + clases de Viewboard.js
- `styles History.css` → History.html

## Notas
- `scripts/db.js` debe incluirse ANTES de popup.js y Viewboard.js en los HTMLs
- background.js tiene su propia versión Promise-based de openDatabase (no usa db.js)
- Nombres de archivo con espacios: `styles Board.css`, `View Board.html` — no renombrar sin actualizar referencias

## Ícono de la base de datos (sección "View Saved Data")

-📂 NombrePadre [2 sub-DB] → tiene bases de datos hijas
-🗃️ NombreIndependiente → base de datos sin hijos
Cada entrada guardada

## Antes: 📜 1: Lorem ipsum dolor sit amet...

## Ahora: 📜 1: [github.com] Lorem ipsum dolor sit...

-Si la entrada no tiene URL guardada (caso raro), sigue mostrando solo el texto sin corchetes. El favicon en sí no puede mostrarse como imagen dentro de un menú contextual del navegador (la API de Chrome no lo permite en items individuales), pero el dominio cumple la misma función de identificar la página de origen.
