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
        font-size: 11pt;
        margin: 0;
        padding: 0;
        position: relative;
        line-height: 1.3;
      }
      .watermark {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 80px;
        color: rgba(200, 200, 200, 0.2);
        z-index: -2;
        white-space: nowrap;
        user-select: none;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .q-text table {
        width: 100% !important;
        max-width: 100%;
        table-layout: auto;
        word-wrap: break-word;
        word-break: break-word;
      }
      th, td {
        border: 1px solid black;
        padding: 5px;
        text-align: center;
        vertical-align: middle;
      }
      .q-text {
        text-align: left;
        padding: 5px 10px;
      }
      tr {
        page-break-inside: avoid;
      }
      .q-text img {
        max-width: 100%;
        max-height: 250px;
        object-fit: contain;
        display: block;
        margin: 10px auto;
      }
    </style>
  </head>
  <body>
    <div class="watermark">${watermarkText}</div>
    
    <table style="margin-bottom: 0; border-bottom: none;">
      <tr>
        <td style="padding: 0; border-bottom: 1px solid black;">
          <div style="display: flex; justify-content: space-between; align-items: stretch;">
            <div style="display: flex; align-items: stretch;">
              <div style="font-weight: bold; padding: 5px 10px; border-right: 1px solid black; display: flex; align-items: center;">USN</div>
              ${Array(10).fill('<div style="width: 25px; border-right: 1px solid black;"></div>').join('')}
            </div>
            <div style="font-weight: bold; font-size: 14pt; padding: 5px 10px; display: flex; align-items: center;">
              ${paper.headerMetadata?.subjectCode || 'XX00XX'}
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold; font-size: 12pt; padding: 5px;">
          ${paper.headerMetadata?.institution || 'Unknown Institution'}<br/>
          ${paper.headerMetadata?.semester ? `${paper.headerMetadata.semester} Semester ` : ''}${paper.headerMetadata?.examTitle || 'Semester End Examination'}${paper.headerMetadata?.date ? `, ${paper.headerMetadata.date}` : ''}
        </td>
      </tr>
      <tr>
        <td style="text-align: center; font-weight: bold; font-size: 14pt; padding: 5px;">
          ${paper.courseTitle || 'COURSE TITLE'}
        </td>
      </tr>
      <tr>
        <td style="text-align: center; padding: 2px;">
          (${paper.headerMetadata?.subtitle || 'Model Question Paper'})
        </td>
      </tr>
      <tr>
        <td style="padding: 0;">
          <div style="display: flex; justify-content: space-between; padding: 5px 10px;">
            <div style="font-weight: bold;">[Time: ${paper.headerMetadata?.duration || '3 Hours'}]</div>
            <div style="font-weight: bold;">[Maximum Marks: ${paper.headerMetadata?.marks || paper.totalMarks || 100}]</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding: 5px 10px; text-align: left;">
          <div style="text-align: center; font-weight: bold; text-decoration: underline; margin-bottom: 5px;">Instructions to students:</div>
          ${(template?.defaultInstructions && template.defaultInstructions.length > 0 ? template.defaultInstructions : paper.headerMetadata?.instructions || [
            'Answer FIVE FULL Questions as per choice.',
            'Use BLACK ball point pen for text, figure, table, etc.',
            'Assume missing data, if any.'
          ]).map((inst, i) => {
            const romans = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
            return `
            <div style="display: flex; margin-bottom: 2px;">
              <div style="width: 25px; font-weight: bold;">${romans[i] || (i + 1)}.</div>
              <div>${inst}</div>
            </div>
          `}).join('')}
        </td>
      </tr>
    </table>
    
    <table style="border-top: none; table-layout: fixed;">
      <colgroup>
        <col style="width: 5%" />
        <col style="width: 5%" />
        <col style="width: 60%" />
        <col style="width: 10%" />
        <col style="width: 10%" />
        <col style="width: 10%" />
      </colgroup>
      <tbody>
  `;

  let qNumber = 1;

  paper.modules.forEach((mod, idx) => {
    const headerText = paper.examType === 'internal' ? `Part ${idx + 1}` : `Module ${mod.moduleNumber}`;
    // Module Header
    html += `
      <tr>
        <td colspan="3" style="text-align: center; font-weight: bold;">${headerText}</td>
        <td style="font-weight: bold; text-align: center;">Marks</td>
        <td style="font-weight: bold; text-align: center;">CO</td>
        <td style="font-weight: bold; text-align: center;">RBT Level</td>
      </tr>
    `;

    // Split A (First OR Choice)
    const splitA = mod.splitA;
    splitA.forEach((q, i) => {
      const subLetter = String.fromCharCode(97 + i); // a, b, c...
      html += `
        <tr>
          <td style="font-weight: bold;">${i === 0 ? qNumber + '.' : ''}</td>
          <td style="font-weight: bold;">${subLetter})</td>
          <td class="q-text">${q.htmlText || q.questionText || ''}</td>
          <td style="font-weight: bold;">${String(q.marks).padStart(2, '0')}</td>
          <td style="font-weight: bold;">${q.co || '-'}</td>
          <td style="font-weight: bold;">${q.btl || '-'}</td>
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
          <td style="font-weight: bold;">${i === 0 ? qNumber + '.' : ''}</td>
          <td style="font-weight: bold;">${subLetter})</td>
          <td class="q-text">${q.htmlText || q.questionText || ''}</td>
          <td style="font-weight: bold;">${String(q.marks).padStart(2, '0')}</td>
          <td style="font-weight: bold;">${q.co || '-'}</td>
          <td style="font-weight: bold;">${q.btl || '-'}</td>
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

