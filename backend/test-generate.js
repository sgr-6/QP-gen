require('dotenv').config();
const admin = require('firebase-admin');
const { generatePaper } = require('./src/services/paperGeneratorService');

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

async function check() {
  await generatePaper("OS");
  console.log('done');
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
