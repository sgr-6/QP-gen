const express = require('express');
const router = express.Router();
const multer = require('multer');
const { generateDraft, downloadPdf, saveFinalPaper, downloadDraft } = require('../controllers/draftController');

const upload = multer({ dest: 'uploads/' });

// POST /api/generate-draft
router.post('/generate-draft', generateDraft);

// POST /api/download-pdf
router.post('/download-pdf', downloadPdf);

// POST /api/save-final-paper
router.post('/save-final-paper', saveFinalPaper);

// POST /api/download-draft
router.post('/download-draft', downloadDraft);

module.exports = router;
