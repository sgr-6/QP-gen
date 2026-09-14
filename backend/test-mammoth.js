const mammoth = require('mammoth');
const fs = require('fs');

async function test() {
  const result = await mammoth.extractRawText({ path: '../1780979998033_os.docx' });
  console.log(result.value.substring(0, 1000));
}
test();
