const admin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('../services/parserService');
const supabase = require('../config/supabaseClient');

// Configure Multer for local temporary storage before uploading to Firebase
const upload = multer({ dest: 'uploads/' });

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const courseTitle = req.body.courseTitle || 'Unknown Course';
    const department = req.body.department || 'Unknown Dept';
    const semester = req.body.semester || 'Unknown Sem';
    const subjectCode = req.body.subjectCode || 'Unknown Code';
    const filePath = path.resolve(file.path);

    // 1. Upload to Supabase 'question-banks' bucket
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}_${courseTitle.replace(/\s+/g, '_')}${fileExt}`;
    
    const fileBuffer = fs.readFileSync(filePath);
    
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('question-banks')
      .upload(fileName, fileBuffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Supabase upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase
      .storage
      .from('question-banks')
      .getPublicUrl(fileName);

    console.log(`Uploaded to Supabase: ${publicUrl}`);

    // 2. Multi-Format Parsing & Normalization Layer (Fetch from Supabase URL)
    console.log(`Parsing file from URL: ${publicUrl}`);
    const normalizedQuestions = await parseFile(publicUrl, fileExt);

    // 3. Save the Normalized Questions to Firestore
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      
      const batch = db.batch();
      
      // Save metadata about the bank
      const bankRef = db.collection('question_banks').doc(courseTitle.replace(/\s+/g, '_').toLowerCase());
      batch.set(bankRef, {
        courseTitle,
        department,
        semester,
        subjectCode,
        sourceFileUrl: publicUrl,
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
    } else {
      // In-memory fallback
      global.inMemoryDB = global.inMemoryDB || { banks: {}, metadata: {} };
      global.inMemoryDB.banks[courseTitle.replace(/\s+/g, '_').toLowerCase()] = normalizedQuestions;
      global.inMemoryDB.metadata = global.inMemoryDB.metadata || {};
      global.inMemoryDB.metadata[courseTitle.replace(/\s+/g, '_').toLowerCase()] = {
        courseTitle,
        department,
        semester,
        subjectCode,
        totalQuestions: normalizedQuestions.length,
        sourceFileUrl: publicUrl
      };
      console.log(`Saved ${normalizedQuestions.length} questions to In-Memory DB under ${courseTitle}`);
    }

    // Cleanup local temp file from multer
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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

const getQuestionBanks = async (req, res) => {
  try {
    const banks = [];
    if (admin.apps.length > 0) {
      const db = admin.firestore();
      const snapshot = await db.collection('question_banks').get();
      snapshot.forEach(doc => {
        banks.push({ id: doc.id, ...doc.data() });
      });
    } else {
      if (global.inMemoryDB && global.inMemoryDB.metadata) {
        for (const [key, value] of Object.entries(global.inMemoryDB.metadata)) {
          banks.push({ id: key, ...value });
        }
      }
    }
    res.json(banks);
  } catch (error) {
    console.error("Error fetching question banks:", error);
    res.status(500).json({ error: 'Failed to fetch question banks' });
  }
};

module.exports = {
  upload,
  uploadFile,
  getQuestionBanks
};
