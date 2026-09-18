const { db, admin } = require('../config/firebaseAdmin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const aiKeyManager = require('../services/aiKeyManager');
const upload = multer({ dest: 'uploads/' });

const uploadNotes = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.user.tenantId || 'default_tenant';
    const file = req.file;
    const { courseTitle, department, semester, subjectCode } = req.body;
    
    if (!courseTitle || !department || !semester || !subjectCode) {
      return res.status(400).json({ error: 'Missing required metadata (courseTitle, department, semester, subjectCode)' });
    }

    const filePath = path.resolve(file.path);
    const fileExt = path.extname(file.originalname);
    const fileName = `${tenantId}_${Date.now()}_notes${fileExt}`;

    const fileBuffer = fs.readFileSync(filePath);

    // Upload to Supabase Storage
    const supabase = require('../config/supabaseClient');
    const { data: bData, error: bError } = await supabase.storage.getBucket('notes');
    if (bError && (bError.message.includes('not found') || bError.message.includes('Bucket not found'))) {
      await supabase.storage.createBucket('notes', { public: true });
    }
    await supabase.storage.from('notes').upload(`${tenantId}/${fileName}`, fileBuffer, {
      contentType: file.mimetype,
      upsert: true
    });

    // Process with Gemini to extract concepts and summary
    const uploadedFile = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.files.upload({
        file: filePath,
        config: { mimeType: file.mimetype === 'application/pdf' ? 'application/pdf' : 'text/plain' },
      });
    });

    const prompt = `Analyze this course material/notes.
Extract the main concepts, topics, and a brief summary.
Return ONLY a valid JSON object matching this exact schema:
{
  "summary": "string",
  "keyTopics": ["topic1", "topic2"]
}
Do not include any code block ticks like \`\`\`json around the output.`;

    const response = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          prompt
        ]
      });
    });

    // Cleanup local temp file and Gemini file
    await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.files.delete({ name: uploadedFile.name });
    });
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    let resultText = response.text.replace(/^```json/im, '').replace(/```$/im, '').trim();
    let notesData = {};
    try {
      notesData = JSON.parse(resultText);
    } catch (e) {
      console.error("Failed to parse Gemini output as JSON", e);
      notesData = { summary: "Failed to extract summary.", keyTopics: [] };
    }

    // Save metadata to Firestore
    const docId = `${tenantId}_${courseTitle.replace(/\s+/g, '_').toLowerCase()}`;
    await db.collection('notes').doc(docId).set({
      tenantId,
      courseTitle,
      department,
      semester,
      subjectCode,
      fileName,
      bucket: 'notes',
      summary: notesData.summary,
      keyTopics: notesData.keyTopics,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.user.email
    });

    res.json({
      message: 'Notes uploaded and processed successfully',
      data: {
        docId,
        summary: notesData.summary,
        keyTopics: notesData.keyTopics
      }
    });
  } catch (error) {
    console.error("Error in uploadNotes:", error);
    res.status(500).json({ error: 'Failed to process notes upload' });
  }
};

module.exports = {
  upload,
  uploadNotes
};
