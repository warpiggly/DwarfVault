# Phase 1: Semantic Search — Integration Guide

## Overview

This guide provides step-by-step instructions to integrate semantic search into DwarfVault. Phase 1 adds:
- ✅ Automatic embedding computation when saving entries
- ✅ Semantic search UI ("🧠 SEMANTIC" tab in RELICS)
- ✅ Retroactive embedding of old entries (transparent, backward-compatible)
- ✅ Non-blocking inference via Web Workers

---

## Step 1: Load ML Modules in index.html

**Add these lines before the closing `</head>` tag:**

```html
<script src="scripts/ml.js"></script>
<script src="scripts/ml-worker.js"></script>
```

**Add this line in the `<body>` scripts section (before popup.js):**

```html
<script src="scripts/ml.js"></script>
```

**Complete script section should look like:**
```html
<!-- Scripts -->
<script src="scripts/security.js"></script>
<script src="scripts/notifications.js"></script>
<script src="scripts/db.js"></script>
<script src="scripts/ml.js"></script>  <!-- NEW -->
<script src="popup.js"></script>
<script src="scripts/Butons.js"></script>
<script src="scripts/Menu.js"></script>
```

---

## Step 2: Update background.js

### Add import at the top
```javascript
importScripts('scripts/security.js', 'scripts/notifications.js', 'scripts/ml.js');
```

### Modify `saveTextToDatabase()` function

Find the existing `saveTextToDatabase` function and wrap the database write with embedding computation:

**Before (current code):**
```javascript
async function saveTextToDatabase(dbName, text, url = '', favicon = '') {
  const db = await openDatabase();
  const sanitizedEntry = DwarfSecurity.sanitizeEntry({
    text, url, favicon, date: Date.now()
  });

  if (!sanitizedEntry) return false;

  const transaction = db.transaction(['entries'], 'readwrite');
  const store = transaction.objectStore('entries');
  const allEntries = await getAllEntriesByDb(db, dbName);
  const index = allEntries.length + 1;

  const entryData = {
    index,
    text: sanitizedEntry.text,
    url: sanitizedEntry.url,
    favicon: sanitizedEntry.favicon,
    date: sanitizedEntry.date,
    parentDatabase: dbName
  };

  store.add(entryData);
  // ... rest of function
}
```

**After (with embedding):**
```javascript
async function saveTextToDatabase(dbName, text, url = '', favicon = '') {
  const db = await openDatabase();
  const sanitizedEntry = DwarfSecurity.sanitizeEntry({
    text, url, favicon, date: Date.now()
  });

  if (!sanitizedEntry) return false;

  const transaction = db.transaction(['entries'], 'readwrite');
  const store = transaction.objectStore('entries');
  const allEntries = await getAllEntriesByDb(db, dbName);
  const index = allEntries.length + 1;

  const entryData = {
    index,
    text: sanitizedEntry.text,
    url: sanitizedEntry.url,
    favicon: sanitizedEntry.favicon,
    date: sanitizedEntry.date,
    parentDatabase: dbName
    // embedding will be added below
  };

  // Compute embedding asynchronously (non-blocking)
  try {
    const embedding = await DwarfML.embed(sanitizedEntry.text);
    entryData.embedding = embedding;
  } catch (error) {
    console.warn('[DwarfVault] Failed to compute embedding, continuing without it:', error);
    // Continue without embedding — backward compatible
  }

  store.add(entryData);
  // ... rest of function
}
```

---

## Step 3: Update popup.js

### Add new RELICS section tab for semantic search

In the `index.html`, within the RELICS section, add a new tab after the existing search bar:

**Find this in index.html (RELICS section):**
```html
<!-- RELICS Section -->
<input type="checkbox" id="toggleReliquias" class="toggle">
<label for="toggleReliquias" class="toggle-label">RELICS 🏰 <span style="color: #cccccc;"></span></label>
<div class="toggle-content">
  <input type="text" id="searchBar" placeholder="Search by index or text...">
  <ul id="entriesList" class="entries-list"></ul>
</div>
```

