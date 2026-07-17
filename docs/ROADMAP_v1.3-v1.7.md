# DwarfVault AI Roadmap (v1.3–v1.7)

## Executive Summary

This roadmap outlines a **7-phase local-only AI enhancement** for DwarfVault, providing semantic search, visualization, clustering, classification, deduplication, analytics, and summarization—all running 100% in the browser with **zero external dependencies** or server calls.

**Philosophy**: Leverage browser APIs (IndexedDB, Web Workers, Canvas) + open-source transformer models (Transformers.js) to build a **data scientist's playground** that operates entirely client-side.

---

## Architecture Overview

### Stack
- **NLP Engine**: Transformers.js (runs ONNX models in browser, downloads once)
- **Embeddings**: Xenova/all-MiniLM-L6-v2 (384-dim vectors, 22 MB)
- **Dimensionality Reduction**: UMAP-js (384D → 2D visualization)
- **Clustering**: ml-kmeans (K-means++), HDBSCAN.js (density-based)
- **Classification**: k-NN (k-nearest neighbors, supervised)
- **Similarity**: Cosine distance, Euclidean distance
- **Deduplication**: MinHash + Locality Sensitive Hashing (LSH)
- **Analytics**: TF-IDF, word frequency, TextRank
- **Summarization**: Transformers.js (T5-small or DistilBART)
- **Threading**: Web Workers (background computation, non-blocking UI)

### Data Storage
- **Schema**: Extend IndexedDB `entries` table with optional `embedding: number[]` field
- **Backward Compatibility**: Old entries silently computed on first access
- **Index Strategy**: Build in-memory indices on first load per database

### UI Integration
- **New Tabs in RELICS Section**:
  - 🧠 SEMANTIC (search by meaning, not keyword)
  - 📊 ANALYTICS (word clouds, distributions, TF-IDF)
  - 🗺️ MAP (UMAP scatter plot, interactive canvas)
  - 🏷️ AUTO-TAG (k-NN classification suggestions)
  - 🔍 DUPLICATES (MinHash duplicate detection)

---

## Phase 1: Semantic Search ⭐ (v1.3 — PRIORITY 1)

### Objective
Enable users to search for entries by **meaning**, not just keyword. E.g., search for "quick learning" and find "fast training," "rapid skill development," etc.

### Components

#### 1. **Web Worker for Embeddings** (`scripts/ml-worker.js`)
```
Purpose: Non-blocking embedding computation in background thread
- Lazy-load Transformers.js on first call
- Cache model in IndexedDB (one-time download)
- Accept batch requests
- Return embeddings via postMessage
```

#### 2. **Background Integration** (`background.js` modifications)
```
When saveTextToDatabase() called:
  1. Sanitize entry (existing security.js flow)
  2. Send text + metadata to ml-worker
  3. Await embedding response
  4. Store entry with embedding: number[]
  5. Notify user (toast)

Performance: ~500ms per entry (first request slower due to model download)
```

#### 3. **Popup UI** (`popup.js` new "🧠 SEMANTIC" tab)
```
UI:
  - Search input: "Find entries by meaning..."
  - Results list: ranked by cosine similarity (0.0 → 1.0)
  - Each result shows original entry + similarity score + color-coded badge

Logic:
  1. User enters search query (lazy: only compute embedding on Enter)
  2. Compute query embedding via worker
  3. Load all embeddings from current DB
  4. Calculate cosine distance to each entry
  5. Sort descending by similarity
  6. Display top 20 with score badge
```

#### 4. **IndexedDB Schema** (backward compatible)
```
entries table (existing + new):
  {
    index: number,
    text: string,
    url: string,
    favicon: string,
    date: number,
    parentDatabase: string,
    embedding?: number[]  // NEW: optional, computed on-demand
  }

Notes:
- Embeddings are ~3.2 KB per entry (384 floats × 4 bytes / 100 compression factor)
- 1,000 entries = ~3.2 MB storage (acceptable)
- No separate table needed; store inline
```

