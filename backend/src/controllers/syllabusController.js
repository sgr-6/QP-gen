const { db, admin } = require('../config/firebaseAdmin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const aiKeyManager = require('../services/aiKeyManager');
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

    // Upload to Supabase Storage
    const supabase = require('../config/supabaseClient');
    const { data: bData, error: bError } = await supabase.storage.getBucket('syllabi');
    if (bError && (bError.message.includes('not found') || bError.message.includes('Bucket not found'))) {
      await supabase.storage.createBucket('syllabi', { public: true });
    }
    await supabase.storage.from('syllabi').upload(`${tenantId}/${fileName}`, fileBuffer, {
      contentType: file.mimetype,
      upsert: true
    });

    // Use Gemini to parse syllabus using File API
    const uploadedFile = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.files.upload({
        file: filePath,
        config: { mimeType: file.mimetype === 'application/pdf' ? 'application/pdf' : 'text/plain' },
      });
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

    const response = await aiKeyManager.executeWithAI(async (ai) => {
      return await ai.models.generateContent({
        model: 'gemini-3.6-flash',
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
