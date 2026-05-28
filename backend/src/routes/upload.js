const express = require('express');
const router = express.Router();
const { upload, uploadFile } = require('../controllers/uploadController');

// POST /api/upload
// Uploads a file, saves to Firebase Storage, parses it, normalizes it, and tags with Gemini.
router.post('/upload', upload.single('file'), uploadFile);

module.exports = router;
