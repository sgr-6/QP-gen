const axios = require('axios');
const fs = require('fs');

async function test() {
  try {
    console.log("Fetching draft paper...");
    const res = await axios.post('https://sjb-qpgen-backend.onrender.com/api/generate-draft', {
      courseTitle: 'os'
    });
    fs.writeFileSync('draft_response.json', JSON.stringify(res.data, null, 2));
    console.log("Saved draft_response.json, size:", JSON.stringify(res.data).length);
  } catch (e) {
    console.error(e.message);
  }
}
test();
