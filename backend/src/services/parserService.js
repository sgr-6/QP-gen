const fs = require('fs');
const path = require('path');
const os = require('os');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse'); // Fallback if needed
const axios = require('axios');
const { inferTags } = require('./aiService');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const supabase = require('../config/supabaseClient');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ensureBucket = async (bucketName) => {
  try {
    const { data, error } = await supabase.storage.getBucket(bucketName);
    if (error && error.message.includes('not found')) {
      await supabase.storage.createBucket(bucketName, { public: true });
    }
  } catch (err) {
    console.log("Bucket check error:", err.message);
  }
};

/**
 * Extracts and normalizes text from a file stream based on its extension.
 * Supported: .csv, .xlsx, .docx, .pdf
 * @param {string} fileUrl The Supabase public URL
 * @param {string} ext The file extension
 * @returns {Promise<Array>} Array of normalized questions [{questionText, marks, btl, co}]
 */
const parseFile = async (fileUrl, ext) => {
  ext = ext.toLowerCase();
  let rawQuestions = [];

  switch (ext) {
    case '.csv':
      rawQuestions = await parseCSV(fileUrl);
      break;
    case '.xlsx':
      rawQuestions = await parseXLSX(fileUrl);
      break;
    case '.docx':
      rawQuestions = await parseDOCX(fileUrl);
      break;
    case '.pdf':
      rawQuestions = await parsePDF(fileUrl);
      break;
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }

  // Normalization layer
  const normalized = [];
  console.log(`Extracted ${rawQuestions.length} raw blocks`);
  for (const raw of rawQuestions) {
    const norm = await normalizeQuestion(raw);
    if (norm) normalized.push(norm);
  }

  return normalized;
};

