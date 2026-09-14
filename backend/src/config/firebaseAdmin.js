const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

let db;
let storage;

const initializeFirebase = () => {
  if (admin.apps.length > 0) {
    db = admin.firestore();
    storage = admin.storage();
    return;
  }

  let serviceAccount;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      serviceAccount = require('../../firebase-service-account.json');
    }
  } catch (err) {
    throw new Error(
      'FATAL: Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT env var or provide firebase-service-account.json. Server cannot start without database access.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  db = admin.firestore();
  storage = admin.storage();
  console.log('✅ Firebase Admin initialized successfully');
};

initializeFirebase();

module.exports = { admin, db, storage };
