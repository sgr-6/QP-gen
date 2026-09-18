const OpenAI = require('openai');

class AiKeyManager {
  constructor() {
    this.keys = [];
    this.currentIndex = 0;
    this.clients = [];
    
    // Split queues
    this.generateQueue = [];
    
    this.isProcessingGenerate = false;
    
    // Parse keys from environment
    if (process.env.OPENROUTER_API_KEYS) {
      this.keys = process.env.OPENROUTER_API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }
    
    if (this.keys.length === 0) {
      console.warn("No OpenRouter API keys provided in environment.");
    }
    
    // Initialize a client for each key
    this.clients = this.keys.map(key => new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: key,
      defaultHeaders: {
        "HTTP-Referer": "https://qp-generator-backend.onrender.com",
        "X-Title": "QP Generator",
      }
    }));
  }

  /**
   * Executes an AI operation with automatic key rotation on 429 errors.
   * @param {Function} operation - Async function that takes an initialized `ai` client.
   * @returns {Promise<any>}
   */
  async executeWithAI(operation) {
    if (this.clients.length === 0) {
      throw new Error("No OpenAI/OpenRouter clients available. Please set API keys.");
    }

    return new Promise((resolve, reject) => {
      this.generateQueue.push({ operation, resolve, reject });
      this._processGenerateQueue();
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
          
          // Wait 500ms between calls
          await new Promise(r => setTimeout(r, 500));
          break;
        } catch (error) {
          const status = error.status || (error.response && error.response.status);
          const isRateLimit = status === 429 || (error.message && (error.message.includes('429') || error.message.includes('Quota')));
          const isServerErr = status >= 500 || (error.message && error.message.includes('503'));
          
          if (isRateLimit || isServerErr) {
            console.warn(`[AI Key Manager - Generate] Key at index ${this.currentIndex} hit rate limit or 50x. Error: ${error.message}. Rotating to next key...`);
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
        console.warn(`[AI Key Manager - Generate] All keys exhausted for this item. Waiting 30 seconds for quotas to reset before retrying...`);
        await new Promise(r => setTimeout(r, 30000));
        this.generateQueue.unshift({ operation, resolve, reject });
      }
    }

    this.isProcessingGenerate = false;
  }
}

// Export a singleton instance
module.exports = new AiKeyManager();
