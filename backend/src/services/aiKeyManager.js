const { GoogleGenAI } = require('@google/genai');

class AiKeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.clients = [];
    
    // Split queues
    this.generateQueue = [];
    this.embedQueue = [];
    
    this.isProcessingGenerate = false;
    this.isProcessingEmbed = false;
    
    // Parse keys from environment
    if (process.env.GEMINI_API_KEYS) {
      this.keys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }
    if (process.env.GEMINI_API_KEY && !this.keys.includes(process.env.GEMINI_API_KEY)) {
      this.keys.unshift(process.env.GEMINI_API_KEY); // Original key gets priority
    }
    
    if (this.keys.length === 0) {
      console.warn("No Gemini API keys provided in environment.");
    }
    
    // Initialize a client for each key
    this.clients = this.keys.map(key => new GoogleGenAI({ apiKey: key }));
  }

  /**
   * Executes an AI operation with automatic key rotation on 429 errors.
   * @param {Function} operation - Async function that takes an initialized `ai` client.
   * @param {string} type - 'generate' (15 RPM) or 'embed' (1500 RPM)
   * @returns {Promise<any>}
   */
  async executeWithAI(operation, type = 'generate') {
    if (this.clients.length === 0) {
      throw new Error("No GoogleGenAI clients available. Please set API keys.");
    }

    return new Promise((resolve, reject) => {
      if (type === 'embed') {
        this.embedQueue.push({ operation, resolve, reject });
        this._processEmbedQueue();
      } else {
        this.generateQueue.push({ operation, resolve, reject });
        this._processGenerateQueue();
      }
    });
  }

  async _processGenerateQueue() {
    if (this.isProcessingGenerate || this.generateQueue.length === 0) return;
    this.isProcessingGenerate = true;

    while (this.generateQueue.length > 0) {
      const { operation, resolve, reject } = this.generateQueue.shift();
      let attempts = 0;
      const maxAttempts = this.clients.length * 2;
      let success = false;

      while (attempts < maxAttempts) {
        const currentClient = this.clients[this.currentIndex];
        try {
          const result = await operation(currentClient);
          resolve(result);
          success = true;
          
          // Wait 4000ms before starting next item in queue. 
          // 60 seconds / 4s = 15 requests per minute (the absolute max for a single free-tier project)
          await new Promise(r => setTimeout(r, 4000));
          break;
        } catch (error) {
          const isRateLimit = error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('Quota')));
          const isServerErr = error.status >= 500 || (error.message && error.message.includes('503'));
          
          if (isRateLimit || isServerErr) {
            console.warn(`[AI Key Manager - Generate] Key at index ${this.currentIndex} hit rate limit or 503. Error: ${error.message}. Rotating to next key...`);
            this.currentIndex = (this.currentIndex + 1) % this.clients.length;
            attempts++;
            await new Promise(r => setTimeout(r, 1000));
          } else {
            reject(error);
            success = true;
            break;
          }
        }
      }

      if (!success) {
        console.warn(`[AI Key Manager - Generate] All keys exhausted for this item. Waiting 65 seconds for quotas to reset before retrying...`);
        await new Promise(r => setTimeout(r, 65000));
        this.generateQueue.unshift({ operation, resolve, reject });
      }
    }

    this.isProcessingGenerate = false;
  }

  async _processEmbedQueue() {
    if (this.isProcessingEmbed || this.embedQueue.length === 0) return;
    this.isProcessingEmbed = true;

    while (this.embedQueue.length > 0) {
      const { operation, resolve, reject } = this.embedQueue.shift();
      let attempts = 0;
      const maxAttempts = this.clients.length * 2;
      let success = false;

      while (attempts < maxAttempts) {
        const currentClient = this.clients[this.currentIndex];
        try {
          const result = await operation(currentClient);
          resolve(result);
          success = true;
          
          // Embeddings have 1500 RPM. We wait 45ms to ensure we don't blast too fast.
          // 60 seconds / 0.045s ≈ 1333 requests per minute
          await new Promise(r => setTimeout(r, 45));
          break;
        } catch (error) {
          const isRateLimit = error.status === 429 || (error.message && (error.message.includes('429') || error.message.includes('Quota')));
          const isServerErr = error.status >= 500 || (error.message && error.message.includes('503'));
          
          if (isRateLimit || isServerErr) {
            console.warn(`[AI Key Manager - Embed] Key at index ${this.currentIndex} hit rate limit or 503. Error: ${error.message}. Rotating to next key...`);
            this.currentIndex = (this.currentIndex + 1) % this.clients.length;
            attempts++;
            await new Promise(r => setTimeout(r, 1000));
          } else {
            reject(error);
            success = true;
            break;
          }
        }
      }

      if (!success) {
        console.warn(`[AI Key Manager - Embed] All keys exhausted for this item. Waiting 65 seconds for quotas to reset before retrying...`);
        await new Promise(r => setTimeout(r, 65000));
        this.embedQueue.unshift({ operation, resolve, reject });
      }
    }

    this.isProcessingEmbed = false;
  }
}

// Export a singleton instance
module.exports = new AiKeyManager();
