require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    console.log("Testing gemini-2.5-pro...");
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello, what model are you?'
    });
    console.log("Success:", res.text);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
test();
