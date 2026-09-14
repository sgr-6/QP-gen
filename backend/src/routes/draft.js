const express = require('express');
const router = express.Router();
const multer = require('multer');
const { 
  generateDraft, downloadPdf, saveFinalPaper, downloadDraft,
  saveDraft, listDrafts, updateDraftStatus, addComment, releaseDraft, verifyPaper
} = require('../controllers/draftController');
const { authenticate, authorize } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { downloadLimiter } = require('../middleware/rateLimiter');

const upload = multer({ dest: 'uploads/' });

// POST /api/draft/generate-draft
router.post(
  '/generate-draft',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams'),
  auditLog('GENERATE_DRAFT', 'draft_paper'),
  generateDraft
);

// POST /api/draft/save
router.post(
  '/save',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams'),
  auditLog('SAVE_DRAFT', 'draft_paper'),
  saveDraft
);

// GET /api/draft/list
router.get(
  '/list',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams', 'early_access'),
  listDrafts
);

// PUT /api/draft/:id/status
router.put(
  '/:id/status',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams'),
  auditLog('UPDATE_DRAFT_STATUS', 'draft_paper'),
  updateDraftStatus
);

// POST /api/draft/:id/comment
router.post(
  '/:id/comment',
  authenticate,
  authorize('hod', 'controller_of_exams'),
  auditLog('ADD_COMMENT', 'draft_paper'),
  addComment
);

// POST /api/draft/:id/release
router.post(
  '/:id/release',
  authenticate,
  authorize('controller_of_exams'),
  auditLog('RELEASE_DRAFT', 'draft_paper'),
  releaseDraft
);

// GET /api/draft/verify/:hash (Public Route)
router.get(
  '/verify/:hash',
  verifyPaper
);

// GET /api/draft/:id/download
router.get(
  '/:id/download',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams', 'early_access', 'super_admin'),
  downloadLimiter,
  auditLog('DOWNLOAD_DRAFT', 'draft_paper'),
  downloadDraft
);

// POST /api/draft/download-pdf
router.post(
  '/download-pdf',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams'),
  auditLog('DOWNLOAD', 'draft_paper'),
  downloadPdf
);

// POST /api/draft/save-final-paper
router.post(
  '/save-final-paper',
  authenticate,
  authorize('controller_of_exams'),
  auditLog('FINALIZE', 'final_paper'),
  saveFinalPaper
);

// POST /api/draft/download-draft (legacy POST)
router.post(
  '/download-draft',
  authenticate,
  authorize('professor', 'hod', 'controller_of_exams'),
  auditLog('DOWNLOAD', 'draft_paper'),
  downloadDraft
);

module.exports = router;
