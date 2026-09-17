const fs = require('fs');
const path = require('path');
const os = require('os');
const { admin, db } = require('../config/firebaseAdmin');
const aiKeyManager = require('../services/aiKeyManager');

const extractTemplate = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const fileBuffer = req.file.buffer;
    const originalname = req.file.originalname;
    const ext = path.extname(originalname).toLowerCase();
    
    // Upload to Supabase Storage
    const supabase = require('../config/supabaseClient');
    const destPath = `${tenantId}/template_samples/${Date.now()}_${originalname}`;
    const { data: bData, error: bError } = await supabase.storage.getBucket('templates');
    if (bError && (bError.message.includes('not found') || bError.message.includes('Bucket not found'))) {
      await supabase.storage.createBucket('templates', { public: true });
    }
    await supabase.storage.from('templates').upload(destPath, fileBuffer, {
      contentType: req.file.mimetype,
      upsert: true
    });
    const { data: publicUrlData } = supabase.storage.from('templates').getPublicUrl(destPath);
    const publicUrl = publicUrlData.publicUrl;

    let extractedData = {};
    const tempPath = path.join(os.tmpdir(), `temp_template_${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, fileBuffer);

    try {
      const uploadedFile = await aiKeyManager.executeWithAI(async (ai) => {
        return await ai.files.upload({
          file: tempPath,
          config: { mimeType: req.file.mimetype || 'application/pdf' },
        });
      });

      const prompt = `You are an expert document parser. Analyze this academic question paper template.
Extract the following information and return ONLY a valid JSON object:
- headerLogoUrl: Describe the logo or extract a URL if possible, otherwise leave empty string.
- institutionName: The name of the college or university from the header.
- subtitle: Any subtext under the institution (e.g. "(An Autonomous institute under...)")
- defaultInstructions: Extract the array of general instructions given to the students.
- watermarkText: Any background watermark text (like 'CONFIDENTIAL') or footer text.
- fontFamily: Best guess of the primary font family used (e.g., 'Times New Roman', 'Arial').

Do not include any code block ticks like \`\`\`json around the output, just output the raw JSON object.`;

      const geminiResponse = await aiKeyManager.executeWithAI(async (ai) => {
        return await ai.models.generateContent({
          model: 'gemini-2.5-flash-lite',
          contents: [
            { fileData: { fileUri: uploadedFile.uri, mimeType: uploadedFile.mimeType } },
            prompt
          ]
        });
      });

      // Cleanup
      await aiKeyManager.executeWithAI(async (ai) => {
        return await ai.files.delete({ name: uploadedFile.name });
      });
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
        subtitle: '',
        defaultInstructions: [],
        watermarkText: 'CONFIDENTIAL',
        fontFamily: 'Times New Roman'
      };
    }

    const templateConfig = {
      tenantId,
      isActive: true,
      headerLogoUrl: extractedData.headerLogoUrl || '',
      institutionName: extractedData.institutionName || 'Unknown Institution',
      subtitle: extractedData.subtitle || '',
      defaultInstructions: extractedData.defaultInstructions || [],
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
