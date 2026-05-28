const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { inferTags } = require('./aiService');

/**
 * Extracts and normalizes text from a file based on its extension.
 * Supported: .csv, .xlsx, .docx, .pdf
 * @param {string} filePath 
 * @returns {Promise<Array>} Array of normalized questions [{questionText, marks, btl, co}]
 */
const parseFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  let rawQuestions = [];

  switch (ext) {
    case '.csv':
      rawQuestions = await parseCSV(filePath);
      break;
    case '.xlsx':
      rawQuestions = await parseXLSX(filePath);
      break;
    case '.docx':
      rawQuestions = await parseDOCX(filePath);
      break;
    case '.pdf':
      rawQuestions = await parsePDF(filePath);
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

const parseCSV = (filePath) => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
};

const parseXLSX = async (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
};

const parseDOCX = async (filePath) => {
  const result = await mammoth.extractRawText({ path: filePath });
  return splitTextIntoObjects(result.value);
};

const parsePDF = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return splitTextIntoObjects(data.text);
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

    // Match "1.", "2.", etc.
    if (trimmed.match(/^\d+\./)) {
      results.push({ rawText: trimmed, module: currentModule });
      expectedQNum = parseInt(trimmed.match(/^\d+/)[0]) + 1;
    } 
    // Match standalone numbers that match our expected sequence (or reset to 1 for a new module)
    else if (trimmed === String(expectedQNum) || trimmed === '1') {
      if (trimmed === '1') expectedQNum = 1;
      results.push({ rawText: trimmed, module: currentModule });
      expectedQNum++;
    } 
    else if (results.length > 0) {
      results[results.length - 1].rawText += ' ' + trimmed;
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

    if (!questionText) return null;

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
