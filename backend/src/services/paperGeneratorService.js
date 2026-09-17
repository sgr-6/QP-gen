const { db, admin } = require('../config/firebaseAdmin');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt({ html: true, breaks: true });
const aiKeyManager = require('./aiKeyManager');

/**
 * AI-Powered Paper Generation Algorithm
 * Fetches Syllabus, Notes, and Question Bank to intelligently generate a paper matching constraints.
 */
const generatePaper = async (courseTitle, examType = 'semester', examConfig = null, tenantId) => {
  if (!tenantId) {
    throw new Error('Tenant ID is required for generation');
  }

  // 1. Fetch available questions for the course
  let allQuestions = [];
  const banksQuery = await db.collection('question_banks')
    .where('courseTitle', '==', courseTitle)
    .where('tenantId', '==', tenantId)
    .get();
  
  if (!banksQuery.empty) {
    const bankDoc = banksQuery.docs[0];
    const questionsSnapshot = await bankDoc.ref.collection('questions').get();
    questionsSnapshot.forEach(doc => allQuestions.push({ id: doc.id, ...doc.data() }));
  }

  // 2. Fetch Syllabus
  const docId = `${tenantId}_${courseTitle.replace(/\s+/g, '_').toLowerCase()}`;
  let syllabus = null;
  const syllabusDoc = await db.collection('syllabi').doc(docId).get();
  if (syllabusDoc.exists) syllabus = syllabusDoc.data();

  // 3. Fetch Notes
  let notes = null;
  const notesDoc = await db.collection('notes').doc(docId).get();
  if (notesDoc.exists) notes = notesDoc.data();

  // Validate we have at least *some* data
  if (allQuestions.length === 0 && !syllabus && !notes) {
    throw new Error(`No question bank, syllabus, or notes found for course: ${courseTitle}. Cannot generate paper.`);
  }

  const isInternal = examType === 'internal';
  const targetMarksPerSplit = isInternal ? 25 : 20;
  const numModules = isInternal ? 2 : 5;
  const maxL1L2 = isInternal ? 15 : 30; // 30% of total

  // 4. Construct Prompt
  const prompt = `
You are an expert exam paper setter for an engineering college. 
Your task is to generate a highly structured exam paper in JSON format based on the provided Question Bank, Syllabus, and Course Notes.

RULES:
1. The exam type is "${examType}". You must generate exactly ${numModules} modules (named M1, M2...).
2. For each module, you must provide a 'splitA' and a 'splitB' array of questions.
3. The sum of 'marks' in 'splitA' MUST EXACTLY EQUAL ${targetMarksPerSplit}.
4. The sum of 'marks' in 'splitB' MUST EXACTLY EQUAL ${targetMarksPerSplit}.
5. You must select questions from the provided "Question Bank". If the bank lacks sufficient questions for a module, you MUST formulate new realistic exam questions based on the "Syllabus" and "Notes" to reach exactly the required marks.
6. Academic Rigor: The total sum of marks for all questions in the entire paper that have a BTL of "L1" or "L2" MUST NOT exceed ${maxL1L2} marks.
7. BTL must be one of: L1, L2, L3, L4, L5, L6. CO must be one of: CO1, CO2, CO3, CO4, CO5.
8. Output strictly a JSON object matching this schema exactly, with NO markdown code blocks.
9. Also infer metadata for the paper header based on the syllabus or general academic context. Extract the "semester" (e.g., "First", "Second", "Third", etc.), the "examTitle" (e.g., "B.E. Degree Semester End Examination (SEE)"), and the "date" (e.g., "July 2024") into separate fields so they can be edited independently. Use generic placeholder dates if none are found.

CRITICAL INSTRUCTION FOR IMAGES AND FORMATTING:
To prevent loss of images, graphs, and formatting, you MUST return the 'id' of the question from the Question Bank and set 'isNew': false. Do NOT include 'questionText' if 'isNew' is false.
If you are formulating a completely new question, set 'isNew': true, 'id': null, and provide the 'questionText'.

SCHEMA:
{
  "courseTitle": "${courseTitle}",
  "examType": "${examType}",
  "totalMarks": ${isInternal ? 50 : 100},
  "warnings": ["List any rules you had to break, if any"],
  "headerMetadata": {
    "institution": "Visvesvaraya Technological University, Belagavi",
    "examTitle": "B.E. Degree Semester End Examination (SEE)",
    "semester": "First",
    "subjectCode": "23MAT11A",
    "qpCode": "11101",
    "date": "July 2024",
    "duration": "3 Hours",
    "marks": 100
  },
  "modules": [
    {
      "moduleNumber": "M1",
      "splitA": [ 
        { "id": "q_0", "isNew": false, "marks": 10, "btl": "L2", "co": "CO1" },
        { "id": null, "isNew": true, "questionText": "Formulate a new question here", "marks": 10, "btl": "L3", "co": "CO1" }
      ],
      "splitB": [ 
        { "id": "q_5", "isNew": false, "marks": 20, "btl": "L3", "co": "CO2" }
      ]
    }
  ]
}

INPUT DATA:
Question Bank: ${JSON.stringify(allQuestions.map(q => ({ id: q.id, text: q.questionText, marks: q.marks, btl: q.btl, co: q.co, module: q.module })))}
Syllabus: ${JSON.stringify(syllabus)}
Notes: ${JSON.stringify(notes)}
  `;

  // 5. Call Gemini AI with key rotation
  const response = await aiKeyManager.executeWithAI(async (ai) => {
    return await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
  });

  const text = response.text;
  let paper;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      paper = JSON.parse(jsonMatch[0]);
    } else {
      paper = JSON.parse(text);
    }
  } catch (e) {
    throw new Error("AI generated invalid JSON for the paper.");
  }

  paper.generatedAt = new Date().toISOString();
  if (!paper.warnings) paper.warnings = [];

  const reconstructQuestions = (split) => {
    return split.map(q => {
      if (q.isNew === false && q.id) {
        const bankQ = allQuestions.find(bq => bq.id === q.id);
        if (bankQ) {
          return {
            id: q.id,
            isNew: false,
            questionText: bankQ.questionText, // PERFECTLY preserve formatting & images
            marks: q.marks || bankQ.marks,
            btl: q.btl || bankQ.btl,
            co: q.co || bankQ.co
          };
        }
      }
      return {
        id: null,
        isNew: true,
        questionText: q.questionText || "Missing text",
        marks: q.marks || 5,
        btl: q.btl || 'L2',
        co: q.co || 'CO1'
      };
    });
  };

  // 6. Pre-render HTML for frontend and reconstruct formatting
  if (paper.modules) {
    paper.modules.forEach(mod => {
      if (mod.splitA) {
        mod.splitA = reconstructQuestions(mod.splitA);
        mod.splitA.forEach(q => {
          if (q.questionText) q.htmlText = md.render(q.questionText);
        });
      }
      if (mod.splitB) {
        mod.splitB = reconstructQuestions(mod.splitB);
        mod.splitB.forEach(q => {
          if (q.questionText) q.htmlText = md.render(q.questionText);
        });
      }
    });
  }

  return paper;
};

module.exports = {
  generatePaper
};
