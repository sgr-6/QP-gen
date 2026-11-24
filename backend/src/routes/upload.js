const express = require('express');
const router = express.Router();
const { upload, uploadFile, getQuestionBanks, getBankQuestions, updateBankQuestion, approveGeneratedBank, approveAllBankQuestions, deleteQuestionBank } = require('../controllers/uploadController');
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

router.get('/question-banks/:bankId/questions', authenticate, authorize('hod'), getBankQuestions);
router.patch('/question-banks/:bankId/questions/:questionId', authenticate, authorize('hod'), updateBankQuestion);
router.post('/question-banks/:bankId/questions/approve-all', authenticate, authorize('hod'), auditLog('APPROVE', 'question_bank'), approveAllBankQuestions);
router.post('/question-banks/:bankId/generation/:jobId/approve', authenticate, authorize('hod'), approveGeneratedBank);
router.delete('/question-banks/:bankId', authenticate, authorize('hod'), auditLog('DELETE', 'question_bank'), deleteQuestionBank);

module.exports = router;
