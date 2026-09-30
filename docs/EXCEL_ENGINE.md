# Motor de Excel (.xlsx) de DwarfVault

DwarfVault lee y escribe archivos Excel `.xlsx` con un motor propio, sin librerías externas. Todo vive en un archivo: [`src/scripts/xlsx.js`](../src/scripts/xlsx.js) (~400 líneas). Este documento explica qué hace, cómo lo hace y dónde tocar si hay que cambiarlo.

---

## 1. Por qué un motor propio y no una librería

La extensión se va a publicar en **Chrome Web Store** y **Microsoft Edge Add-ons**. Eso pesó en la decisión:

| | Librería (SheetJS) | Motor propio |
|---|---|---|
| Peso en el paquete | ~1 MB | ~20 KB |
| Código de terceros que el revisor de la tienda tiene que aceptar | Sí (minificado) | No |
| Vulnerabilidades heredadas | La versión de npm (0.18.5) tiene CVEs conocidos; la corregida solo se baja de su CDN | Ninguna externa |
| Licencia a incluir | Apache 2.0 | Ninguna |
| Lo que cubre | Todo el formato Excel | Solo lo que DwarfVault necesita: texto, URLs, varias hojas |

Manifest V3 no permite cargar código remoto: cualquier librería habría que copiarla dentro de la extensión. Como DwarfVault solo mueve tablas de texto (`#, text, url, favicon`), no necesita fórmulas, gráficos ni formatos de número. Con un motor chico basta.

La pieza difícil de un `.xlsx` es la compresión, y esa ya viene en el navegador: `CompressionStream` / `DecompressionStream` con `'deflate-raw'` (Chrome y Edge 103+, Node 18+). El motor solo arma la "caja" ZIP y el XML de dentro.

---

## 2. Qué es un `.xlsx` por dentro

Un `.xlsx` es un **archivo ZIP** con varios XML dentro (formato Office Open XML, ISO/IEC 29500). Si cambias la extensión a `.zip` y lo abres, ves esto:

```
Notes.xlsx  (ZIP)
├── [Content_Types].xml          ← qué tipo de contenido es cada parte
├── _rels/
│   └── .rels                    ← "el documento principal está en xl/workbook.xml"
└── xl/
    ├── workbook.xml             ← lista de hojas (nombre + id)
    ├── _rels/
    │   └── workbook.xml.rels    ← id de hoja → archivo de la hoja; también styles
    ├── styles.xml               ← fuentes, negrita, ajuste de texto
    └── worksheets/
        ├── sheet1.xml           ← las celdas de la hoja 1
        └── sheet2.xml           ← ...
```

Las partes se encuentran siguiendo **relaciones** (`.rels`), no por nombre fijo. Excel suele usar `xl/workbook.xml`, pero otro programa puede usar otra ruta. El lector sigue las relaciones; el escritor usa siempre las rutas estándar.

---

## 3. Mapa del archivo `xlsx.js`

| Sección | Funciones | Qué hace |
|---|---|---|
| ZIP | `crc32`, `pipeThrough`, `zip`, `unzip` | Arma y abre el contenedor ZIP |
| XML | `xmlEscape`, `xmlUnescape`, `attrs`, `encodeXstring`, `decodeXstring`, `textRuns` | Escapar y desescapar texto, leer atributos |
| Celdas | `colName`, `colIndex` | `0 ↔ A`, `26 ↔ AA`, `"C7" → 2` |
| Hojas | `sheetNames` | Hace cumplir las reglas de Excel para nombres de hoja |
| Escritura | `STYLES`, `sheetXml`, `buildXlsx` | Filas → libro `.xlsx` |
| Lectura | `resolvePath`, `relsOf`, `parseSheet`, `readXlsx` | Libro `.xlsx` → filas |

API pública (objeto global `DwarfXlsx`, y `module.exports` para las pruebas en Node):

```js
// Escribir
const { bytes, truncated, names } = await DwarfXlsx.buildXlsx([
    { name: 'Notes', rows: [['#', 'text'], [1, 'hola']], widths: [6, 70] },
]);
new Blob([bytes], { type: DwarfXlsx.MIME });

// Leer
const sheets = await DwarfXlsx.readXlsx(uint8array);
// → [{ name: 'Notes', rows: [['#', 'text'], ['1', 'hola']] }]
```