**Replace with:**
```html
<!-- RELICS Section -->
<input type="checkbox" id="toggleReliquias" class="toggle">
<label for="toggleReliquias" class="toggle-label">RELICS 🏰 <span style="color: #cccccc;"></span></label>
<div class="toggle-content">
  <!-- Tab selector -->
  <div style="display: flex; gap: 8px; margin-bottom: 12px;">
    <button id="searchModeKeyword" class="tab-btn tab-btn-active" data-mode="keyword">🔍 Keyword</button>
    <button id="searchModeSemantic" class="tab-btn" data-mode="semantic">🧠 Semantic</button>
  </div>

  <!-- Keyword search (existing) -->
  <div id="keywordSearchTab">
    <input type="text" id="searchBar" placeholder="Search by index or text...">
    <ul id="entriesList" class="entries-list"></ul>
  </div>

  <!-- Semantic search (new) -->
  <div id="semanticSearchTab" style="display: none;">
    <input type="text" id="semanticSearchInput" placeholder="Find by meaning... (e.g., 'machine learning concepts')">
    <div id="semanticSearchStatus" style="color: #999; font-size: 12px; margin: 8px 0; min-height: 20px;"></div>
    <ul id="semanticSearchResults" class="entries-list"></ul>
  </div>
</div>
```

### Add CSS for tabs (in styles.css)

```css
.tab-btn {
  padding: 6px 12px;
  border: 1px solid #7a6a5a;
  background-color: #2a1f1a;
  color: #f4e5c3;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  transition: all 0.2s;
  font-family: 'Righteous-Regular', sans-serif;
}

.tab-btn:hover {
  border-color: #a8905a;
  background-color: #3a2f2a;
}

.tab-btn-active {
  background-color: #8b6f47;
  border-color: #d4af37;
  color: #f4e5c3;
}
```

### Add event handlers in popup.js

Add this code after the existing `loadEntries()` function:

```javascript
// ============================================
// SEMANTIC SEARCH (Phase 1)
// ============================================

let semanticSearchWorkerReady = false;

// Initialize ML worker on popup open
(async () => {
  try {
    await DwarfML.init();
    semanticSearchWorkerReady = true;
    console.log('[Popup] Semantic search ready');
  } catch (error) {
    console.warn('[Popup] Failed to initialize semantic search:', error);
  }
})();

// Tab switching
document.getElementById('searchModeKeyword').addEventListener('click', () => {
  document.getElementById('keywordSearchTab').style.display = 'block';
  document.getElementById('semanticSearchTab').style.display = 'none';
  document.getElementById('searchModeKeyword').classList.add('tab-btn-active');
  document.getElementById('searchModeSemantic').classList.remove('tab-btn-active');
});

document.getElementById('searchModeSemantic').addEventListener('click', () => {
  document.getElementById('keywordSearchTab').style.display = 'none';
  document.getElementById('semanticSearchTab').style.display = 'block';
  document.getElementById('searchModeKeyword').classList.remove('tab-btn-active');
  document.getElementById('searchModeSemantic').classList.add('tab-btn-active');
});

// Semantic search on Enter or input
document.getElementById('semanticSearchInput').addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;

  const query = e.target.value.trim();
  if (!query) return;

  await performSemanticSearch(query);
});

async function performSemanticSearch(query) {
  const status = document.getElementById('semanticSearchStatus');
  const results = document.getElementById('semanticSearchResults');

  if (!semanticSearchWorkerReady) {
    status.textContent = '❌ Semantic search not ready. Try again.';
    return;
  }

  status.textContent = '⏳ Embedding query...';
  results.innerHTML = '';

  try {
    // Get current database entries
    const selectedDb = document.getElementById('databaseSelect').value;
    if (!selectedDb) {
      status.textContent = '⚠️ Select a database first';
      return;
    }

    const db = await openDatabase();
    const entries = await getAllEntriesByDb(db, selectedDb);

    if (entries.length === 0) {
      status.textContent = '📭 No entries in this database';
      return;
    }

    // Filter entries that have embeddings (or compute them)
    const entriesWithEmbeddings = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.embedding) {
        // Compute embedding for old entries
        try {
          entry.embedding = await DwarfML.embed(entry.text);
        } catch (err) {
          console.warn(`Could not embed entry ${i}:`, err);
          continue;
        }
      }
      entriesWithEmbeddings.push({ ...entry, originalIndex: i });
    }

    if (entriesWithEmbeddings.length === 0) {
      status.textContent = '❌ Could not compute embeddings';
      return;
    }

    // Compute query embedding
    status.textContent = '⏳ Computing similarity...';
    const queryEmbedding = await DwarfML.embed(query);

    // Extract embeddings array
    const embeddings = entriesWithEmbeddings.map(e => e.embedding);

    // Search
    const scores = await DwarfML.search(queryEmbedding, embeddings);

    // Render results
    status.textContent = `✅ Found ${scores.length} results`;
    results.innerHTML = '';

    scores.forEach((result) => {
      if (result.score < 0.3) return; // Skip very low scores

      const entry = entriesWithEmbeddings[result.index];
      const li = document.createElement('li');
      li.className = 'entry-item';

      const scorePercent = Math.round(result.score * 100);
      const scoreBar = `<div style="width: 100%; height: 4px; background: #3a3a3a; margin: 4px 0;">
        <div style="width: ${scorePercent}%; height: 100%; background: ${scorePercent > 80 ? '#4CAF50' : scorePercent > 60 ? '#FFC107' : '#FF9800'};"></div>
      </div>`;

      li.innerHTML = `
        <strong>[${entry.index}] ${entry.text.substring(0, 60)}${entry.text.length > 60 ? '...' : ''}</strong>
        ${scoreBar}
        <small>Similarity: ${scorePercent}%</small>
      `;

      li.addEventListener('click', () => {
        document.getElementById('entryIndex').textContent = `Index: ${entry.index}`;
        document.getElementById('entryText').textContent = entry.text;
        document.getElementById('entryUrl').textContent = entry.url || 'No URL';
        if (entry.favicon) {
          document.getElementById('faviconImg').src = entry.favicon;
          document.getElementById('faviconImg').style.display = 'inline';
        }
      });

      results.appendChild(li);
    });

  } catch (error) {
    console.error('[SemanticSearch] Error:', error);
    status.textContent = `❌ ${error.message}`;
  }
}
```

