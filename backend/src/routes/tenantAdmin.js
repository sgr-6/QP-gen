const express = require('express');
const router = express.Router();
const tenantAdminController = require('../controllers/tenantAdminController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('tenant_admin'));

router.get('/users', tenantAdminController.listUsers);
router.post('/users', tenantAdminController.createUser);
router.put('/users/:id', tenantAdminController.updateUser);
router.put('/settings', tenantAdminController.updateSettings);

module.exports = router;
