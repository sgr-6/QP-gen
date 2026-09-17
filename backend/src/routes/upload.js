const express = require('express');
const router = express.Router();
const { upload, uploadFile, getQuestionBanks } = require('../controllers/uploadController');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

// POST /api/upload
// Uploads a file, saves to Firebase Storage, parses it, normalizes it, and tags with Gemini.
router.post(
  '/upload',
  authenticate,
  authorize('hod'),
  auditLog('UPLOAD', 'question_bank'),
  upload.single('file'),
  uploadFile
);

// GET /api/question-banks
// Gets all uploaded question banks with their metadata
router.get(
  '/question-banks',
  authenticate,
  authorize('hod', 'professor'),
  auditLog('VIEW', 'question_bank'),
  getQuestionBanks
);

module.exports = router;
