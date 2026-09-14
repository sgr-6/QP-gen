const express = require('express');
const router = express.Router();
const { listReleasedPapers, logPrintJob } = require('../controllers/printAdminController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/papers', authenticate, authorize('print_admin'), listReleasedPapers);
router.post('/papers/:id/print', authenticate, authorize('print_admin'), logPrintJob);

module.exports = router;
