const express               = require('express');
const router                = express.Router();
const superAdminController  = require('../controllers/superAdmin.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.use(protect);
router.use(authorize('super_admin'));
router.use(checkFirstLogin);

// Dashboard & analytics
router.get('/dashboard', superAdminController.getDashboardStats);

// Pending final approvals
router.get('/pending',   superAdminController.getPendingApprovals);

// All employees — FIX: was broken, now fixed
router.get('/employees',              superAdminController.getAllEmployees);
router.get('/employees/:profileId',   superAdminController.getEmployeeDetail);
router.patch(
  '/employees/:profileId/review',
  validate(schemas.superAdminReview),
  superAdminController.finalReview
);

// Admin management — FIX: role selection now works
router.get('/admins',                  superAdminController.getAdminList);
router.post('/admins',                 validate(schemas.createUser), superAdminController.createAdmin);
router.patch('/admins/:adminId/status',superAdminController.updateAdminStatus);

module.exports = router;