- `rows`: matriz de filas. Al escribir, cada celda puede ser `string` o `number`. Al leer, todo sale como `string`.
- `truncated`: cuántas celdas se cortaron por el límite de Excel (ver §5.4).
- `names`: nombres de hoja finales, ya corregidos (ver §5.3).

El archivo es un IIFE que se cuelga de `self` (páginas y service worker) o de `globalThis` (Node). Mismo patrón que `security.js`.

---

## 4. La capa ZIP

### 4.1 Estructura de un ZIP

Un ZIP tiene tres bloques, en este orden:

```
┌─────────────────────────────┐
│ Local header 1  (30 bytes)  │  firma 0x04034b50, método, CRC, tamaños, nombre
│ nombre del archivo 1        │
│ datos comprimidos 1         │
├─────────────────────────────┤
│ Local header 2 ...          │
│ ...                         │
├─────────────────────────────┤
│ Central directory entry 1   │  firma 0x02014b50: lo mismo + offset al local header
│ Central directory entry 2   │
│ ...                         │
├─────────────────────────────┤
│ End of central directory    │  firma 0x06054b50: cuántas entradas y dónde empieza
│ (EOCD, 22 bytes)            │  el central directory
└─────────────────────────────┘
```

Todos los números van en **little-endian**. Se escriben con `DataView.setUint16/32(..., true)`.

### 4.2 Escribir (`zip`)

Para cada archivo:

1. Pasa el nombre a bytes UTF-8 y pone el **bit 11** de flags (`0x0800`) → cualquier lector sabe que el nombre es UTF-8 (tildes, ñ).
2. Calcula el **CRC-32** del contenido sin comprimir. Tabla de 256 entradas, polinomio `0xEDB88320`, estándar ZIP. La prueba verifica el valor conocido `crc32("123456789") = 0xCBF43926`.
3. Comprime con `CompressionStream('deflate-raw')` (método 8). Si el resultado **no** queda más chico que el original, guarda sin comprimir (método 0). Pasa con archivos diminutos.
4. Escribe local header + nombre + datos, y guarda la entrada del central directory con el **offset** donde empezó ese local header.

Al final concatena los centrales y el EOCD.

La fecha de todos los archivos es fija, `1980-01-01` (`DOS_DATE = 0x21`). Así el mismo contenido da siempre el mismo ZIP, byte a byte. Sirve para las pruebas y para que el paquete de la tienda sea reproducible.

`pipeThrough` es un truco para usar los streams del navegador con un `Uint8Array` de entrada y salida:

```js
new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()
```

### 4.3 Leer (`unzip`)

1. **Busca el EOCD desde el final**. El ZIP puede terminar con un comentario de hasta 65 535 bytes, así que retrocede como máximo `22 + 0xFFFF` bytes buscando la firma `0x06054b50`. Si no la encuentra → `Not a ZIP/XLSX file`.
2. Lee del EOCD cuántas entradas hay y dónde empieza el central directory.
3. Recorre el central directory. Por cada entrada lee método, tamaños, nombre y offset del local header.
4. Salta al local header y **vuelve a leer ahí** la longitud del nombre y del "extra field". Pueden ser distintas de las del central directory, así que no se pueden reutilizar. Con eso ubica dónde empiezan los datos.
5. Método 0 → copia tal cual. Método 8 → `DecompressionStream('deflate-raw')` y comprueba que el tamaño resultante coincida con el declarado. Otro método → error.

Devuelve un `Map<nombre, Uint8Array>`.

Se lee el **central directory** y no los local headers en secuencia porque es la fuente fiable: algunos escritores ponen tamaños en cero en el local header y los escriben después (bit 3, "data descriptor").

---

## 5. Escritura del libro (`buildXlsx`)

### 5.1 Partes que genera

| Parte | Contenido |
|---|---|
| `[Content_Types].xml` | Tipo MIME de workbook, styles y cada hoja (un `<Override>` por hoja) |
| `_rels/.rels` | Relación `officeDocument` → `xl/workbook.xml` |
| `xl/workbook.xml` | `<sheet name="…" sheetId="N" r:id="rIdN"/>` por hoja |
| `xl/_rels/workbook.xml.rels` | `rId1..rIdN` → `worksheets/sheetN.xml`; `rId(N+1)` → `styles.xml` |
| `xl/styles.xml` | Fuentes y formatos de celda (constante `STYLES`) |
| `xl/worksheets/sheetN.xml` | Las celdas |

