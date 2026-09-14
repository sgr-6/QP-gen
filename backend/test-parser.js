require('dotenv').config();
const { parseFile } = require('./src/services/parserService');

async function test() {
  try {
    const axios = require('axios');
    const fs = require('fs');
    const origGet = axios.get;
    axios.get = async (url, config) => {
      if (url === 'test-url') {
        const data = fs.readFileSync('../1780979998033_os.docx');
        return { data: data };
      }
      return origGet(url, config);
    };

    console.log('Parsing OS DOCX...');
    const results = await parseFile('test-url', '.docx');
    console.log('Found questions:', results.length);
    if (results.length < 5) {
      console.log('Results:', JSON.stringify(results, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}
test();
