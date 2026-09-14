const express = require('express');
const { upload, uploadSyllabus } = require('../controllers/syllabusController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/upload', authenticate, authorize('professor', 'hod', 'tenant_admin'), upload.single('file'), uploadSyllabus);

module.exports = router;