Es el conjunto **mínimo** que Excel exige para abrir sin el aviso "encontramos un problema con el contenido". No genera `docProps/` (autor, fecha): es opcional.

### 5.2 Estilos

`styles.xml` define tres formatos de celda (`cellXfs`). La celda los referencia con `s="N"`:

| `s` | Uso | Efecto |
|---|---|---|
| `0` | por defecto | Calibri 11 |
| `1` | fila 1 (encabezado) | **negrita** |
| `2` | filas de datos | alineado arriba + **ajustar texto** (se ven los saltos de línea) |

Cada hoja además lleva:

- `<pane ySplit="1" … state="frozen"/>` → la fila de encabezado queda fija al bajar.
- `<cols>` con anchos por columna. DwarfVault usa `[6, 70, 45, 30]` para `#, text, url, favicon` (ver `recordsToSheets` en `importPlanner.js`).
- `<autoFilter ref="A1:D{n}"/>` → flechitas de filtro en el encabezado, solo si hay datos.

Excel calcula solo el alto de las filas con texto ajustado, así que no se escribe alto de fila.

### 5.3 Nombres de hoja (`sheetNames`)

Excel rechaza el archivo si un nombre de hoja rompe sus reglas. El motor lo corrige antes de escribir:

| Regla de Excel | Qué hace el motor | Ejemplo |
|---|---|---|
| Máximo 31 caracteres | Corta | `"xxxxx…(40)"` → 31 caracteres |
| Prohibidos `\ / ? * [ ] :` | Los cambia por espacio | `a/b:c*?[x]` → `a b c x` |
| No puede empezar ni terminar con `'` | Los quita | `'quoted'` → `quoted` |
| No puede estar vacío | Usa `Sheet` | `""` → `Sheet` |
| `History` está reservado | Agrega `_` | `History` → `History_` |
| Únicos, **sin distinguir mayúsculas** | Agrega ` (2)`, ` (3)`… sin pasar de 31 | `Notes`, `NOTES` → `Notes`, `NOTES (2)` |

### 5.4 Cómo se escribe cada celda

```xml
<c r="B2" s="2" t="inlineStr"><is><t xml:space="preserve">texto</t></is></c>
<c r="A2" s="2"><v>1</v></c>
```

- **Texto → `inlineStr`**: el texto va dentro de la celda. Excel prefiere guardarlo en una tabla compartida (`sharedStrings.xml`), pero ambas formas son válidas. Inline es más simple y no crea una parte más.
- **Números → `<v>`**: solo si el valor es `number` finito (la columna `#`).
- **`xml:space="preserve"`**: sin esto, los espacios al principio o al final se pierden.
- **Celdas vacías**: no se escriben. Excel hace lo mismo.

Transformaciones sobre el texto, en este orden:

1. **Límite de 32 767 caracteres** (`MAX_CELL_CHARS`). Es el máximo de Excel por celda; DwarfVault permite textos de hasta 1 MB. Se corta y se cuenta en `truncated`. La vista avisa al usuario ("N cell(s) cut…").
2. **`encodeXstring`**: OOXML usa la secuencia `_xHHHH_` para escapar caracteres.
   - Un `\r` se escribe como `_x000D_`. Si no, el XML lo normaliza y se pierde (ver §6.4).
   - Un texto que ya contiene literalmente `_x0041_` se protege como `_x005F_x0041_`. Si no, Excel lo mostraría como `A`.
3. **`xmlEscape`**: quita los caracteres que XML 1.0 prohíbe (controles `\u0000–\u0008`, `\u000B`, `\u000C`, `\u000E–\u001F`, `￾`, `￿` y surrogates sueltos). Con uno solo de esos, Excel dice que el archivo está dañado. Luego escapa `& < > "`.

### 5.5 Seguridad: nada se vuelve fórmula

Con `inlineStr`, una celda que dice `=HYPERLINK("http://malo")` es **texto**, no fórmula. El motor nunca escribe `<f>`. La prueba unitaria lo comprueba.

Esto importa porque el CSV **sí** tiene ese problema ("CSV injection"): Excel ejecuta como fórmula cualquier celda de CSV que empiece por `=`, `+`, `-` o `@`. Exportar a `.xlsx` es la opción segura.

