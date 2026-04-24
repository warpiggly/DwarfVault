/**
 * ML Worker: Handles embedding computation via Transformers.js
 * Runs in separate thread to avoid blocking UI
 */

let model = null;
let isLoading = false;

self.onmessage = async (event) => {
  const { command, text, texts, id } = event.data;

  try {
    if (command === 'init') {
      await initModel();
      self.postMessage({ status: 'ready', id });
    } else if (command === 'embed-single') {
      const embedding = await embedText(text);
      self.postMessage({ status: 'success', embedding, id });
    } else if (command === 'embed-batch') {
      const embeddings = await embedTexts(texts);
      self.postMessage({ status: 'success', embeddings, id });
    } else if (command === 'cosine-search') {
      const { queryEmbedding, storedEmbeddings } = event.data;
      const scores = computeCosineScores(queryEmbedding, storedEmbeddings);
      self.postMessage({ status: 'success', scores, id });
    }
  } catch (error) {
    self.postMessage({ status: 'error', error: error.message, id });
  }
};

async function initModel() {
  if (model) return;
  if (isLoading) {
    // Wait for model to load
    while (!model && isLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return;
  }

  isLoading = true;
  try {
    const { pipeline } = await import('https://cdn-release.huggingface.co/npm/@xenova/transformers');
    model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    isLoading = false;
  } catch (error) {
    isLoading = false;
    throw new Error(`Failed to load model: ${error.message}`);
  }
}

async function embedText(text) {
  if (!model) await initModel();

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text for embedding');
  }

  const result = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

async function embedTexts(texts) {
  if (!model) await initModel();

  if (!Array.isArray(texts)) {
    throw new Error('Texts must be an array');
  }

  const embeddings = [];
  for (const text of texts) {
    if (!text || typeof text !== 'string') {
      embeddings.push(null);
      continue;
    }
    try {
      const result = await model(text, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(result.data));
    } catch (error) {
      embeddings.push(null);
    }
  }

  return embeddings;
}

function computeCosineScores(queryEmbedding, storedEmbeddings) {
  if (!Array.isArray(queryEmbedding)) {
    throw new Error('Query embedding must be an array');
  }

  const scores = storedEmbeddings.map((emb, idx) => {
    if (!emb || !Array.isArray(emb)) {
      return { index: idx, score: 0 };
    }
    const score = cosineSimilarity(queryEmbedding, emb);
    return { index: idx, score };
  });

  return scores.sort((a, b) => b.score - a.score);
}

function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have same dimension');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (norm1 * norm2);
}
