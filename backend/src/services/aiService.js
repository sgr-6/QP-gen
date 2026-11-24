const aiKeyManager = require('./aiKeyManager');
const { requestJson, models } = require('./structuredAiService');
const { classifyBloom, mapCourseOutcome, bloomPrompt } = require('./bloomService');
let pipeline = null;

// Initialize transformers.js pipeline lazily
const initPipeline = async () => {
  if (!pipeline) {
    // Import dynamically to avoid loading issues in some environments
    const transformers = await import('@xenova/transformers');
    pipeline = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipeline;
};
/**
 * Uses Gemini API to infer missing BTL and CO from a question.
 * @param {string} questionText 
 * @returns {Promise<{btl: string, co: string}>}
 */
const inferTags = async (questionText, syllabus = null, module = null) => {
  const parsed = await requestJson({ maxTokens: 600, prompt: `Classify the actual cognitive demand and map ONLY to explicit supplied course outcomes. Return {"btl":"L1-L6", "co":null, "rationale":"reason for the cognitive demand"}. If no outcome is supported, CO must be null.\n${bloomPrompt}\nQUESTION: ${questionText}\nOUTCOMES: ${JSON.stringify(syllabus?.courseOutcomes || [])}` });
  const mapping = classifyBloom(questionText, parsed.btl, parsed.rationale);
  return { ...mapping, ...mapCourseOutcome(questionText, syllabus, parsed.co, module) };
};

/**
 * Generates embeddings for a given text.
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
const generateEmbedding = async (text) => {
  try {
    const extractor = await initPipeline();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Error generating local embedding:", error.message);
    return null; // Never represent an embedding failure as a valid zero vector.
  }
};

/**
 * Checks if an image is a meaningful diagram/equation vs decorative artifact.
 * @param {string} base64Image 
 * @param {string} mimeType 
 * @returns {Promise<boolean>}
 */
const checkImageSanity = async (base64Image, mimeType) => {
  const prompt = "Is this image a meaningful diagram, chart, or equation that should be included in an exam question? Answer only YES or NO.";
  
  try {
    const response = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.chat.completions.create({
        model: models.generation,
        max_tokens: 16,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
          }
        ]
      });
    });
    
    const text = response.choices[0].message.content.trim().toUpperCase();
    return text.includes("YES");
  } catch (error) {
    console.error("Error checking image sanity:", error.message);
    return true; // Fallback to including it
  }
};

module.exports = {
  inferTags,
  generateEmbedding,
  checkImageSanity
};