---

## 6. Lectura del libro (`readXlsx`)

### 6.1 Recorrido

```
unzip(bytes)
  │
  ├─ _rels/.rels ───────────────► relación …/officeDocument → ruta del workbook
  │                                (si falta: xl/workbook.xml)
  ├─ xl/workbook.xml ───────────► <sheet name r:id> en orden
  ├─ xl/_rels/workbook.xml.rels ► rId → ruta de cada hoja; ruta de sharedStrings
  ├─ xl/sharedStrings.xml ──────► tabla de textos compartidos (si existe)
  └─ por cada hoja: parseSheet(xml, shared) → filas
```

`resolvePath` resuelve las rutas de las relaciones:

- Relativas a la carpeta del workbook: `worksheets/sheet1.xml` → `xl/worksheets/sheet1.xml`.
- Con `..`.
- Absolutas: `/xl/sharedStrings.xml` → `xl/sharedStrings.xml`.

Distintos programas usan distintas formas; la prueba "estilo Excel real" usa varias a la vez.

El tipo de relación se reconoce por cómo **termina** (`/officeDocument`, `/sharedStrings`). Así funciona igual con el namespace clásico (`schemas.openxmlformats.org`) que con el de "Strict OOXML" (`purl.oclc.org`).

### 6.2 El XML se lee con expresiones regulares, a propósito

No se usa `DOMParser` por dos razones:

- No existe en Node → sin él, el lector se prueba con `node --test` sin navegador.
- No existe en el service worker de MV3.

Las partes de SpreadsheetML son XML generado por máquina y muy regular, así que alcanza con patrones acotados:

- `attrs()` lee `nombre="valor"` y `nombre='valor'` de una etiqueta.
- Todas las etiquetas aceptan **prefijo de namespace** opcional: `<(?:\w+:)?c\b…>`. Algunos programas escriben `<x:c>` en vez de `<c>`.
- `\b` evita confundir `<c` con `<cols` o `<col`.
- Se aceptan etiquetas que se cierran solas (`<row r="3"/>`, `<c r="C4" s="1"/>`, `<v />`).

### 6.3 Tipos de celda (`parseSheet`)

| Atributo `t` | Significa | Qué devuelve |
|---|---|---|
| `s` | índice en `sharedStrings` | El texto compartido (lo que usa Excel normalmente) |
| `inlineStr` | texto dentro de la celda | Concatenación de sus `<t>` (lo que usa este motor y openpyxl) |
| `str` | resultado de fórmula que es texto | El valor, con `_xHHHH_` decodificado |
| `b` | booleano | `TRUE` / `FALSE` |
| `n` o sin `t` | número | El número como texto (`"1"`) |
| (otros, p. ej. `e` error) | | El valor tal cual |

Detalles:

- **Rich text**: en `sharedStrings`, un texto con partes en negrita viene partido en varios `<r><t>…</t></r>`. `textRuns` los junta en uno.
- **Fonética** (`<rPh>`, lectura japonesa): se descarta, no es parte del texto.
- **Fórmulas**: se toma el **resultado guardado** (`<v>`), no la fórmula. Si el archivo no trae resultado guardado (algunos generadores no lo escriben), se devuelve el texto de la fórmula con `=` delante (`=SUM(1,2)`), para no perder el dato.
- **Celdas dispersas**: Excel no escribe celdas vacías. Con `r="C1"` se sabe que la celda va en la columna 3, y los huecos se rellenan con `''`. Si una celda no trae `r`, va a continuación de la anterior.
- **Filas vacías**: una fila sin celdas sale como `[]`. Las filas que el XML no nombra no aparecen: los huecos entre filas se cierran.

### 6.4 Saltos de línea

La especificación XML (§2.11) dice que el lector debe convertir `\r\n` y `\r` en `\n` antes de interpretar. `readXlsx` lo hace al decodificar cada parte. Un retorno de carro que deba conservarse viene escapado (`_x000D_` o `&#13;`) y se recupera después. Así un texto con `\r\n` hace ida y vuelta exacta. La prueba lo cubre.

---

## 7. Límites de seguridad al leer

El archivo lo elige el propio usuario. Aun así el lector se protege de archivos rotos o armados a propósito:

