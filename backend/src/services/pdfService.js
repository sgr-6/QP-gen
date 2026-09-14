const puppeteer = require('puppeteer');
const { db } = require('../config/firebaseAdmin');

const generatePaperHTML = (paper, template, downloaderIdentity = '') => {
  const fontFamily = template?.fontFamily || '"Times New Roman", Times, serif';
  const watermarkText = template?.watermarkText || 'SJBIT CONFIDENTIAL';
  const institutionName = template?.institutionName || 'Unknown Institution';
  const identityTimestamp = new Date().toISOString();
  
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="downloader" content="${downloaderIdentity}" />
    <meta name="download-time" content="${identityTimestamp}" />
    <style>
      body {
        font-family: ${fontFamily};
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
        z-index: -2;
        white-space: nowrap;
        user-select: none;
      }
      .identity-watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(45deg);
        font-size: 30px;
        color: rgba(150, 150, 150, 0.2);
        z-index: -1;
        white-space: nowrap;
        user-select: none;
        pointer-events: none;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
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
        overflow: hidden;
      }
      .q-text table {
        width: 100%;
        table-layout: fixed;
        word-wrap: break-word;
        word-break: break-word;
        font-size: 10pt;
      }
      .q-text th, .q-text td {
        word-break: break-word;
        overflow-wrap: break-word;
      }
      tr {
        page-break-inside: avoid;
      }
      .q-text img {
        max-width: 100%;
        max-height: 400px;
        object-fit: contain;
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
    <div class="watermark">${watermarkText}</div>
    ${downloaderIdentity ? `<div class="identity-watermark">${downloaderIdentity}<br>${identityTimestamp}</div>` : ''}
    <h2 style="text-align:center; text-transform:uppercase;">${institutionName}</h2>
    <h3 style="text-align:center; text-transform:uppercase;">${paper.courseTitle}</h3>
    
    <table>
      <thead>
        <tr>
          <th style="width: 5%">Q No</th>
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

  paper.modules.forEach((mod, idx) => {
    const headerText = paper.examType === 'internal' ? `Part ${idx + 1}` : `Module ${mod.moduleNumber}`;
    // Module Header
    html += `
      <tr>
        <td colspan="6" class="module-header">${headerText}</td>
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
          <td class="q-text">${q.htmlText || q.questionText || ''}</td>
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
          <td class="q-text">${q.htmlText || q.questionText || ''}</td>
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

const generatePDFBuffer = async (paper, tenantId, downloaderIdentity = '') => {
  let template = null;
  if (tenantId) {
    try {
      const templateDoc = await db.collection('templates').doc(tenantId).get();
      if (templateDoc.exists) {
        template = templateDoc.data();
      }
    } catch (error) {
      console.error("Error fetching template:", error.message);
    }
  }

  const html = generatePaperHTML(paper, template, downloaderIdentity);
  
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
      top: '15mm',
      right: '10mm',
      bottom: '15mm',
      left: '10mm'
    },
    printBackground: true
  });
  
  await browser.close();
  return pdfBuffer;
};

module.exports = {
  generatePDFBuffer
};
