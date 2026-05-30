require('dotenv').config();
const { db } = require('./src/config/firebase');

async function check() {
  const snap = await db.collection('question_banks').doc('os').collection('questions').get();
  let longest = '';
  snap.forEach(doc => {
    const text = doc.data().questionText;
    if (text && text.length > longest.length) longest = text;
  });
  console.log('Total Qs:', snap.size);
  console.log('Longest text length:', longest.length);
  require('fs').writeFileSync('longest_q.txt', longest);
  console.log('Saved to longest_q.txt');
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