| Protección | Valor | Dónde |
|---|---|---|
| Máximo de archivos dentro del ZIP | 2 000 | `MAX_ZIP_ENTRIES` |
| Máximo de bytes descomprimidos **declarados** (suma) | 200 MB | `MAX_UNZIPPED` |
| Tamaño real tras descomprimir = tamaño declarado | Si no coincide → error | `unzip` |
| Método de compresión desconocido | Error | `unzip` |
| Firmas ZIP inválidas | Error | `unzip` |
| No hay workbook o no hay hojas | Error | `readXlsx` |

Cualquier error llega a la vista, que muestra "unreadable file" / "Could not read the file" y **no escribe nada**. Hay una prueba punta a punta con un `.xlsx` corrupto.

Las URLs y favicons importados pasan por `DwarfSecurity` igual que en CSV. `javascript:`, `data:text/html` y similares quedan en blanco.

---

## 8. Cómo se conecta con la app

El motor no conoce "vaults" ni "entries": solo hojas y filas. La traducción está en [`src/scripts/importPlanner.js`](../src/scripts/importPlanner.js):

| Función | Dirección | Qué hace |
|---|---|---|
| `entriesToRows(entries)` | app → filas | `[['#','text','url','favicon'], [1, …], …]`. La comparten CSV y Excel |
| `recordsToSheets(records)` | app → hojas | Una hoja por tabla, con anchos de columna |
| `rowsToEntries(rows)` | filas → app | Detecta encabezado y mapea columnas (ver abajo) |
| `readImportFile(file)` | archivo → tablas | `.xlsx` → una tabla por hoja con datos; `.csv` → una tabla |

**Mapeo de columnas** en `rowsToEntries`:

- **Con encabezado** (la primera fila tiene `text` o `url`): cada columna se ubica **por su nombre**, en cualquier orden.
- **Sin encabezado**: se decide por el **ancho máximo del archivo**, no por el de cada fila, porque Excel omite las celdas vacías del final.

Ejemplo del problema que evita: la fila `1 | hola | https://a.com | (vacío)` llega del Excel con 3 celdas. Mirando solo esa fila, parecería el formato `text, url, favicon`, y `"1"` quedaría como texto.

Flujo completo:

```
EXPORT                                        IMPORT
IndexedDB records                             <input type=file> (.csv / .xlsx)
   │ recordsToSheets                             │ readImportFile
   ▼                                             ▼
[{name, rows, widths}]                        [{name, entries}] (una por hoja)
   │ DwarfXlsx.buildXlsx                         │ DwarfImportDialog.open
   ▼                                             │   · elegir hoja (si hay varias)
Blob → descarga Notes.xlsx                       │   · destino: tabla sola / hija /
                                                 │     añadir / reemplazar
                                                 ▼
                                              planCsvImport → IndexedDB
```

Dónde está cada botón:

| Vista | Export hoja | Export vault | Import |
|---|---|---|---|
| Corporate (`corporate.js`) | Data → 📊 Export Excel (`onExportXlsx`) | Data → 📊 Export Full Vault to Excel (`onExportVaultXlsx`) | Data → ⇩ Import CSV / Excel (`onImport`) |
| Dwarven (`popup.js`) | TRADE → 📊 EXPORT Excel (`exportDataAsXlsx`) | TRADE → 📊 EXPORT Vault Excel (`exportVaultAsXlsx`) | TRADE → 📥 IMPORT CSV / Excel (`processImportFile`) |

Orden de carga en `index.html` y `corporate.html`: `security.js` → `xlsx.js` → `importPlanner.js` → `importDialog.js` → vista. El planner usa `DwarfXlsx` y `DwarfSecurity` si están cargados.

El Vault en Excel es para ver y editar en una hoja de cálculo. **No es un backup del Vault**: el `.xlsx` no guarda qué hoja es padre y cuál es hija. Para respaldar el Vault con su estructura sigue estando el JSON (📦 Export Full Vault).

---

## 9. Pruebas

