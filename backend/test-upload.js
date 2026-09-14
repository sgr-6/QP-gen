const fs = require('fs');
const path = require('path');
const { admin } = require('./src/config/firebaseAdmin');

async function testStorage() {
  try {
    const bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const fileRef = bucket.file(`TEST/test-upload.txt`);
    console.log("Saving...");
    await fileRef.save("hello world", { contentType: 'text/plain' });
    console.log("Making public...");
    await fileRef.makePublic();
    console.log("Success! URL:", `https://storage.googleapis.com/${bucket.name}/${fileRef.name}`);
  } catch (err) {
    console.error("Storage Error:", err.message);
  }
}
testStorage();
