const puppeteer = require('puppeteer');
const { marked } = require('marked');

const generatePaperHTML = (paper) => {
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        font-family: "Times New Roman", Times, serif;
        font-size: 12pt;
        margin: 20px;
        position: relative;
      }
      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 80px;
        color: rgba(200, 200, 200, 0.3);
        z-index: -1;
        white-space: nowrap;
        user-select: none;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
        table-layout: fixed;
        word-wrap: break-word;
      }
      th, td {
        border: 1px solid black;
        padding: 8px;
        text-align: center;
        vertical-align: middle;
      }
      .q-text {
        text-align: left;
        max-width: 0; /* Magic trick: max-width: 0 on table cell forces it to respect width percentage */
        overflow: hidden;
      }
      .q-text table {
        width: 100%;
        table-layout: fixed;
        word-wrap: break-word;
        font-size: 10pt;
      }
      .q-text img {
        max-width: 100%;
      }
      .module-header {
        font-weight: bold;
        text-align: center;
        background-color: #f2f2f2;
      }
      .or-row {
        font-weight: bold;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="watermark">CONFIDENTIAL - SEE 2026</div>
    <h2 style="text-align:center; text-transform:uppercase;">${paper.courseTitle}</h2>
    
    <table>
      <thead>
        <tr>
          <th style="width: 5%">Q#</th>
          <th style="width: 5%">Sub</th>
          <th style="width: 60%">Question Text</th>
          <th style="width: 10%">Marks</th>
          <th style="width: 10%">CO</th>
          <th style="width: 10%">RBT Level</th>
        </tr>
      </thead>
      <tbody>
  `;

  let qNumber = 1;

  paper.modules.forEach((mod) => {
    // Module Header
    html += `
      <tr>
        <td colspan="6" class="module-header">Module ${mod.moduleNumber}</td>
      </tr>
    `;

    // Split A (First OR Choice)
    const splitA = mod.splitA;
    splitA.forEach((q, i) => {
      const subLetter = String.fromCharCode(97 + i); // a, b, c...
      html += `
        <tr>
          <td>${i === 0 ? qNumber : ''}</td>
          <td>${subLetter})</td>
          <td class="q-text">${marked.parse(q.questionText || '')}</td>
          <td>[${String(q.marks).padStart(2, '0')} Marks]</td>
          <td>${q.co || '-'}</td>
          <td>${q.btl || '-'}</td>
        </tr>
      `;
    });

    // OR Separator
    html += `
      <tr>
        <td colspan="6" class="or-row">OR</td>
      </tr>
    `;

    qNumber++;

    // Split B (Second OR Choice)
    const splitB = mod.splitB;
    splitB.forEach((q, i) => {
      const subLetter = String.fromCharCode(97 + i); // a, b, c...
      html += `
        <tr>
          <td>${i === 0 ? qNumber : ''}</td>
          <td>${subLetter})</td>
          <td class="q-text">${marked.parse(q.questionText || '')}</td>
          <td>[${String(q.marks).padStart(2, '0')} Marks]</td>
          <td>${q.co || '-'}</td>
          <td>${q.btl || '-'}</td>
        </tr>
      `;
    });

    qNumber++;
  });

  html += `
      </tbody>
    </table>
    <p style="text-align:center; margin-top: 20px;">*********</p>
  </body>
  </html>
  `;

  return html;
};

const generatePDFBuffer = async (paper) => {
  const html = generatePaperHTML(paper);
  
  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    margin: {
      top: '20mm',
      right: '20mm',
      bottom: '20mm',
      left: '20mm'
    },
    printBackground: true
  });
  
  await browser.close();
  return pdfBuffer;
};

module.exports = {
  generatePDFBuffer
};
