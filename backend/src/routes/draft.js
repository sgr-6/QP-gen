const express = require('express');
const router = express.Router();
const { generateDraft, downloadPdf } = require('../controllers/draftController');

// POST /api/generate-draft
router.post('/generate-draft', generateDraft);

// POST /api/download-pdf
router.post('/download-pdf', downloadPdf);

module.exports = router;
