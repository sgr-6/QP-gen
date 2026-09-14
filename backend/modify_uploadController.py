import re

with open('src/controllers/uploadController.js', 'r') as f:
    content = f.read()

# Add new imports
if 'generateEmbedding' not in content:
    content = content.replace("const { parseFile } = require('../services/parserService');", 
    "const { parseFile } = require('../services/parserService');\nconst { generateEmbedding } = require('../services/aiService');")

# 1. Upload to Firebase Storage
supabase_upload = """    const { data: uploadData, error: uploadError } = await supabase
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
      .getPublicUrl(fileName);"""

firebase_upload = """    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const fileRef = bucket.file(`${tenantId}/source_files/${fileName}`);
    await fileRef.save(fileBuffer, { contentType: file.mimetype });
    await fileRef.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`;"""

content = content.replace(supabase_upload, firebase_upload)

# 2. Call parseFile with tenantId
content = content.replace("const normalizedQuestions = await parseFile(publicUrl, fileExt);", "const normalizedQuestions = await parseFile(publicUrl, fileExt, tenantId);")

# 3. Handle Duplicate Detection and Embeddings
old_loop = """    // Save questions in a subcollection
    normalizedQuestions.forEach((q, index) => {
      const qRef = bankRef.collection('questions').doc(`q_${index}`);
      batch.set(qRef, { ...q, tenantId });
    });"""

new_loop = """    // Save questions in a subcollection and check duplicates
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
    }"""

content = content.replace(old_loop, new_loop)

with open('src/controllers/uploadController.js', 'w') as f:
    f.write(content)

