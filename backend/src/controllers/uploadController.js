const { db, admin } = require('../config/firebaseAdmin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('../services/parserService');
const { generateEmbedding } = require('../services/aiService');
const supabase = require('../config/supabaseClient');

// Configure Multer for local temporary storage before uploading to Firebase
const upload = multer({ dest: 'uploads/' });

const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const file = req.file;
    const courseTitle = req.body.courseTitle || 'Unknown Course';
    const department = req.body.department || 'Unknown Dept';
    const semester = req.body.semester || 'Unknown Sem';
    const subjectCode = req.body.subjectCode || 'Unknown Code';
    const filePath = path.resolve(file.path);

    // 1. Upload to Supabase 'question-banks' bucket
    const fileExt = path.extname(file.originalname);
    const fileName = `${tenantId}_${Date.now()}_${courseTitle.replace(/\s+/g, '_')}${fileExt}`;
    
    const fileBuffer = fs.readFileSync(filePath);
    
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const fileRef = bucket.file(`${tenantId}/source_files/${fileName}`);
    await fileRef.save(fileBuffer, { contentType: file.mimetype });
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;

    console.log(`Uploaded to Supabase: ${publicUrl}`);

    // 2. Multi-Format Parsing & Normalization Layer (Fetch from Supabase URL)
    console.log(`Parsing file from URL: ${publicUrl}`);
    const normalizedQuestions = await parseFile(publicUrl, fileExt, tenantId);

    // 3. Save the Normalized Questions to Firestore
    const batch = db.batch();
    
    // Save metadata about the bank
    const bankRef = db.collection('question_banks').doc(`${tenantId}_${courseTitle.replace(/\s+/g, '_').toLowerCase()}`);
    batch.set(bankRef, {
      tenantId,
      courseTitle,
      department,
      semester,
      subjectCode,
      sourceFileUrl: publicUrl,
      uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
      totalQuestions: normalizedQuestions.length,
      uploadedBy: req.user.userId || 'anonymous'
    });

    // Save questions in a subcollection and check duplicates
    for (let index = 0; index < normalizedQuestions.length; index++) {
      let q = normalizedQuestions[index];
      const qRef = bankRef.collection('questions').doc(`q_${index}`);
      
      // Generate embedding
      const embedding = await generateEmbedding(q.questionText);
      
      // Check duplicate
      const { data: matchData, error: matchError } = await supabase.rpc('match_questions', {
        query_embedding: embedding,
        match_threshold: 0.90,
        match_count: 1,
        p_tenant_id: tenantId
      });
      
      if (!matchError && matchData && matchData.length > 0) {
        q.isDuplicate = true;
        q.duplicateOf = matchData[0].firestore_id;
      }
      
      batch.set(qRef, { ...q, tenantId });
      
      // Insert into Supabase
      const { error: insertError } = await supabase.from('question_embeddings').insert({
        tenant_id: tenantId,
        firestore_id: qRef.id,
        question_text: q.questionText,
        embedding: embedding
      });
      
      if (insertError) {
        console.error("Error inserting question embedding:", insertError);
      }
    }

    await batch.commit();
    console.log(`Saved ${normalizedQuestions.length} questions to Firestore under ${courseTitle}`);

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
    const tenantId = req.user.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID is required' });
    }

    const banks = [];
    const snapshot = await db.collection('question_banks').where('tenantId', '==', tenantId).get();
    snapshot.forEach(doc => {
      banks.push({ id: doc.id, ...doc.data() });
    });
    
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