| Archivo | Tipo | Qué cubre |
|---|---|---|
| [`tests/unit/xlsx.test.js`](../tests/unit/xlsx.test.js) | Unitarias (Node) | CRC-32 conocido; ZIP ida y vuelta comprimido y sin comprimir con nombres UTF-8; rechazo de no-ZIP; reglas de nombre de hoja; partes OOXML obligatorias; texto con `=` nunca es fórmula; ida y vuelta exacta con ñ, emoji, `& < >`, `\r\n`, `_x0041_` literal y caracteres de control; corte a 32 767; XML "estilo Excel real" (sharedStrings, rich text, fonética, prefijos `x:`, celdas dispersas, `t="b"`, `t="str"`, rutas absolutas); archivo hecho por openpyxl; vault completo ida y vuelta; URLs peligrosas |
| [`tests/e2e/xlsx.spec.js`](../tests/e2e/xlsx.spec.js) | Punta a punta (Chromium + extensión real), ambas vistas | Export de hoja y de vault; reimportar el export sin pérdidas; importar Excel ajeno de varias hojas eligiendo hoja; el nombre editado a mano no se pisa; `.xlsx` corrupto |
| [`tests/e2e/package.spec.js`](../tests/e2e/package.spec.js) | Punta a punta sobre el ZIP de la tienda | Export Excel funciona desde el paquete |
| [`tests/fixtures/excel-made.xlsx`](../tests/fixtures/excel-made.xlsx) | Archivo de prueba | Generado con **openpyxl** (Python), un escritor independiente: hojas `Clientes`, `Proveedores`, `Vacía` |

Correr: `npm run test:unit` (segundos) o `npm test` (todo, ~2 min).

Validación extra hecha a mano durante el desarrollo: **openpyxl abre los archivos que genera el motor**, tanto desde Node como el descargado desde la extensión en el navegador. Lee los mismos valores, el panel congelado, el filtro, los anchos, el ajuste de texto y la negrita.

---

## 10. Limitaciones conocidas

- **No se probó abriendo en Microsoft Excel**: no estaba instalado en la máquina de desarrollo. La compatibilidad se validó con openpyxl y siguiendo la especificación. **Antes de publicar, abrir un export en Excel de escritorio y en Excel web.**
- **Zip bomb**: `MAX_UNZIPPED` suma los tamaños **declarados**, y el tamaño real se compara **después** de descomprimir cada archivo. Un archivo que mienta sobre su tamaño se detecta, pero recién después de descomprimirlo entero en memoria. Como el archivo lo elige el usuario, el peor caso es que su pestaña se quede sin memoria. Mejora pendiente: contar bytes mientras se descomprime y cortar el stream al pasar el tope.
- **Sin ZIP64**: no soporta archivos de más de 4 GB ni más de 65 535 partes. Irrelevante para DwarfVault.
- **Solo `.xlsx`**: no lee `.xls` (formato binario viejo), `.xlsm`, `.ods` ni `.numbers`. `readImportFile` decide por la extensión del nombre.
- **Lectura solo de valores**: no lee formatos de número. Una fecha llega como su número de serie de Excel (`45292`). Tampoco lee celdas combinadas, comentarios ni hipervínculos. Lee todas las hojas, incluidas las ocultas.
- **Escritura solo de texto y números**: las URLs se exportan como texto, no como enlaces clicables. No hay colores, bordes ni fórmulas (a propósito).
- **Parser por patrones**: asume XML de SpreadsheetML bien formado. No maneja `<![CDATA[…]]>` ni comentarios XML dentro de `sheetData`. Excel y los generadores comunes no los usan ahí.

---

## 11. Si hay que cambiar algo

| Quiero… | Tocar |
|---|---|
| Cambiar anchos o columnas exportadas | `entriesToRows` / `recordsToSheets` en `importPlanner.js` |
| Un estilo nuevo (color, borde) | Agregar un `<xf>` en `STYLES` (y subir `count`), usar su índice como `s` en `sheetXml` |
| URLs como enlaces clicables | En `sheetXml` agregar `<hyperlinks>` y un `xl/worksheets/_rels/sheetN.xml.rels` con relaciones `hyperlink` `TargetMode="External"`; declarar nada extra en Content_Types (los `.rels` ya están cubiertos) |
| Leer fechas como fecha | Leer `numFmtId` de `styles.xml`, mapear `s` → formato, y convertir el serial: `new Date(Date.UTC(1899, 11, 30) + serial * 86400000)` |
| Cortar la descompresión al pasar el tope | En `unzip`, leer el stream de `DecompressionStream` por partes, sumar bytes y cancelar al pasar `MAX_UNZIPPED` |

Después de cualquier cambio: `npm test`, y abrir un export en Excel de verdad.