### Learning Outcomes (Data Science + AI)
✅ Vector embeddings fundamentals  
✅ Cosine similarity metric  
✅ Batch processing for inference  
✅ Browser-based transformer models  
✅ Web Worker threading for CPU-bound tasks  

### Technical Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Model download (22 MB) on first run | Cache in IndexedDB, show progress bar |
| CSP restrictions (script-src 'self') | Bundle model in extension ZIP or whitelist huggingface.co |
| UI blocking during embedding | Use Web Worker; return results progressively |
| Compute cost for large DBs (1000+ entries) | Lazy-load embeddings on first semantic tab open; cache in-memory |
| Old entries without embedding | Compute on first database open; store transparently |

### Acceptance Criteria
- [ ] User can search by semantic meaning
- [ ] Results ranked by relevance (cosine score)
- [ ] Old entries retroactively embedded
- [ ] UI remains responsive during computation
- [ ] Embeddings persist across sessions
- [ ] <2 sec search latency for 500-entry DB

---

## Phase 2: UMAP Visualization (v1.3 — PRIORITY 2)

### Objective
Visualize entry embeddings in 2D space, revealing natural clusters and patterns.

### Components

#### 1. **Dimensionality Reduction** (`scripts/umap-worker.js`)
```
- Reduce 384-dim embeddings → 2D coordinates (x, y)
- Use UMAP-js or t-SNE (UMAP faster, more intuitive)
- Compute on worker thread (takes ~2–5 sec for 500 entries)
- Cache result in IndexedDB (labeled as "umap_cache" alongside embeddings)
```

#### 2. **Interactive Canvas** (`popup.js` new "🗺️ MAP" tab)
```
UI:
  - Canvas element 800×600 px (responsive)
  - Each entry = colored dot
  - Hover: show entry preview + similarity to query
  - Click: open entry details in sidebar
  - Color coding by cluster OR by date OR by URL domain
  - Zoom/pan controls

Logic:
  1. Load embeddings from current DB
  2. Check if UMAP cache exists; if not, compute
  3. Normalize coordinates to canvas bounds
  4. Render dots with hover/click handlers
  5. Optional: overlay convex hulls for clusters
```

#### 3. **Interaction**
```
- Search query + UMAP: highlight entries near query point
- Clustering overlay: show DBSCAN/k-means regions
- Export: save map as PNG or JSON (for reports)
```

### Learning Outcomes
✅ Dimensionality reduction techniques (UMAP, t-SNE)  
✅ 2D visualization of high-dimensional data  
✅ Interactive canvas rendering  
✅ Color mapping and categorical encoding  

### Acceptance Criteria
- [ ] UMAP reduces 384D → 2D correctly
- [ ] Canvas renders 500+ points smoothly
- [ ] Hover previews entries
- [ ] Click opens entry modal
- [ ] Cache avoids re-computation

---

## Phase 3: Smart Clustering (v1.4)

### Objective
Auto-discover clusters in entry embeddings; suggest new database groupings.

### Components
- **K-means++**: Fixed number of clusters (user selects K via slider)
- **HDBSCAN**: Density-based; auto-detects cluster count
- **UI**: New "🏷️ AUTO-TAG" tab with suggestions like "Create new DB: 'Machine Learning (3 entries)'"

### Learning Outcomes
✅ Unsupervised clustering algorithms  
✅ Elbow method for K selection  
✅ Density-based vs. partition-based clustering  
✅ Silhouette score for cluster quality  

---

## Phase 4: Supervised Classification (v1.4)

### Objective
Auto-tag new entries based on similarity to labeled examples in existing databases.

### Components
- **k-NN Algorithm**: k=5, find nearest neighbors in embedding space
- **Label Propagation**: Assign database tag based on majority vote
- **UI**: Suggest DB placement when saving new entries
- **Training**: Use all entries in each DB as labeled examples

### Learning Outcomes
✅ k-NN classifier  
✅ Distance metrics for classification  
✅ Label propagation and voting  

---

## Phase 5: Duplicate Detection (v1.5)

### Objective
Identify near-duplicate entries using probabilistic methods (faster than embedding-based, no AI required).

