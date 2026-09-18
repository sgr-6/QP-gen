const fs = require('fs');
const path = require('path');
const os = require('os');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse'); // Fallback if needed
const axios = require('axios');
const { inferTags } = require('./aiService');
const crypto = require('crypto');
// const { admin } = require('../config/firebaseAdmin'); // Removed: using Supabase Storage now
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');
const supabase = require('../config/supabaseClient');
const aiKeyManager = require('./aiKeyManager');
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
 * @param {string} tenantId The tenant ID
 * @returns {Promise<Array>} Array of normalized questions [{questionText, marks, btl, co}]
 */
const parseFile = async (fileUrl, ext, tenantId) => {
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
      rawQuestions = await parseDOCX(fileUrl, tenantId);
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

const parseDOCX = async (url, tenantId) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  
  const options = {
    convertImage: mammoth.images.imgElement(function(image) {
      return image.read("base64").then(async function(imageBase64) {
        const ext = image.contentType.split('/')[1] || 'jpeg';
        const binaryBuffer = Buffer.from(imageBase64, 'base64');
        
        // Hash the buffer
        const hash = crypto.createHash('sha256').update(binaryBuffer).digest('hex');
        
        // Upload to Supabase Storage
        await ensureBucket('images');
        await supabase.storage.from('images').upload(`${tenantId}/${hash}.${ext}`, binaryBuffer, {
          contentType: image.contentType,
          upsert: true
        });
        
        const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(`${tenantId}/${hash}.${ext}`);
        const publicUrl = publicUrlData.publicUrl;
        
        return { src: publicUrl };
      });
    })
  };

  const result = await mammoth.convertToHtml({ buffer }, options);
  
  const turndownService = new TurndownService({ headingStyle: 'atx' });
  turndownService.use(turndownPluginGfm.gfm);
  let markdown = turndownService.turndown(result.value);
  
  // Replace images with placeholders to prevent Gemini from stripping them or their URLs
  const imageMap = {};
  let imageCounter = 0;
  markdown = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const placeholder = `__IMAGE_PLACEHOLDER_${imageCounter}__`;
    imageMap[placeholder] = match;
    imageCounter++;
    return placeholder;
  });
  
  try {
    const prompt = `You are an expert exam parser. Extract all questions from this document text. 
Return ONLY a valid JSON array of objects with the following schema:
[{ "questionText": "Question text preserving any Markdown formatting for tables and images", "marks": "number or null", "btl": "string (e.g., L1) or null", "co": "string (e.g., CO1) or null", "module": "string (e.g., M1) or null" }]
CRITICAL: If the document contains any image placeholders like __IMAGE_PLACEHOLDER_0__, you MUST preserve them exactly as they are in the 'questionText'. Do not strip them out!
CRITICAL: If a question contains a table followed by sub-questions (e.g., "1) What is...", "2) Determine..."), make sure the sub-questions are placed OUTSIDE and BELOW the markdown table, NOT inside the table rows!
Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON array.

DOCUMENT TEXT:
${markdown}`;

    const geminiResponse = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 8000
      });
    });

    let resultText = geminiResponse.choices[0].message.content.replace(/^```json/im, '').replace(/```$/im, '').trim();
    
    // Restore image placeholders
    for (const [placeholder, originalImage] of Object.entries(imageMap)) {
      resultText = resultText.split(placeholder).join(originalImage);
    }

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
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const dataBuffer = Buffer.from(response.data);
  const data = await pdfParse(dataBuffer);
  
  try {
    const prompt = `You are an expert exam parser. Extract all questions from this document. 
Return ONLY a valid JSON array of objects with the following schema:
[{ "questionText": "Question text preserving any Markdown formatting for tables and images", "marks": "number or null", "btl": "string (e.g., L1) or null", "co": "string (e.g., CO1) or null", "module": "string (e.g., M1) or null" }]
Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON array.

DOCUMENT TEXT:
${data.text}`;

    const geminiResponse = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.chat.completions.create({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 8000
      });
    });

    let resultText = geminiResponse.choices[0].message.content.replace(/^```json/im, '').replace(/```$/im, '').trim();
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
    console.error("OpenRouter PDF parsing failed, falling back to regex:", error);
    // Fallback
    return splitTextIntoObjects(data.text);
  }
};

/**
 * Helper to split unstructured raw text (like PDF/DOCX) into logical question objects.
 * Expects lines formatted loosely like: "1. What is Node? [10 Marks] [L1] [CO1]"
 */
const splitTextIntoObjects = (text) => {
  // Handle HTML tables generated by Mammoth that Turndown missed
  let processedText = text
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/p>\s*<\/?td>\s*<p>/gi, ' ')
    .replace(/<\/?td>/gi, ' ')
    .replace(/<[^>]+>/g, '');

  const lines = processedText.split('\n').filter(line => line.trim().length > 0);
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
    const cleanedLine = trimmed.replace(/^[\*\#\_\>\[\]\-\s\|]+/, '');

    // Ignore table headers like "Q. No."
    if (cleanedLine.match(/^Q\.?\s*No\.?/i) || cleanedLine.match(/^Sl\.?\s*No\.?/i)) {
      continue;
    }

    // Match "1.", "1 ", "2)", "1a)", "a)", "Q1", etc.
    const isQuestionStart = cleanedLine.match(/^(?:Q\s*\.?)?\s*\d+\s*[\.\)\s]+|^[a-z]\s*[\.\)]/i);
    
    // DEBUG LOG
    console.log("Line:", trimmed);
    console.log("Cleaned:", cleanedLine);
    console.log("IsStart:", !!isQuestionStart);
    
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
