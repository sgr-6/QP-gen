const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('super_admin'));

router.post('/tenants', superAdminController.createTenant);
router.get('/tenants', superAdminController.listTenants);
router.post('/tenants/:id/admin', superAdminController.createTenantAdmin);

module.exports = router;
