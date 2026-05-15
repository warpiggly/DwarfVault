# Reseña UX/UI — DwarfVault v1.2

**Autor de la reseña:** Diseñador UX/UI (rol asumido)
**Fecha:** 2026-05-08
**Alcance:** [index.html](index.html), [View Board.html](View%20Board.html), [History.html](History.html), [styles.css](styles.css), [styles Board.css](styles%20Board.css), [popup.js](popup.js), [background.js](background.js), [Viewboard.js](Viewboard.js), [manifest.json](manifest.json) y [README.md](README.md).

> **Tono:** crítica dura, honesta, sin maquillar. Si quieres que tu extensión la use alguien que no es tú, hay que mover muchas cosas. No es un juicio sobre tu trabajo — es un mapa de fricciones para que puedas atacar lo importante primero.

---

## 1. ¿Qué es DwarfVault, en realidad?

Después de leer todo el código y la documentación, esto es lo que la app hace en una frase honesta, sin marketing:

> **Es un guarda‑textos:** seleccionas texto en cualquier web, click derecho, lo metes en una "carpeta" (que tú creas), y luego lo recuperas con una búsqueda o un click en el menú contextual. Más adelante, búsqueda semántica con IA.

Eso es todo. No es una "base de datos". No es un "vault dwárfico". No es un "forge". Es un **bloc de notas inteligente conectado al navegador**, con jerarquía padre/hijo y backups CSV/JSON.

**El problema fundamental ya empieza aquí:** durante 15 minutos leyendo tu propio README, manifest y HTML, tuve que **traducir constantemente** lo que cada cosa hace. Si yo tardo 15 minutos, un usuario nuevo abandona en 30 segundos.

---

## 2. Reseña del diseño frontend (lo bueno, lo malo, lo feo)

### 2.1. Lo que está bien hecho

No todo es malo. Crédito donde toca:

