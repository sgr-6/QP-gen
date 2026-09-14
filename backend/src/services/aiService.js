const { GoogleGenAI } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai;
if (apiKey && apiKey !== 'your_free_gemini_api_key_here') {
  ai = new GoogleGenAI({ apiKey: apiKey });
}

/**
 * Uses Gemini API to infer missing BTL and CO from a question.
 * @param {string} questionText 
 * @returns {Promise<{btl: string, co: string}>}
 */
const inferTags = async (questionText) => {
  if (!ai) {
    console.warn("Gemini API not configured. Returning default tags.");
    return { btl: 'L1', co: 'CO1' }; // Fallback if no API key
  }

  const prompt = `
    You are an expert in Outcome-Based Education (OBE) for Engineering.
    Analyze the following exam question and classify it into:
    1. Bloom's Taxonomy Level (BTL): Must be one of L1, L2, L3, L4, L5, L6.
       (e.g., Define/List = L1, Explain = L2, Apply/Calculate = L3, Analyze = L4, Evaluate = L5, Create/Design = L6).
    2. Course Outcome (CO): Must be one of CO1, CO2, CO3, CO4, CO5 based on typical computer science/engineering subjects. 
       If unsure, pick the most likely one based on topic depth (e.g. basics = CO1, advanced = CO5).

    Question: "${questionText}"

    Output ONLY a valid JSON object in this format, nothing else:
    {"btl": "L2", "co": "CO1"}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    const text = response.text;
    const parsed = JSON.parse(text);
    return {
      btl: parsed.btl || 'L2',
      co: parsed.co || 'CO1'
    };
  } catch (error) {
    console.error("Error inferring tags for:", questionText.substring(0, 50), "...", error.message);
    // Return safe default tags if AI inference fails due to 503 or Rate Limits
    return {
      btl: "L2",
      co: "CO1"
    };
  }
};

/**
 * Generates embeddings for a given text.
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
const generateEmbedding = async (text) => {
  if (!ai) {
    console.warn("Gemini API not configured. Returning default embedding.");
    return Array(768).fill(0.0);
  }
  try {
    const response = await ai.models.embedContent({ model: 'text-embedding-004', contents: text });
    return response.embedding.values;
  } catch (error) {
    console.error("Error generating embedding:", error.message);
    return Array(768).fill(0.0);
  }
};

/**
 * Checks if an image is a meaningful diagram/equation vs decorative artifact.
 * @param {string} base64Image 
 * @param {string} mimeType 
 * @returns {Promise<boolean>}
 */
const checkImageSanity = async (base64Image, mimeType) => {
  if (!ai) {
    console.warn("Gemini API not configured. Defaulting to true.");
    return true;
  }
  
  const prompt = "Is this image a meaningful diagram, chart, or equation that should be included in an exam question? Answer only YES or NO.";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType
          }
        },
        prompt
      ]
    });
    
    const text = response.text.trim().toUpperCase();
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