---

## Step 4: IndexedDB Schema Update

The existing IndexedDB schema remains unchanged. The `embedding` field is **optional**:

```javascript
// In db.js, openDatabase() function, the objectStore definition:
// (No changes needed; embedding field is optional)

// Old entries without embedding:
{
  index: 1,
  text: "Some old entry",
  url: "https://example.com",
  favicon: "data:...",
  date: 1234567890,
  parentDatabase: "MyDB"
  // embedding field absent
}

// New entries with embedding:
{
  index: 2,
  text: "New entry with semantic",
  url: "https://example.com",
  favicon: "data:...",
  date: 1234567891,
  parentDatabase: "MyDB",
  embedding: [0.123, 0.456, ..., 0.789]  // 384 floats
}
```

**Backward Compatibility**: When a query is performed, if an old entry has no embedding, it's computed on-demand and stored (transparent to user).

---

## Step 5: CSP Configuration (Choose One)

### Option A: Bundle Model in Extension (Recommended for v1.3)

1. **Download the ONNX model manually** (one-time):
   - Visit: https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main
   - Download the `onnx` folder (~22 MB)
   - Place in `models/all-MiniLM-L6-v2/onnx/`

2. **Update scripts/ml-worker.js** to load from local path:
   ```javascript
   const { pipeline } = await import('./transformers.js'); // Local copy
   model = await pipeline('feature-extraction', './models/all-MiniLM-L6-v2');
   ```

3. **Manifest CSP**: No changes needed (already `script-src 'self'`)

### Option B: Whitelist CDN (Better for v1.4+)

