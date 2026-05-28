const { generatePaper } = require('../services/paperGeneratorService');
const { generatePDFBuffer } = require('../services/pdfService');

const generateDraft = async (req, res) => {
  try {
    const { courseTitle } = req.body;
    if (!courseTitle) {
      return res.status(400).json({ error: 'Course Title is required' });
    }

    const paper = await generatePaper(courseTitle);
    
    // Save draft to DB for HOD approval (Implementation omitted for brevity)
    
    res.json({
      message: 'Draft generated successfully!',
      paper: paper
    });

  } catch (error) {
    console.error("Draft Generation Error:", error.message);
    res.status(400).json({ error: error.message });
  }
};

const downloadPdf = async (req, res) => {
  try {
    const { courseTitle } = req.body;
    if (!courseTitle) {
      return res.status(400).json({ error: 'Course Title is required' });
    }

    // 1. Generate the paper logic
    const paper = await generatePaper(courseTitle);
    
    // 2. Generate PDF Buffer
    const pdfBuffer = await generatePDFBuffer(paper);
    
    // 3. Send back as a file download
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${courseTitle.replace(/\s+/g, '_')}_Paper.pdf"`
    });
    
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error("PDF Generation Error:", error.message);
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  generateDraft,
  downloadPdf
};
