require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  const response = await ai.models.list();
  const names = response.map(m => m.name);
  console.log(names.filter(n => n.includes('embed') || n.includes('text')));
}
run();