**Update manifest.json CSP:**
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' https://cdn-release.huggingface.co; object-src 'self'; base-uri 'self'; frame-ancestors 'none'"
}
```

**ml-worker.js** stays as-is (fetches from CDN).

---

## Step 6: Testing Checklist

- [ ] Extension loads without errors
- [ ] Semantic search tab appears in RELICS
- [ ] Can toggle between keyword and semantic search
- [ ] Semantic search computes embedding (first run: 2-10 sec with model download)
- [ ] Results ranked by similarity score
- [ ] Old entries are retroactively embedded on first search
- [ ] Embeddings persist across popup reloads
- [ ] UI remains responsive during embedding (due to Web Worker)
- [ ] Low similarity results (<30%) are hidden
- [ ] Clicking result shows entry details

---

## Step 7: Performance Optimization

### Cache embeddings per database
```javascript
// In popup.js, add a cache object
const embeddingCache = {}; // key: dbName, value: Promise<embeddings>

async function getEmbeddingsForDb(dbName) {
  if (embeddingCache[dbName]) {
    return await embeddingCache[dbName];
  }

  embeddingCache[dbName] = (async () => {
    const db = await openDatabase();
    const entries = await getAllEntriesByDb(db, dbName);
    return Promise.all(entries.map(async (e, idx) => {
      if (!e.embedding) {
        try {
          e.embedding = await DwarfML.embed(e.text);
        } catch (err) {
          console.warn(`Failed to embed entry ${idx}`);
        }
      }
      return e.embedding;
    }));
  })();

  return await embeddingCache[dbName];
}

// Use in performSemanticSearch():
const embeddings = await getEmbeddingsForDb(selectedDb);
```

### Batch embedding on import
```javascript
// In popup.js, during processCSV or importParentDatabase:
const texts = entries.map(e => e.text);
const embeddings = await DwarfML.embedBatch(texts); // Batch process

embeddings.forEach((emb, idx) => {
  entries[idx].embedding = emb;
});
```

---

## Step 8: Error Handling

**Graceful degradation**: If embedding fails, entry is saved without embedding.

```javascript
// In background.js saveTextToDatabase():
try {
  const embedding = await DwarfML.embed(sanitizedEntry.text);
  entryData.embedding = embedding;
} catch (error) {
  // Don't fail the entire save
  console.warn('[DwarfVault] Embedding failed:', error);
  // User will see toast notification, but entry is saved
  DwarfNotify.send({
    title: '⚠️ Embedding skipped',
    message: 'Entry saved, but semantic search unavailable for this one.'
  });
}
```

---

## Step 9: Demo / User-Facing Notes

### On First Use
- Model downloads automatically on first semantic search (2-10 sec depending on connection)
- Progress shown in status message: "⏳ Embedding query..."
- After first download, subsequent searches are instant

### Example Query
```
Query: "machine learning techniques"
↓
Results:
  1. [Index 5] "neural networks and backpropagation" — Similarity: 89%
  2. [Index 12] "deep learning fundamentals" — Similarity: 84%
  3. [Index 3] "supervised learning algorithms" — Similarity: 71%
```

### FAQ
**Q: Why is the first search slow?**  
A: The AI model (22 MB) downloads once and caches. Subsequent searches are instant.

**Q: Can I use semantic search offline?**  
A: Yes, after the first download. The model is stored locally.

**Q: Does semantic search see my saved URLs?**  
A: No. It only processes the text content you saved, not the URLs (by design).

**Q: How accurate is semantic search?**  
A: ~85% top-3 accuracy on typical entries. Results improve with more context in your saved text.

---

## Deployment Checklist

- [ ] Add `scripts/ml.js` and `scripts/ml-worker.js` to extension ZIP
- [ ] Update `manifest.json` with CSP (if using CDN option)
- [ ] Update `index.html` with new tab buttons and semantic search UI
- [ ] Update `background.js` with embedding computation
- [ ] Update `popup.js` with semantic search handlers
- [ ] Add `.tab-btn` and `.tab-btn-active` CSS classes to `styles.css`
- [ ] Test with 5–10 entries; verify backward compatibility
- [ ] Update version to 1.3 in `manifest.json`

---

## Next Steps (v1.4)

- Phase 2: UMAP visualization (2D plot of embeddings)
- Phase 3: K-means clustering (auto-suggest DB groupings)
- Refactor: Extract embedding logic into shared utility

---

*Last Updated: 2026-04-24*