const parseCSV = async (url) => {
  const response = await axios.get(url, { responseType: 'stream' });
  return new Promise((resolve, reject) => {
    const results = [];
    response.data
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

const parseXLSX = async (url) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const workbook = xlsx.read(response.data, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

const parseDOCX = async (url) => {
  await ensureBucket('question-images');
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  
  const options = {
    convertImage: mammoth.images.imgElement(function(image) {
      return image.read("base64").then(async function(imageBase64) {
        const ext = image.contentType.split('/')[1] || 'jpeg';
        const fileName = `img_${Date.now()}_${Math.floor(Math.random()*1000)}.${ext}`;
        const binaryBuffer = Buffer.from(imageBase64, 'base64');
        
        const { error: uploadError } = await supabase
          .storage
          .from('question-images')
          .upload(fileName, binaryBuffer, { contentType: image.contentType, upsert: false });
          
        if (uploadError) {
          console.error("Image upload failed:", uploadError);
          return { src: "" };
        }
        
        const { data: { publicUrl } } = supabase
          .storage
          .from('question-images')
          .getPublicUrl(fileName);
          
        return { src: publicUrl };
      });
    })
  };

  const result = await mammoth.convertToHtml({ buffer }, options);
  
  const turndownService = new TurndownService({ headingStyle: 'atx' });
  turndownService.use(turndownPluginGfm.gfm);
  const markdown = turndownService.turndown(result.value);
  
  try {
    const prompt = `You are an expert exam parser. Extract all questions from this document text. 
Return ONLY a valid JSON array of objects with the following schema:
[{ "questionText": "Question text preserving any Markdown formatting for tables", "marks": "number or null", "btl": "string (e.g., L1) or null", "co": "string (e.g., CO1) or null", "module": "string (e.g., M1) or null" }]
Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON array.

DOCUMENT TEXT:
${markdown}`;

    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    let resultText = geminiResponse.text.replace(/^```json/im, '').replace(/```$/im, '').trim();
    const parsedJson = JSON.parse(resultText);
    
    return parsedJson.map(q => ({
      rawText: q.questionText,
      marks: q.marks,
      btl: q.btl,
      co: q.co,
      module: q.module
    }));
  } catch (error) {
    console.error("Gemini DOCX parsing failed, falling back to regex:", error);
    return splitTextIntoObjects(markdown);
  }
};

const parsePDF = async (url) => {
  // Use Gemini 1.5 Pro to natively parse PDF preserving tables
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const dataBuffer = Buffer.from(response.data);
  
  const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.pdf`);
  fs.writeFileSync(tempPath, dataBuffer);
  
  try {
    const uploadedFile = await ai.files.upload({
      file: tempPath,
      mimeType: 'application/pdf',
    });

    const prompt = `You are an expert exam parser. Extract all questions from this document. 
Return ONLY a valid JSON array of objects with the following schema:
[{ "questionText": "Question text preserving any Markdown formatting for tables", "marks": "number or null", "btl": "string (e.g., L1) or null", "co": "string (e.g., CO1) or null", "module": "string (e.g., M1) or null" }]
For tables, use standard markdown table syntax inside the questionText. 
Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON array.`;

    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
        prompt
      ]
    });

    // Cleanup
    await ai.files.delete({ name: uploadedFile.name });
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    let resultText = geminiResponse.text.replace(/^```json/im, '').replace(/```$/im, '').trim();
    const parsedJson = JSON.parse(resultText);
    
    // Map to the raw format the normalizer expects
    return parsedJson.map(q => ({
      rawText: q.questionText,
      marks: q.marks,
      btl: q.btl,
      co: q.co,
      module: q.module
    }));

  } catch (error) {
    console.error("Gemini PDF parsing failed, falling back to pdf-parse:", error);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    // Fallback
    const data = await pdfParse(dataBuffer);
    return splitTextIntoObjects(data.text);
  }
};

/**
 * Helper to split unstructured raw text (like PDF/DOCX) into logical question objects.
 * Expects lines formatted loosely like: "1. What is Node? [10 Marks] [L1] [CO1]"
 */
const splitTextIntoObjects = (text) => {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const results = [];
  let expectedQNum = 1;
  let currentModule = 'M1';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check for Module headers
    const modMatch = trimmed.match(/Module\s*(\d+)/i);
    if (modMatch) {
      currentModule = `M${modMatch[1]}`;
      expectedQNum = 1; // Reset expected question number for the new module
      continue;
    }

    // Clean markdown characters at the start of the line for regex check
    const cleanedLine = trimmed.replace(/^[\*\#\_\>\[\]\-\s]+/, '');

    // Match "1.", "2)", "1a)", "a)", "Q1", etc.
    const isQuestionStart = cleanedLine.match(/^(?:Q\s*)?\d+\s*[\.\)]|^\d*\s*[a-z]\s*[\.\)]/i);
    
    if (isQuestionStart) {
      results.push({ rawText: trimmed, module: currentModule });
      expectedQNum++; // We just loosely increment, doesn't matter much with this regex
    } 
    // Match standalone numbers that match our expected sequence (or reset to 1 for a new module)
    else if (trimmed === String(expectedQNum) || trimmed === '1') {
      if (trimmed === '1') expectedQNum = 1;
      results.push({ rawText: trimmed, module: currentModule });
      expectedQNum++;
    } 
    else if (results.length > 0) {
      results[results.length - 1].rawText += '\n' + trimmed;
    }
  }
  return results;
};

/**
 * Normalizes a raw object/text into standard format.
 * If btl/co is missing, invokes AI fallback tagging.
 */
const normalizeQuestion = async (raw) => {
  try {
    let questionText = raw.question || raw.Question || raw.rawText || Object.values(raw)[0];
    
    // In PDFs, tables get flattened so we might see "... 10 4" (10 marks, CO4)
    // We will look for trailing number sequences to extract marks
    let marksMatch = questionText.match(/\s+(\d{1,2})(?:\s+(?:CO)?[1-6])?\s*$/i);
    let marks = raw.marks || raw.Marks || extractRegex(questionText, /\[?(\d+)\s*[mM]arks?\]?/) || (marksMatch ? marksMatch[1] : null);
    
    let btl = raw.btl || raw.BTL || extractRegex(questionText, /\[?(L[1-6])\]?/);
    let co = raw.co || raw.CO || extractRegex(questionText, /\[?(CO[1-5])\]?/);

    // Filter out purely numerical artifacts (e.g. "4") that aren't real questions
    if (!questionText || !/[a-zA-Z]/.test(questionText)) return null;

    // AI Fallback Tagging
    if (!btl || !co) {
      const aiInferred = await inferTags(questionText);
      if (!btl) btl = aiInferred.btl;
      if (!co) co = aiInferred.co;
    }

    return {
      questionText: cleanText(questionText),
      marks: parseInt(marks) || 5, // Default 5 marks if unknown
      btl: btl || 'L2',
      co: co || 'CO1',
      module: raw.module || null
    };
  } catch (error) {
    console.error("Normalization error on row:", raw, error);
    return null;
  }
};

const extractRegex = (text, regex) => {
  if (typeof text !== 'string') return null;
  const match = text.match(regex);
  return match ? match[1] : null;
};

const cleanText = (text) => {
  return text.replace(/\[?(L[1-6])\]?/gi, '')
             .replace(/\[?(CO[1-5])\]?/gi, '')
             .replace(/\[?(\d+)\s*[mM]arks?\]?/gi, '')
             // Match all trailing standalone digits/CO markers (e.g. " 10 4" or " 8 CO1")
             .replace(/(?:\s+(?:CO)?[0-9]{1,2})+\s*$/gi, '')
             .replace(/^\d+[\.\s]+/, '')
             .trim();
};

module.exports = {
  parseFile
};
