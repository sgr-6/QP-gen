const express = require('express');
const { upload, uploadNotes } = require('../controllers/notesController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/upload', authenticate, authorize('hod'), upload.single('file'), uploadNotes);

module.exports = router;
