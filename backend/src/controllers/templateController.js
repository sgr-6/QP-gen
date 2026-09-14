const fs = require('fs');
const path = require('path');
const os = require('os');
const { admin, db } = require('../config/firebaseAdmin');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const extractTemplate = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const originalname = req.file.originalname;
    const ext = path.extname(originalname).toLowerCase();
    
    // Upload to Firebase Storage
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const destPath = `${tenantId}/template_samples/${Date.now()}_${originalname}`;
    const fileRef = bucket.file(destPath);
    await fileRef.save(fileBuffer, { contentType: req.file.mimetype });
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;

    let extractedData = {};
    const tempPath = path.join(os.tmpdir(), `temp_template_${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, fileBuffer);

    try {
      const uploadedFile = await ai.files.upload({
        file: tempPath,
        mimeType: req.file.mimetype,
      });

      const prompt = `You are an expert document parser. Analyze this academic question paper template.
Extract the following information and return ONLY a valid JSON object:
- headerLogoUrl: Describe the logo or extract a URL if possible, otherwise leave empty string.
- institutionName: The name of the college or university from the header.
- watermarkText: Any background watermark text (like 'CONFIDENTIAL') or footer text.
- fontFamily: Best guess of the primary font family used (e.g., 'Times New Roman', 'Arial').

Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON object.`;

      const geminiResponse = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
          prompt
        ]
      });

      // Cleanup
      await ai.files.delete({ name: uploadedFile.name });
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

      let resultText = geminiResponse.text.replace(/^```json/im, '').replace(/```$/im, '').trim();
      extractedData = JSON.parse(resultText);
    } catch (aiError) {
      console.error("Gemini template extraction failed:", aiError);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      // Fallback extraction
      extractedData = {
        headerLogoUrl: '',
        institutionName: 'Unknown Institution',
        watermarkText: 'CONFIDENTIAL',
        fontFamily: 'Times New Roman'
      };
    }

    const templateConfig = {
      tenantId,
      isActive: true,
      headerLogoUrl: extractedData.headerLogoUrl || '',
      institutionName: extractedData.institutionName || 'Unknown Institution',
      watermarkText: extractedData.watermarkText || '',
      fontFamily: extractedData.fontFamily || 'Times New Roman',
      sampleFileUrl: publicUrl,
      updatedAt: new Date().toISOString()
    };

    // Save to Firestore (doc id: tenantId)
    await db.collection('templates').doc(tenantId).set(templateConfig);

    return res.status(200).json({
      success: true,
      message: 'Template extracted and saved successfully',
      template: templateConfig
    });

  } catch (error) {
    console.error("extractTemplate error:", error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

module.exports = {
  extractTemplate
};