- **Identidad visual fuerte y memorable.** La paleta marrón/dorado/parchment con la mascota animada (Dott-y) es **distintiva**. En un mar de extensiones grises, esta destaca. Eso vale dinero.
- **Modal de edición y de confirmación de borrado** ([popup.js:635-857](popup.js#L635-L857)): bien hecho. Foco en Cancel para evitar borrados accidentales, atajo Esc, click fuera cancela, Ctrl+Enter guarda. **Esto es UX competente.**
- **Endurecimiento de seguridad:** sanitización de URLs, favicons, nombres de BD. CSP estricta. Validación de imports. Esto raramente se hace en proyectos personales — bien.
- **Persistencia de la BD seleccionada** ([popup.js:457-484](popup.js#L457-L484)): el usuario no pierde su contexto entre aperturas. Es un detalle invisible pero fundamental.
- **Quick Access ⛓️ LINK** sincronizando Favorites + Links: la idea es buena. La intención es buena. La ejecución es opaca, pero la intención cuenta.
- **Tooltip con texto completo en hover** sobre cada entrada listada: pequeño detalle, gran impacto.
- **Service worker que reconstruye el menú contextual al cambiar de BD:** funciona, es robusto.

### 2.2. Lo que está mal — viable, pero con fricciones serias

#### **2.2.1. La metáfora dwárfica te está hundiendo.**

Esto es lo más grave del diseño. Repaso del **vocabulario inventado**:

| Lo que la app llama | Lo que realmente es |
|---|---|
| **Dwarf Vault** | La extensión |
| **Dwarf Chamber** | Un selector dropdown |
| **Vault** (Parent) | Una carpeta/categoría |
| **Chest** (Child) | Una subcarpeta |
| **Forge** | Panel de gestión |
| **Reforge** | Renombrar |
| **Destroy** | Borrar |
| **Relics** | Las entradas guardadas |
| **Runes** | El panel de la última entrada copiada |
| **Glyph Vault** | Selector de emojis |
| **Trade** | Importar/Exportar |
| **Sync Both / Link** | Vincular dos selectores |

**Once términos inventados.** Un usuario tiene que aprenderlos todos antes de poder usar la herramienta. ¿Sabes cómo lo intuyo? Porque tú mismo, en tu propio HTML, **ya escribiste las traducciones al lado** ([index.html:81-82](index.html#L81-L82)):

```
🛠️ REFORGE   Edit
💀 DESTROY   Delete
⛏️ NEW VAULT Parent
🔨 NEW CHEST Child
```

Tu propio diseño te está gritando *"el usuario no entiende esto"*. Si tienes que poner el subtítulo aclaratorio en el botón, **el botón está mal etiquetado**. La metáfora no está enseñando, está estorbando.

**Verdadero indicador del problema:** un niño que abriera la app no podría siquiera identificar qué hacer primero. No hay un punto de entrada obvio. El primer botón visible se llama "FORGE 🔨" — no significa nada para nadie que no haya leído el tutorial primero.

#### **2.2.2. El primer impacto visual es ruido, no información.**

Cuando un usuario abre el popup por primera vez, ve, en este orden:

1. Un GIF gigante (175px) de un enano agitándose.
2. Un título en fuente "Pixeled" (8-bit) que dice "DWARF VAULT".
3. Un subtítulo "Copy 🏔️ Text" que **no explica qué hace la app**.
4. Otro botón gigante con imagen de fondo que dice "RUNES ⚔️".
5. Tres líneas de texto que dicen "No text selected yet" / "Index: Not available" / "No text selected yet".
6. Un botón "Copy Text" que no tiene nada que copiar.
7. Otro botón gigante "FORGE 🔨".
8. Otro botón gigante "RELICS 🏰".

**Resumen del primer impacto:** "Hay un enano. Hay tres cosas vacías. Hay tres botones que no sé qué hacen. ¿Qué hago aquí?"

Cero pistas sobre la acción principal: **selecciona texto en una web → click derecho → guárdalo**. La acción principal no está en el popup. El popup solo gestiona lo que ya guardaste. Ese desencuentro mental es brutal.

#### **2.2.3. Tres fuentes personalizadas, ninguna jerarquía clara.**

[styles.css:1-21](styles.css#L1-L21) — cargas:
- `Pixeled` (estilo retro 8-bit) — para el header
- `SofadiOne-Regular` (decorativa con serifs) — para H2 y toggle labels
- `Righteous-Regular` (geométrica chunky) — para casi todo lo demás

**Tres fuentes display, cero fuente para texto largo.** Cuando un usuario lee el texto guardado en una entrada — el contenido **real** que la app debería presentar bien — lo ve en `Righteous-Regular monospace` (mezcla rara), una fuente *display* nada pensada para legibilidad. Las fuentes decorativas están bien para el branding, mal para los datos.

#### **2.2.4. Uso patológico de `prompt()`, `alert()` y `confirm()`.**

Esto es un dolor genuino. Ejemplos del código actual ([popup.js:62-111](popup.js#L62-L111)):

- Crear BD padre → `prompt("Enter the name of the new PARENT database:")`
- Crear BD hija → `prompt(...)` + `confirm("OK = Yes (choose parent)\nCancel = No (create as independent)")`
- Elegir padre → `prompt("Available parent databases:\n\n1. X\n2. Y\n\nEnter the number:")`

**La última es la peor de tu app.** Le pides al usuario que **memorice una lista numerada y escriba un número** para elegir un padre. Eso es UX de los años 90. Estamos en 2026. Tienes el modal de edición funcionando perfectamente; **úsalo para todo**.

El `confirm("OK = Yes\nCancel = No")` es cómico. Es admitir que tu propia interfaz no comunica qué botón hace qué.

#### **2.2.5. El header ocupa el 25% de la altura del popup.**

Body es 500×700px ([styles.css:23-31](styles.css#L23-L31)).
Header con padding 90px superior + GIF de 175px = **~180-200px de altura solo para el branding**.

**De 700px de altura útil, regalas 200px al logo.** Eso es casi un tercio. Cuando el usuario abre la lista de entradas (RELICS), tiene que hacer scroll para ver más de 2-3 elementos. **El branding está canibalizando la función.**

#### **2.2.6. El menú hamburguesa es engañoso.**

[index.html:11-25](index.html#L11-L25) — el menú lateral solo tiene 3 ítems:
- HOME
- TABLES
- TUTORIAL

Tres enlaces. Y para acceder a ellos tienes que:
1. Identificar el icono hamburguesa (esquina superior izquierda — colocación rara).
2. Click para deslizar el menú lateral.
3. Click en el ítem.

Tres clicks para ir a una de tres páginas. Una **fila de tabs en el header** lo resolvería en un click y sin animación. El hamburguesa es un patrón móvil aplicado a un popup de escritorio donde no hace ninguna falta.

#### **2.2.7. Los toggles FORGE / RELICS son imágenes con texto encima.**

[index.html:56-58](index.html#L56-L58) y [styles.css:419-446](styles.css#L419-L446) — un `<input type="checkbox">` oculto con un `<label>` que tiene `background-image: url('image/Boton 3.png')`.

Problemas:
- **No hay indicador visual del estado** (abierto/cerrado). El botón se ve igual antes y después de hacer click.
- **No es accesible:** un lector de pantalla anuncia un checkbox sin contexto.
- **No tiene affordance:** parece un banner decorativo, no un botón. La textura PNG con texto encima parece un encabezado de sección, no un control.

#### **2.2.8. La sección RUNES siempre está visible aunque esté vacía.**

Cuando no hay texto seleccionado, el popup muestra:
```
RUNES ⚔️
[favicon vacío]
Index: Not available
No text selected yet.
No text selected yet.
[Copy Text] (botón inútil)
```

**150px de pantalla mostrando tres veces "no hay nada".** Un estado vacío correcto es: ocultar la sección o mostrar **una sola línea explicativa** (*"Selecciona texto en una web y guárdalo con click derecho"*).

#### **2.2.9. Inconsistencia HOME vs TABLES vs TUTORIAL.**

Tres páginas, **tres estilos de fondo distintos**:
- HOME: fondo `image/back.png`
- TABLES: fondo `Gemini_Generated_Image_4i7a8i4i7a8i4i7a.jfif` (ese nombre de archivo cantando)
- TUTORIAL: hereda de styles History.css

Tres archivos CSS separados (`styles.css`, `styles Board.css`, `styles History.css`) con reglas duplicadas (la fuente, el header, el menú, la scrollbar...). Tres fuentes de verdad para los mismos componentes. **Cuando cambies algo del header, vas a olvidarte de un archivo y se desincronizará.**

#### **2.2.10. La búsqueda solo busca en index y texto.**

[popup.js:254-279](popup.js#L254-L279) — `entry.text.toLowerCase().includes(query) || String(originalIndex + 1).includes(query)`.

No busca por:
- URL
- Dominio (hostname)
- Fecha
- Nombre de la BD

El usuario que recuerda *"guardé algo de YouTube hace dos días"* no puede encontrarlo. El search es funcionalmente débil.

#### **2.2.11. La lista de entradas (RELICS) muestra solo la primera línea.**

[popup.js:586-593](popup.js#L586-L593) — `entry.text.split('\n')[0]` como preview.

Si guardé un párrafo de 5 líneas, en la lista veo solo la primera línea. **Sin manera de ver más sin abrir Edit o sin pasar el mouse para ver el tooltip.** Tooltips son un fallback, no UX primaria.

#### **2.2.12. No hay vista previa de la BD seleccionada.**

El selector "DWARF CHAMBER" muestra solo el nombre. No dice cuántas entradas tiene, cuándo fue la última actualización, si tiene hijos, nada. El menú contextual sí lo hace ([background.js:178](background.js#L178)) — *"Foo — 12 item(s) [3 sub-DB]"* — pero el dropdown principal del popup, no. Inconsistencia.

#### **2.2.13. Mezcla de idiomas en el código y la UI.**

- Comentarios y nombres de variable en español.
- UI en inglés.
- Algunas variables como `enanoGif`, `botón`, `toggleForja`, `toggleReliquias`, `texto-movible` (en español) conviven con `databaseSelect`, `searchBar`, `entriesList` (en inglés).

Esto **no afecta al usuario final**, pero afecta a cualquiera que mire el código (incluido tú dentro de seis meses). Para un proyecto que aspira a colaboradores, hay que decidir un idioma.

#### **2.2.14. Mascota Dott-y vs Dwarf Vault.**

El alt del logo dice *"Dott-y logo"* ([index.html:29](index.html#L29)) pero la app se llama "Dwarf Vault". El manifest dice `"name": "The Dwarf's Vault"`. El README dice `DwarfVault`. La mascota tiene nombre propio (*Dott-y*) pero **nunca se introduce al usuario**. Es un personaje que aparece, no se presenta, y desaparece. Si la mascota es importante, dale voz: *"Hola, soy Dott-y. Te ayudo a guardar..."* Si no, quita la confusión.

#### **2.2.15. Sin estados de carga ni estados de error visibles.**

- Cuando carga la BD inicial: el `<select>` muestra *"Loading databases..."* y nada más.
- Cuando falla un `openDatabase`: error en consola, **silencio** en la UI.
- Cuando importas un CSV inválido: `alert("Invalid CSV format.")` — sin detalle.

El usuario no técnico, ante un alert vacío, **cierra la extensión y no la abre más**. Falta una capa de feedback de error mínimamente útil.

### 2.3. Lo feo — fricciones que rompen la confianza

- **Los nombres de archivo:** [image/Gemini_Generated_Image_4i7a8i4i7a8i4i7a.jfif](image/Gemini_Generated_Image_4i7a8i4i7a8i4i7a.jfif), `1.jpg`, `2.jpg`, `Boton 3.png` (¡con espacio!), `View Board.html` (con espacio en HTML — buena suerte cuando lo despliegues). Esto va a romper algo en algún momento.
- **CSS con `!important`** en `.entry-content-centered` ([styles.css:850-856](styles.css#L850-L856)) y la sobrescritura de hover de tabla (Board.css:297-301). El `!important` es síntoma de que el CSS está peleándose con sí mismo.
- **`window.close()` después de copiar** ([popup.js:51](popup.js#L51)). Cierras el popup automáticamente cuando el usuario copia texto. **Esto rompe expectativas:** un usuario que quiere copiar y mirar otra cosa, se queda sin popup. Decide tú o decide él, pero no decidas tú sin avisar.
- **Cinco scripts cargados en orden con `<script>` clásico** ([index.html:153-159](index.html#L153-L159)). Sin módulos ES, sin `defer`. El popup carga todo síncronamente, lo cual es OK por su tamaño, pero estilísticamente está atascado en 2015.
- **Texto del botón con doble función:** `"⛓️ LINK — Sync Favorites & Links"` cuando inactivo, `"⛓️ LINKED ✓ — Favorites & Links in sync"` cuando activo. Dos textos largos en la misma posición visual. Un toggle visual (color + icono) sería más rápido de leer.

### 2.4. Veredicto sobre el diseño actual

**¿Es viable?** Sí, **funcionalmente**. La app hace lo que promete y lo hace de manera robusta.

**¿Es buen diseño?** No, **no para usuarios externos**. Está diseñado **para ti**, por ti, con tu vocabulario y tu estética. Para un usuario nuevo —especialmente uno que "no conoce de bases de datos"— es opaco, lento de entender, y da más placer estético al desarrollador que utilidad al usuario.

**Calificación honesta del frontend actual:** **5.5/10** para un developer tool, **3/10** para una app dirigida a *"hasta un niño la entiende"*. La distancia entre esos dos números es exactamente el trabajo que tienes por delante.

---

## 3. Ideas para mejorar la UX (que un niño lo entienda)

Esto es lo que cambiaría — en orden de impacto, de mayor a menor. Prioriza arriba.

### 3.1. **Renombra TODO con palabras humanas. Hoy.**

Cambio inmediato. Mantén la estética dwárfica como **tema visual** (colores, fuentes, mascota), pero las **palabras** son del usuario, no tuyas:

| Actual (fantasy) | Cambio recomendado | Justificación |
|---|---|---|
| FORGE | **Manage** o **Settings** | Es lo que es |
| Dwarf Chamber | **Folder** o **Library** | El select principal |
| Vault (parent) | **Folder** | Carpeta. Todo el mundo lo entiende. |
| Chest (child) | **Subfolder** | Carpeta dentro de carpeta. |
| NEW VAULT | **+ New Folder** | El "+" lo deja claro |
| NEW CHEST | **+ New Subfolder** | Idem |
| REFORGE | **Rename** | Esa es la palabra |
| DESTROY | **Delete** | Esa es la palabra |
| RELICS | **Saved Items** o **My Notes** | Los items guardados |
| RUNES | **Last Saved** o **Just Saved** | El panel superior |
| Glyph Vault | **Symbols** o **Emojis** | Es un selector de emojis |
| Trade | **Backup & Restore** | Lo que hace |

**No pierdes identidad.** El estilo visual sigue siendo dwárfico. **Ganas claridad** y la curva de aprendizaje pasa de 10 minutos a 30 segundos.

Si te resistes — y entiendo que la estética es parte del orgullo del proyecto — al menos haz que **el primer label sea humano y la palabra fantasía sea el subtítulo**, no al revés:

```
[antes]   🛠️ REFORGE     Edit
[después] ✏️ Rename       (forge: reforge)
```

### 3.2. **Reescribe el primer impacto del popup.**

Cuando el usuario abre el popup **por primera vez** (BD vacías, sin texto seleccionado), muestra una pantalla de bienvenida:

```
[ilustración pequeña de Dott-y]
Welcome to DwarfVault

It saves text from any website.

How it works:
1. Select text on any page
2. Right-click → Save to Vault
3. Find it again here

[Create your first folder] (botón grande primario)
```

**Una sola acción, un solo objetivo, un solo camino.** Cuando ya tenga al menos una BD creada, ese onboarding desaparece y aparece la UI normal. Esto se llama **empty state guiado**, y es la diferencia entre un usuario que se queda y uno que cierra y desinstala.

### 3.3. **Reduce el header a la mitad.**

El logo + título + subtítulo no necesitan **200px verticales**. Ocupan ese espacio porque tú lo elegiste, no porque la jerarquía visual lo pida.

Propuesta:
- Header de **80-100px máximo**.
- GIF de Dott-y a **64-80px** (sigue siendo visible, sigue siendo monísimo).
- Título alineado a la derecha del GIF, no debajo.
- Subtítulo eliminado, o convertido en texto de ayuda contextual.

**Ganas 100-120px de espacio útil para los datos del usuario.** Eso son 3-4 entradas más visibles sin scroll.

### 3.4. **Mata `prompt()`, `alert()` y `confirm()`. Todos.**

Ya tienes el componente de modal funcionando. Úsalo para:

- **Crear BD nueva** → modal con un input, validación en vivo (rojo si el nombre existe), botón Save deshabilitado hasta que sea válido.
- **Crear BD hija** → mismo modal con un dropdown adicional "Inside folder:" que ya lista los padres disponibles, sin números.
- **Renombrar** → modal con input pre-poblado.
- **Confirmar borrado** → ya lo tienes bien hecho. Reusa.
- **Errores de import** → modal con detalle: "Línea 3: URL inválida (saltada). Total: 23 entradas importadas, 1 saltada."

`alert()` y `confirm()` son **del navegador**, no de tu app. Cada vez que aparece uno, el usuario sale visualmente de tu UI y entra en una caja gris genérica de Chrome. **Rompe la inmersión que te esfuerzas por crear.**

### 3.5. **Convierte el menú hamburguesa en tabs en el header.**

Tres enlaces no merecen un menú lateral. Un row de tabs:

```
[🏠 Home]  [📊 Tables]  [❓ Help]
```

Click directo, estado activo visible (la tab actual subrayada/iluminada), cero animación. El menú lateral es para 7+ ítems y para móvil. **No es tu caso.**

### 3.6. **Diseña el estado "RUNES vacío" de forma útil.**

Cuando no hay nada copiado:

```
┌──────────────────────────────────────┐
│  Selecciona texto en cualquier web,  │
│  click derecho → "Save to Vault" 📥   │
│                                       │
│  Tu última entrada copiada aparecerá  │
│  aquí.                                │
└──────────────────────────────────────┘
```

**Una caja de ayuda contextual.** En lugar de tres "No text selected yet" repetidos. Esto le enseña al usuario nuevo el flujo principal **sin tener que ir al tutorial**.

### 3.7. **Mejora la búsqueda.**

- Buscar también por URL/dominio.
- Filtros rápidos por chips: `[All] [Today] [This week] [Has link]`.
- Ordenar por: fecha, nombre, longitud.
- Resaltar el texto coincidente en los resultados (`<mark>`).

La búsqueda es el corazón de una app de retrieval. Si no es buena, la app pierde su razón.

### 3.8. **Lista de entradas más rica.**

Cada `<li>` debería mostrar:

```
┌─────────────────────────────────────────┐
│ [favicon] [#3]  Lorem ipsum dolor sit... │
│                 youtube.com · 2 days ago │
│                                  [⋯]    │
└─────────────────────────────────────────┘
```

- **Dominio** debajo del texto (no oculto).
- **Fecha relativa** (hoy / ayer / hace 3 días) en lugar de ocultarla.
- **Menú "⋯"** con Edit / Copy / Delete en lugar de tener Edit + Delete siempre visibles ocupando espacio.
- **2-3 líneas** de preview, no 1.

### 3.9. **Onboarding interactivo de 30 segundos.**

Al instalar la extensión, lanza una pestaña con un **tour interactivo**:

1. Pantalla 1: *"Tu primer vault — vamos a crearlo"* + un campo donde escribes el nombre.
2. Pantalla 2: *"Selecciona el texto en este párrafo de ejemplo y haz click derecho"* (con texto de prueba real en la página).
3. Pantalla 3: *"Lo encontraste. Ya lo has hecho. Listo."*

Tres pasos, tres minutos máximo, **un usuario que ya sabe usar la app antes de cerrar la pestaña**. La inversión en este onboarding paga durante años.

### 3.10. **Iconografía más universal y menos emojis.**

Tienes **emojis en todas partes**: 🗃️ 📜 📖 🏔️ ⚔️ 🔨 🏛️ 💎 ⛏️ 💀 🛠️ 📤 📥 📦 🗃️ ⛓️ ⭐ 🔗 🔔 🔒 🏰 ✏️ 🗑

Problemas:
- **Distintos sistemas operativos los renderizan diferente.** Lo que ves en Windows es distinto a Mac, distinto a Linux.
- **Sobrecarga visual.** Cuando todo es decoración, nada destaca.
- **No comunican función** consistentemente. ¿Qué hace 🏛️ vs 🏰? ¿Por qué REFORGE es 🛠️ y NEW VAULT es ⛏️?

Sugerencia: usa **iconos SVG inline** (Heroicons, Lucide, Tabler — gratis, MIT) para los controles funcionales (edit, delete, copy, search, settings). Reserva los emojis para **acentos decorativos no funcionales** (la mascota, el header, los empty states). Resultado: control visual + identidad mantenida.

### 3.11. **Unifica los 3 archivos CSS.**

`styles.css` + `styles Board.css` + `styles History.css` con reglas duplicadas → un único `styles.css` con secciones por página. Ahorras mantenimiento, evitas desincronizaciones, y reduces el peso (los `@font-face` se cargan una sola vez).

### 3.12. **Muestra un contador en el selector principal.**

Cambia las opciones del `<select>` de:

```
Foo
  ↳ Bar
```

a:

```
Foo (12)
  ↳ Bar (3)
```

El usuario sabe **al instante** dónde está su contenido sin tener que abrir cada uno.

### 3.13. **Atajos de teclado visibles.**

Ya tienes `Ctrl+Y` para abrir el popup. **No lo dice nadie en la UI**. Añade:
- En el tutorial: `Ctrl+Y` claramente.
- En el header del popup: una tooltip pequeña *"Ctrl+Y"*.
- En cada modal: hint *"Esc to close · Ctrl+Enter to save"*.

Los power users te lo agradecerán y los nuevos descubrirán features en lugar de quedarse sin saber.

### 3.14. **Considera el caso "no soy técnico".**

Para llegar a *"hasta un niño lo entiende"*, hay cosas que **directamente sobran** en la primera versión que ve un usuario nuevo:

- **TRADE — Import & Export** → escóndelo en un *"Advanced"* desplegable. Un usuario nuevo no hace backups antes de tener datos.
- **SETTINGS** → escóndelo igual. Las notificaciones encendidas por defecto, el "Native Click" oculto a menos que el usuario lo necesite.
- **Quick Access** → la idea es buena, pero introducirla con esos términos (Favorites, Links, ⛓ LINK) es abrumador. Renombra a algo como *"Atajos del click derecho"* y ponlo en un acordeón secundario.

**Regla de oro:** lo principal en la UI inicial debe ser **2-3 cosas máximo**. Todo lo demás, plegable, oculto, descubrible bajo demanda. Hoy mismo cuentas **9 secciones visibles** en FORGE.

### 3.15. **Reescribe la página de tutorial como flujo, no como referencia.**

Hoy, [History.html](History.html) es una **lista enciclopédica** de todo lo que la app hace, organizada por feature. Eso es **referencia técnica**, no tutorial.

Un tutorial de verdad es un **camino**:

```
Paso 1: Crea tu primera carpeta. (con captura)
Paso 2: Guarda tu primer texto. (con captura)
Paso 3: Encuéntralo otra vez. (con captura)
Paso 4 (opcional): Organízalo en subcarpetas.
```

Cuatro pasos. Cuatro minutos. **El usuario sale sabiendo usar el 80% de la app.** El otro 20% lo descubrirá explorando, sin necesidad de leer.

---

## 4. Resumen ejecutivo (TL;DR)

**Lo que tienes:** una app robusta, técnicamente sólida, con identidad visual fuerte y una arquitectura de código razonable. Hay decisiones técnicas brillantes (modales, sanitización, cache de menús, sync de Quick Access).

**Lo que te frena:**
1. **El vocabulario inventado pesa más que la función.** El usuario aprende una lengua antes de usar la herramienta.
2. **El primer impacto no enseña.** Hay branding antes que utilidad.
3. **Diálogos nativos del navegador** rompen la inmersión que tu propio diseño construye.
4. **El header se come la pantalla** y los datos del usuario quedan en segundo plano.
5. **No hay onboarding.** El usuario nuevo está solo frente a ocho secciones desconocidas.

**Si pudieras hacer SOLO TRES cosas, en orden:**

1. **Renombrar todo a palabras humanas** (mantén el tema, cambia las etiquetas).
2. **Sustituir todos los `prompt`/`confirm` por modales propios** (ya tienes la base hecha).
3. **Diseñar el estado vacío del popup** como una pantalla de bienvenida que enseñe el flujo en 3 pasos.

Eso solo, sin tocar una sola línea más, **dobla la usabilidad** de la app.

**Veredicto final:** la app es **viable**. El diseño actual es **un techo**. Si quieres romper ese techo y llegar a usuarios reales — no a desarrolladores con paciencia para aprender tu metáfora — el trabajo es claro y prioritizable. La buena noticia: la base técnica para hacerlo ya la tienes. **Lo que falta no es más código; es menos vocabulario y más empatía con quien la abre por primera vez.**

---

*Esta reseña es una opinión técnica argumentada, no una sentencia. Eres el dueño del producto y de las decisiones. Si una metáfora dwárfica es parte de tu visión irrenunciable, mantenla — pero conscientemente, sabiendo el coste que tiene.*

---
---
---

&nbsp;

# 📎 ANEXO — Análisis del menú contextual (right-click)

> **Sección independiente.** Este anexo se añadió después del análisis principal y se centra exclusivamente en el menú contextual del navegador (el que aparece al hacer click derecho sobre una página o sobre texto seleccionado). No reemplaza ni modifica ninguna conclusión anterior.
>
> **Archivo analizado:** [background.js](background.js)
> **Fecha:** 2026-05-08

---

## A.1. ¿Funciona? Sí, técnicamente bien.

El service worker está sólido. El código de [background.js](background.js) maneja casos que mucha gente olvida:

- **Cache de BDs en memoria** con fallback a IndexedDB cuando el SW se duerme y se reactiva ([background.js:429-433](background.js#L429-L433)).
- **Captura del texto seleccionado vía `executeScript`** para preservar `\n` reales ([background.js:382-394](background.js#L382-L394)) — `info.selectionText` los colapsaría. Esto es un detalle inteligente.
- **Doble método de copia** (`execCommand` síncrono + fallback a `navigator.clipboard`) ([background.js:450-471](background.js#L450-L471)) — robusto frente a páginas con permisos restrictivos.
- **Validación de URL antes de abrir** en Links ([background.js:507-518](background.js#L507-L518)) — bloquea `javascript:`/`data:` si vinieran de un import.
- **Saneamiento de nombres** en los títulos del menú con `DwarfSecurity.sanitizeDbName` para que un nombre con saltos de línea no rompa el layout.
- **Reconstrucción tras cambios** vía mensajes desde el popup.

**Veredicto técnico: 8/10.** Es de las mejores partes del proyecto.

---

## A.2. ¿Es entendible? No, para nadie que no seas tú.

Aquí está el problema gordo. El menú raíz "The Dwarf's Vault" mezcla **cinco paradigmas de acción distintos** bajo el mismo nombre, y un click en cada submenú hace algo conceptualmente diferente:

| Submenú | Click hace... | Tipo de acción |
|---|---|---|
| 📥 Save to Vault | **Escribe** una entrada nueva | Crear |
| ⭐ Favorites | **Copia** texto al portapapeles | Lectura/copia |
| 🔗 Links | **Abre URL** en nueva pestaña | Navegación |
| ⚙️ Set Active Vault | **Cambia configuración** global | Setup |
| 📂 Vault | **Abre el popup** con la entrada cargada | Navegación interna |

**Tres ítems que se ven idénticos en submenús distintos hacen tres cosas distintas al click.** El usuario tiene que recordar en qué rama está para saber qué pasará. Eso es un fallo de diseño puro.

---

## A.3. Problemas concretos del menú actual

**1. "Vault dentro de Vault".** El menú raíz es "The Dwarf's Vault" y dentro hay un submenú llamado "📂 Vault". Anidación de homónimos. Confuso.

**2. La explosión de ítems en "📂 Vault".** Iteras todas las BDs y dentro listas **todas las entradas**, una por una, como ítems de menú ([background.js:332-339](background.js#L332-L339)). Sin límite. Si tienes 5 vaults × 30 entradas = 150 ítems en submenús. Eso es navegacionalmente inviable. **Y además incoherente:** Favorites/Links sí están limitados a 15 ([background.js:214](background.js#L214) y [background.js:244](background.js#L244)), pero Vault no. ¿Por qué?

**3. "Set Active Vault" cambia AMBOS a la vez.** En el popup, Favorites y Links son **dos selectores independientes** con un botón opcional ⛓️ LINK para sincronizarlos. Pero desde el menú, "Set Active Vault" sobreescribe los dos sin preguntar ([background.js:529-533](background.js#L529-L533)). El modelo mental no coincide entre popup y menú.

**4. Sin estado vacío.** Si el usuario instala la extensión y aún no ha creado ninguna BD, hace click derecho con texto seleccionado y verá:
```
📥 Save to Vault 🏰
  (vacío — sin opciones)
```
Cero pistas. Ni *"Crea tu primera carpeta"*, ni un ítem que abra el popup. Un usuario nuevo se queda mirando el menú vacío y abandona.

**5. Sin "guardar en la última BD usada".** El flujo más común es guardar varias entradas seguidas en la misma BD. Hoy tienes que navegar `Save → Parent → Child` cada vez. Un ítem `📥 Save to "Foo" (last used)` arriba del todo ahorraría 2 clicks por entrada — lo que multiplicado por 50 entradas/día es muchísimo.

**6. Ítems sobrecargados de información.**
```
1. Foo — 12 item(s) [3 sub-DB] 🗂️
```
En un menú contextual donde el ancho es limitado: número + nombre + contador + indicador de hijos + emoji. Cinco piezas de info en una línea. El nombre — la única que importa al elegir — queda enterrado en medio.

**7. Falta un separador entre Favorites y Links.** Hoy aparecen pegados, pero son dos features distintas con dos comportamientos distintos. Visualmente parecen del mismo grupo.

**8. "⚙️ Set Active Vault" debería estar al final del menú, no en medio.** Es configuración, no uso diario. Hoy aparece **antes** de "📂 Vault", interrumpiendo el flujo de quien quiere navegar sus datos.

**9. No hay forma de deshacer un guardado erróneo desde el menú.** Si por accidente guardas texto en la BD equivocada, tienes que: abrir popup → cambiar selector → encontrar entrada → click delete → confirmar. Cinco pasos. Un `↶ Undo last save` en el menú lo resolvería en uno.

**10. La notificación de "Saved to DwarfVault" no dice qué.** Tras guardar, la notificación es genérica ([background.js:641-646](background.js#L641-L646)). No muestra preview del texto guardado ni en qué entrada cayó. Si guardas tres seguidos, no sabes si el orden fue el correcto.

**11. Performance al escalar.** Cada cambio (crear, editar, borrar) llama `loadDatabases` → `buildContextMenu` → `removeAll` + N llamadas a `create` ([background.js:136-368](background.js#L136-L368)). Con 200 entradas, son 200+ llamadas API por cada modificación. Funciona, pero a partir de cierto volumen se va a notar.

---

## A.4. ¿Qué cambiaría?

Por orden de impacto:

1. **Reorganiza el menú raíz** según la acción dominante:
   ```
   📥 Save to "[última BD]"     ← acción principal, primer ítem
   📥 Save to...                  ← submenú con todas las BDs
   ──────────
   ⭐ Quick Copy → Favorites      ← renombra "Favorites"
   🔗 Quick Open → Links          ← renombra "Links"
   ──────────
   📂 Browse my saved items       ← renombra "Vault"
   ──────────
   ⚙️ Settings                    ← al final, configuración
   ```
2. **Limita "Browse" a las últimas 10-15 entradas por BD** con un ítem final *"Open all in popup..."*. Hoy listas todo, lo cual no escala.
3. **Diseña el estado vacío:** si no hay BDs, mostrar un único ítem `📥 Create your first folder...` que abra el popup directamente.
4. **Separa Favorites y Links en "Set Active Vault":** dos submenús, uno por cada uno. El comportamiento del popup y del menú deben coincidir.
5. **Un solo lenguaje:** ya sea "Vault" en todas partes o "Folder" en todas partes. Hoy es Vault en el menú y Vault como submenú dentro del propio Vault.
6. **Notificación más informativa:** *"Saved to Foo: 'Lorem ipsum dol...'"* con preview de lo guardado.

---

## A.5. Resumen del anexo

- **Funciona técnicamente:** sí, y bien.
- **Se entiende a primera vista:** no. Mezcla cinco tipos de acción bajo el mismo paraguas, repite nombres, no tiene estado vacío, no escala, y la jerarquía no prioriza lo que el usuario hace más veces (guardar).
- **Esfuerzo para arreglarlo:** medio. La lógica está bien, lo que sobra es estructura y nomenclatura. Es más reordenar que reescribir.

*Fin del anexo.*
