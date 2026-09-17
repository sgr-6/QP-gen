require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const res = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: 'hello world',
      config: { outputDimensionality: 768 }
    });
    console.log("gemini-embedding-2 success", res.embeddings[0].values.length);
  } catch (e) {
    console.log("Error:", e.message);
  }
}
run();
