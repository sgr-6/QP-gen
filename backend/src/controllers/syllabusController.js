const { db, admin } = require('../config/firebaseAdmin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const upload = multer({ dest: 'uploads/' });

const uploadSyllabus = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const file = req.file;
    const courseTitle = req.body.courseTitle || 'Unknown_Course';
    const filePath = path.resolve(file.path);
    const fileExt = path.extname(file.originalname);
    const fileName = `${tenantId}_${Date.now()}_syllabus${fileExt}`;

    const fileBuffer = fs.readFileSync(filePath);

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const fileRef = bucket.file(`${tenantId}/syllabi/${fileName}`);
    await fileRef.save(fileBuffer, { contentType: file.mimetype });
    await fileRef.makePublic();

    // Use Gemini to parse syllabus using File API
    const uploadedFile = await ai.files.upload({
      file: filePath,
      mimeType: file.mimetype === 'application/pdf' ? 'application/pdf' : 'text/plain',
    });

    const prompt = `Extract the syllabus structure into JSON format. 
Return ONLY a valid JSON object matching this exact schema:
{
  "courseTitle": "string",
  "modules": [
    {
      "moduleNumber": "string (e.g., M1)",
      "topics": ["topic1", "topic2"]
    }
  ]
}
Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON string.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
        prompt
      ]
    });

    // Cleanup local temp file and Gemini file
    await ai.files.delete({ name: uploadedFile.name });
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    let resultText = response.text.replace(/^```json/im, '').replace(/```$/im, '').trim();
    const syllabusJson = JSON.parse(resultText);
    syllabusJson.tenantId = tenantId;
    
    // Save to Firestore
    const docId = `${tenantId}_${courseTitle.replace(/\s+/g, '_').toLowerCase()}`;
    await db.collection('syllabi').doc(docId).set(syllabusJson);

    res.json({
      message: 'Syllabus uploaded and parsed successfully',
      data: syllabusJson
    });
  } catch (error) {
    console.error("Error in uploadSyllabus:", error);
    res.status(500).json({ error: 'Failed to process syllabus upload' });
  }
};

module.exports = {
  upload,
  uploadSyllabus
};