const generateSJBHTML = (paper, template, downloaderIdentity = '') => {
  const fontFamily = template?.fontFamily || '"Times New Roman", Times, serif';
  
  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        font-family: ${fontFamily};
        font-size: 11pt;
        margin: 0;
        padding: 0;
        position: relative;
        line-height: 1.3;
      }
      .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 10px;
      }
      .header-table td {
        border: none;
        padding: 2px;
      }
      .content-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .content-table th, .content-table td {
        border: 1px solid black;
        padding: 5px;
        text-align: center;
        vertical-align: middle;
      }
      .q-text {
        text-align: left !important;
        padding: 5px 10px;
      }
      .q-text img {
        max-width: 100%;
        max-height: 250px;
        object-fit: contain;
        display: block;
        margin: 10px auto;
      }
      .usn-box {
        display: inline-block;
        width: 20px;
        height: 25px;
        border: 1px solid black;
        margin-left: 2px;
      }
      .usn-container {
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }
    </style>
  </head>
  <body>
    <table class="header-table">
      <tr>
        <td style="width: 25%; text-align: left; vertical-align: top;">
           <img src="https://barcode.tec-it.com/barcode.ashx?data=${paper.headerMetadata?.subjectCode || 'XX00XX'}&code=Code128&dpi=96" alt="Barcode" style="height: 40px;"/>
        </td>
        <td style="width: 50%; text-align: center;">
          <div style="font-weight: bold; font-size: 14pt;">SJB Institute of Technology</div>
          <div style="font-size: 10pt;">(An Autonomous institute under VTU, Belagavi, Karnataka, India)</div>
        </td>
        <td style="width: 25%; text-align: right; vertical-align: top;">
          <div class="usn-container">
            <span style="font-weight: bold; margin-right: 5px;">USN</span>
            ${Array(10).fill('<div class="usn-box"></div>').join('')}
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="3" style="text-align: center; font-weight: bold; font-size: 12pt; padding-top: 10px;">
          ${paper.headerMetadata?.semester ? `${paper.headerMetadata.semester} Semester ` : ''}${paper.headerMetadata?.examTitle || 'Semester End Examination'}${paper.headerMetadata?.date ? `, ${paper.headerMetadata.date}` : ''}
        </td>
      </tr>
      <tr>
        <td colspan="3" style="text-align: center; font-weight: bold; font-size: 14pt; padding: 5px;">
          ${paper.courseTitle || 'COURSE TITLE'}
        </td>
      </tr>
      <tr>
        <td colspan="3">
          <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px;">
            <div>Time: ${paper.headerMetadata?.duration || '3 Hours'}</div>
            <div>QP Code: ${paper.headerMetadata?.qpCode || '______'}</div>
            <div>Max Marks: ${paper.headerMetadata?.marks || paper.totalMarks || 100}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td colspan="3" style="padding-top: 10px;">
          <div style="font-weight: bold; text-decoration: underline; margin-bottom: 5px;">Instructions to students:</div>
          <ol style="margin-top: 0; padding-left: 20px;">
            ${(template?.defaultInstructions && template.defaultInstructions.length > 0 ? template.defaultInstructions : paper.headerMetadata?.instructions || [
              'Answer FIVE FULL Questions, choosing ONE full question from each module.',
              'Use BLACK ball point pen for text, figure, table, etc.',
              'Assume missing data, if any.'
            ]).map(inst => `<li>${inst}</li>`).join('')}
          </ol>
        </td>
      </tr>
    </table>
    
    <table class="content-table">
      <colgroup>
        <col style="width: 6%" />
        <col style="width: 4%" />
        <col style="width: 60%" />
        <col style="width: 10%" />
        <col style="width: 10%" />
        <col style="width: 10%" />
      </colgroup>
      <thead>
        <tr>
          <th colspan="3">Questions</th>
          <th>Marks</th>
          <th>CO</th>
          <th>RBT Level</th>
        </tr>
      </thead>
      <tbody>
  `;

  let qNumber = 1;

  if (paper.modules) {
    paper.modules.forEach((mod, idx) => {
      const headerText = paper.examType === 'internal' ? `Part ${idx + 1}` : `Module-${String(mod.moduleNumber).replace('M', '')}`;
      html += `
        <tr>
          <td colspan="6" style="text-align: center; font-weight: bold; background-color: #f2f2f2;">${headerText}</td>
        </tr>
      `;

      // Split A
      const splitA = mod.splitA || [];
      splitA.forEach((q, i) => {
        const subLetter = String.fromCharCode(97 + i); // a, b, c...
        html += `
          <tr>
            <td style="font-weight: bold;">${i === 0 ? 'Q' + qNumber + '.' : ''}</td>
            <td style="font-weight: bold;">${subLetter})</td>
            <td class="q-text">${q.htmlText || q.questionText || ''}</td>
            <td>${q.marks}</td>
            <td>${q.co || '-'}</td>
            <td>${q.btl || '-'}</td>
          </tr>
        `;
      });

      html += `
        <tr>
          <td colspan="6" style="text-align: center; font-weight: bold;">OR</td>
        </tr>
      `;

      qNumber++;

      // Split B
      const splitB = mod.splitB || [];
      splitB.forEach((q, i) => {
        const subLetter = String.fromCharCode(97 + i);
        html += `
          <tr>
            <td style="font-weight: bold;">${i === 0 ? 'Q' + qNumber + '.' : ''}</td>
            <td style="font-weight: bold;">${subLetter})</td>
            <td class="q-text">${q.htmlText || q.questionText || ''}</td>
            <td>${q.marks}</td>
            <td>${q.co || '-'}</td>
            <td>${q.btl || '-'}</td>
          </tr>
        `;
      });

      qNumber++;
    });
  }

  html += `
      </tbody>
    </table>
    <p style="text-align:center; margin-top: 20px; font-weight: bold;">*** END OF PAPER ***</p>
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

  let html;
  if (paper.formatSelection === 'sjb') {
    html = generateSJBHTML(paper, template, downloaderIdentity);
  } else {
    html = generatePaperHTML(paper, template, downloaderIdentity);
  }
  
  const launchOptions = {
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  };
  
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  
  const browser = await puppeteer.launch(launchOptions);
  
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 15000 });
  } catch (e) {
    console.warn("PDF setContent timed out (likely due to slow external images). Generating PDF with loaded content.");
  }
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="font-size: 9px; width: 100%; text-align: center; margin-bottom: 5px;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>
    `,
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
