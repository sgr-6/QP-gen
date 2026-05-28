const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('../services/parserService');

// Configure Multer for local temporary storage before uploading to Firebase
const upload = multer({ dest: 'uploads/' });

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const courseTitle = req.body.courseTitle || 'Unknown Course';
    const filePath = path.resolve(file.path);

    // 1. We skip Firebase Cloud Storage to avoid Blaze Plan requirements.
    // The file is stored temporarily in `filePath` via Multer.

    // 2. Multi-Format Parsing & Normalization Layer
    // Rename file to have original extension so parsers work correctly
    const tempParsedPath = `${filePath}${path.extname(file.originalname)}`;
    fs.renameSync(filePath, tempParsedPath);

    console.log(`Parsing file: ${tempParsedPath}`);
    const normalizedQuestions = await parseFile(tempParsedPath);

    // 3. Save the Normalized Questions to Firestore
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      
      const batch = db.batch();
      
      // Save metadata about the bank
      const bankRef = db.collection('question_banks').doc(courseTitle.replace(/\s+/g, '_').toLowerCase());
      batch.set(bankRef, {
        courseTitle,
        uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalQuestions: normalizedQuestions.length
      });

      // Save questions in a subcollection
      normalizedQuestions.forEach((q, index) => {
        const qRef = bankRef.collection('questions').doc(`q_${index}`);
        batch.set(qRef, q);
      });

      await batch.commit();
      console.log(`Saved ${normalizedQuestions.length} questions to Firestore under ${courseTitle}`);
    }

    // Cleanup local temp file
    if (fs.existsSync(tempParsedPath)) {
      fs.unlinkSync(tempParsedPath);
    }

    // Return the normalized JSON array
    res.json({
      message: 'File uploaded, parsed, and normalized successfully',
      courseTitle: courseTitle,
      totalQuestions: normalizedQuestions.length,
      questions: normalizedQuestions
    });

  } catch (error) {
    console.error("Error in uploadController:", error);
    res.status(500).json({ error: 'Failed to process file upload' });
  }
};

module.exports = {
  upload,
  uploadFile
};