### Components
- **MinHash**: Generate signatures from text shingles (k=3)
- **LSH (Locality Sensitive Hashing)**: Bucket signatures for fast collision detection
- **UI**: Show duplicate scores (0.0–1.0) and merge suggestions
- **No Embedding Required**: Works independently of Phase 1

### Learning Outcomes
✅ Probabilistic hashing  
✅ Jaccard similarity  
✅ LSH for fast similarity search  
✅ Deduplication strategies  

---

## Phase 6: NLP Analytics Dashboard (v1.3 — PRIORITY 3)

### Objective
Provide statistical insights into entry content: word clouds, term frequency, language patterns.

### Components

#### 1. **TF-IDF Computation**
```
- Calculate term frequency-inverse document frequency for all entries
- Identify top 20 distinctive terms per database
- Filter stopwords (the, a, is, etc.)
```

#### 2. **Word Frequency & Cloud**
```
- Canvas rendering of word cloud (size ∝ frequency)
- Interactive: hover shows count + TF-IDF score
```

#### 3. **Text Statistics**
```
- Average entry length (chars, words)
- Date distribution (histogram)
- Domain distribution (pie chart)
- Reading time estimates
```

#### 4. **UI** (`popup.js` new "📊 ANALYTICS" tab)
```
- Tabs for Word Cloud | Statistics | TF-IDF
- Export data as CSV for external analysis
```

### Learning Outcomes
✅ TF-IDF weighting scheme  
✅ Stopword removal and tokenization  
✅ Statistical distributions  
✅ Information visualization  

### Acceptance Criteria
- [ ] TF-IDF computed correctly
- [ ] Word cloud renders 50+ words smoothly
- [ ] Statistics auto-update when entries change

---

## Phase 7: On-Device Summarization (v1.5)

### Objective
Generate summaries of entry content using transformers (T5-small or DistilBART).

### Components
- **Model**: `Xenova/distilbart-cnn-6-6` or `Xenova/t5-small` (180 MB, runs in worker)
- **UI**: "Summarize" button on each entry; shows 1–3 sentence summary
- **Batch Processing**: Summarize all entries in DB with progress bar
- **Configuration**: Min/max summary length via slider

### Learning Outcomes
✅ Seq2seq transformer models  
✅ Abstractive summarization  
✅ Inference with large models  

---

## Implementation Roadmap

### v1.3 (Priority Release)
- **Phase 1**: Semantic search ✅
- **Phase 2**: UMAP visualization ✅
- **Phase 6**: NLP analytics ✅
- **Est. Time**: 4–6 weeks
- **Learning**: Embeddings, clustering fundamentals, interactive visualization

### v1.4
- **Phase 3**: Smart clustering (K-means, HDBSCAN)
- **Phase 4**: Supervised classification (k-NN)
- **Est. Time**: 2–3 weeks

### v1.5
- **Phase 5**: Duplicate detection (MinHash + LSH)
- **Phase 7**: Summarization (T5/DistilBART)
- **Est. Time**: 3–4 weeks

### v1.6–v1.7 (Future)
- Advanced: LLM fine-tuning, semantic similarity re-ranking, cross-database search
- Integration: Export to external ML platforms, webhook triggers

---

## Tech Stack Details

### Transformers.js
- **What**: Hugging Face's JS library for running transformers in browser
- **Models**: Pre-trained ONNX models (quantized for speed)
- **Download**: First use downloads ~25–180 MB per model (cached)
- **License**: MIT
- **Usage**: `const { pipeline } = await import("@xenova/transformers")`

### UMAP-js
- **What**: Fast dimensionality reduction (alternative: t-SNE slower but better separation)
- **Size**: ~200 KB
- **License**: MIT
- **Usage**: `const umap = new UMAP(); umap.fit(embeddings)`

### ML Libraries
- **ml-kmeans**: K-means clustering, MIT license, ~20 KB
- **HDBSCAN.js**: Density-based clustering, MIT license, ~50 KB
- **TF-IDF**: Custom implementation or js-ml (lightweight)

### Web Worker Threading
- **Pattern**: Spawn `scripts/ml-worker.js` in background
- **Communication**: `postMessage()` for requests, `onmessage` for responses
- **Benefit**: UI never blocks, user can search while embedding computes

