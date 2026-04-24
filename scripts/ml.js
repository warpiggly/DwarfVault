/**
 * ML Module: Wrapper around ml-worker
 * Provides simple async API for embedding computation
 */

const DwarfML = (() => {
  let worker = null;
  let requestId = 0;
  const pendingRequests = {};

  function getWorker() {
    if (!worker) {
      worker = new Worker('scripts/ml-worker.js');
      worker.onmessage = (event) => {
        const { id, status, embedding, embeddings, scores, error } = event.data;
        const request = pendingRequests[id];
        if (!request) return;

        delete pendingRequests[id];

        if (status === 'error') {
          request.reject(new Error(error));
        } else {
          request.resolve(embedding || embeddings || scores);
        }
      };
    }
    return worker;
  }

  function sendRequest(command, data = {}) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pendingRequests[id] = { resolve, reject };

      const worker = getWorker();
      worker.postMessage({ id, command, ...data });
    });
  }

  return {
    /**
     * Initialize the ML worker and load model
     */
    async init() {
      try {
        await sendRequest('init');
        console.log('[DwarfML] Model initialized');
      } catch (error) {
        console.error('[DwarfML] Init failed:', error);
        throw error;
      }
    },

    /**
     * Embed a single text string
     * @param {string} text
     * @returns {Promise<number[]>} 384-dim embedding
     */
    async embed(text) {
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string');
      }
      try {
        await this.init(); // Ensure model is loaded
        return await sendRequest('embed-single', { text });
      } catch (error) {
        console.error('[DwarfML] Embedding failed:', error);
        throw error;
      }
    },

    /**
     * Embed multiple texts in batch
     * @param {string[]} texts
     * @returns {Promise<(number[] | null)[]>} Array of embeddings (null if failed)
     */
    async embedBatch(texts) {
      if (!Array.isArray(texts)) {
        throw new Error('Texts must be an array');
      }
      try {
        await this.init();
        return await sendRequest('embed-batch', { texts });
      } catch (error) {
        console.error('[DwarfML] Batch embedding failed:', error);
        throw error;
      }
    },

    /**
     * Search embeddings by cosine similarity
     * @param {number[]} queryEmbedding
     * @param {(number[] | null)[]} storedEmbeddings
     * @returns {Promise<Array<{index: number, score: number}>>} Sorted by score (descending)
     */
    async search(queryEmbedding, storedEmbeddings) {
      if (!Array.isArray(queryEmbedding)) {
        throw new Error('Query embedding must be an array');
      }
      try {
        return await sendRequest('cosine-search', { queryEmbedding, storedEmbeddings });
      } catch (error) {
        console.error('[DwarfML] Search failed:', error);
        throw error;
      }
    },

    /**
     * Terminate worker (free memory)
     */
    terminate() {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    }
  };
})();