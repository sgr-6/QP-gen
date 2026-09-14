require('dotenv').config();
const admin = require('firebase-admin');

async function test() {
  try {
    const serviceAccount = require('./firebase-service-account.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    const db = admin.firestore();
    const snapshot = await db.collection('question_banks').get();
    
    console.log(`Found ${snapshot.size} question banks.`);
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const qs = await doc.ref.collection('questions').get();
      console.log(`Bank ID: ${doc.id}`);
      console.log(`  Course Title: ${data.courseTitle}`);
      console.log(`  Total listed in doc: ${data.totalQuestions}`);
      console.log(`  Actual questions in subcollection: ${qs.size}`);
    }
  } catch (err) {
    console.error(err);
  }
}
test();