---

## Data Science Learning Path (for Developer)

### Concepts Covered in v1.3
1. **Vector Representations**: Text → 384-dim embeddings
2. **Distance Metrics**: Cosine similarity, Euclidean distance
3. **Dimensionality Reduction**: PCA intuition, UMAP algorithm
4. **Visualization**: Plotting high-dimensional data in 2D
5. **Batch Processing**: Efficient inference on many samples
6. **Caching Strategies**: Trade-off memory vs. computation

### Concepts Covered in v1.4–v1.7
7. **Clustering Algorithms**: K-means, HDBSCAN, hierarchical
8. **Classification**: k-NN, decision boundaries
9. **Probabilistic Methods**: MinHash, LSH, Jaccard similarity
10. **NLP Fundamentals**: Tokenization, TF-IDF, stopwords
11. **Transformer Models**: Attention mechanism, sequence-to-sequence
12. **Evaluation Metrics**: Silhouette score, purity, recall@K

---

## CSP & Deployment

### Content Security Policy
Current CSP allows `script-src 'self'`:
- ✅ Local scripts (popup.js, background.js, ml-worker.js)
- ❌ External CDN (by default)

**Solution A**: Bundle models in extension ZIP
- Pros: Zero CSP changes, guaranteed offline
- Cons: Extension size +25–180 MB per model

**Solution B**: Whitelist CDN in CSP
```json
"content_security_policy": {
  "extension_pages": "script-src 'self' https://cdn-release.huggingface.co; object-src 'self'; base-uri 'self'; frame-ancestors 'none'"
}
```
- Pros: Smaller extension size, automatic model updates
- Cons: Requires internet for first run

**Recommendation**: Start with Solution A (bundle); migrate to Solution B for v1.4 if extension size becomes issue.

---

## Success Metrics

| Feature | Metric | Target |
|---------|--------|--------|
| Semantic Search | Search latency | <2 sec for 500 entries |
| UMAP Visualization | Render time | <5 sec for 500 entries |
| Analytics | Cloud render time | <1 sec |
| Classification | Accuracy on test set | >80% on labeled data |
| Deduplication | F1 score | >85% precision + recall |

---

## References & Resources

### Documentation
- Transformers.js: https://huggingface.co/docs/transformers.js
- UMAP JavaScript: https://github.com/jakemannens/umap-js
- Web Workers: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
- IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

### Papers & Concepts
- "An Introduction to t-SNE" (van der Maaten & Hinton, 2008)
- "UMAP: Uniform Manifold Approximation and Projection" (McInnes et al., 2018)
- "Similarity Estimation Techniques from Rounding Algorithms" (MinHash, Broder 1997)
- "Locality-sensitive hashing scheme based on p-stable distributions" (Datar et al., 2004)

---

## Appendix: Model Sizes & Performance

| Model | Task | Size | Latency (1 entry) | License |
|-------|------|------|-------------------|---------|
| Xenova/all-MiniLM-L6-v2 | Embeddings | 22 MB | ~100 ms | Apache 2.0 |
| Xenova/distilbart-cnn-6-6 | Summarization | 180 MB | ~2 sec | Apache 2.0 |
| Xenova/t5-small | Summarization | 150 MB | ~1.5 sec | Apache 2.0 |
| UMAP-js | Dim. Reduction | 200 KB | ~3 sec (500 pts) | MIT |
| ml-kmeans | Clustering | 20 KB | ~100 ms (500 pts) | MIT |

---

## Next Steps

1. **Week 1**: Implement Phase 1 (ml-worker.js, embedding storage, semantic search UI)
2. **Week 2**: Test retroactive embedding of old entries; optimize performance
3. **Week 3**: Implement Phase 2 (UMAP worker, canvas rendering)
4. **Week 4**: Implement Phase 6 (TF-IDF, word cloud, statistics)
5. **Weeks 5–6**: Testing, UI polish, documentation

---

*Document Version: 1.0*  
*Last Updated: 2026-04-24*  
*Author: David Salazar (DearDeivy) + Claude AI*
