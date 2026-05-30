require('dotenv').config();
const { parseFile } = require('./src/services/parserService');

async function test() {
  try {
    const url = 'https://prjokwmuhfmccfizxxdf.supabase.co/storage/v1/object/public/question-banks/1780131642045_os.docx';
    console.log("Starting parseFile...");
    const qs = await parseFile(url, '.docx');
    console.log("Parsed questions:", qs.length);
    console.log(qs);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
test();
