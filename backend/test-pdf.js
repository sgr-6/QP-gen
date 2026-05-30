const { generatePDFBuffer } = require('./src/services/pdfService');
const fs = require('fs');

const fakePaper = {
  courseTitle: 'OS Paper',
  modules: [
    {
      moduleNumber: 1,
      splitA: [
        {
          questionText: "Consider the following table:\n\n| Process | Arrival Time | Burst Time |\n|---------|--------------|------------|\n| P1 | 0 | 5 |\n| P2 | 1 | 3 |\n| P3 | 2 | 8 |",
          marks: 10,
          co: 'CO1',
          btl: 'L2'
        }
      ],
      splitB: []
    }
  ]
};

async function test() {
  const buf = await generatePDFBuffer(fakePaper);
  fs.writeFileSync('test.pdf', buf);
  console.log('PDF generated as test.pdf');
}
test().catch(console.error);
