require('dotenv').config();
const admin = require('firebase-admin');
const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

async function check() {
  const snap = await db.collection('question_banks').doc('os').collection('questions').get();
  console.log('Total Qs:', snap.size);
  let i = 0;
  snap.forEach(doc => {
    i++;
    const text = doc.data().questionText;
    if (text) {
      console.log(`Parsing Q${i}... length: ${text.length}`);
      try {
        md.render(text);
      } catch (e) {
        console.error('Error parsing:', e);
      }
    }
  });
  console.log('All parsed successfully without hanging!');
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
