const { generatePaper } = require('./src/services/paperGeneratorService');
async function test() {
  try {
    const paper = await generatePaper("1", "semester", null, "2e8e0231-9c51-4c79-924f-ce2a897dcbbe");
    console.log(JSON.stringify(paper, null, 2));
  } catch (err) {
    console.error(err);
  }
}
test();
