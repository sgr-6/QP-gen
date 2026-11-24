const express = require('express');
const { upload, uploadSyllabus, getGeneration, resumeGeneration, abandonGeneration } = require('../controllers/syllabusController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/upload', authenticate, authorize('hod'), upload.single('file'), uploadSyllabus);
router.get('/generation/:bankId/:jobId', authenticate, authorize('hod'), getGeneration);
router.post('/generation/:bankId/:jobId/resume', authenticate, authorize('hod'), resumeGeneration);
router.post('/generation/:bankId/:jobId/abandon', authenticate, authorize('hod'), abandonGeneration);

module.exports = router;
