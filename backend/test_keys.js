require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
  const keys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim());
  if (process.env.GEMINI_API_KEY) keys.unshift(process.env.GEMINI_API_KEY);
  
  console.log(`Found ${keys.length} keys`);
  
  for (let i = 0; i < keys.length; i++) {
    const ai = new GoogleGenAI({ apiKey: keys[i] });
    try {
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: "Hello"
      });
      console.log(`Key ${i} is WORKING!`);
    } catch (e) {
      console.log(`Key ${i} error: ${e.message}`);
    }
  }
}
test();
