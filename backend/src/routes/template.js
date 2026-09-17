const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractTemplate } = require('../controllers/templateController');
const { authenticate, authorize } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

router.post(
  '/extract',
  authenticate,
  authorize('hod'),
  upload.single('file'),
  extractTemplate
);

module.exports = router;
