const express = require('express');
const router = express.Router();
const { upload, uploadFile, getQuestionBanks } = require('../controllers/uploadController');

// POST /api/upload
// Uploads a file, saves to Firebase Storage, parses it, normalizes it, and tags with Gemini.
router.post('/upload', upload.single('file'), uploadFile);

// GET /api/question-banks
// Gets all uploaded question banks with their metadata
router.get('/question-banks', getQuestionBanks);

module.exports = router;
