const express          = require('express');
const router           = express.Router();
const adminController  = require('../controllers/admin.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.use(protect);
router.use(authorize('admin'));
router.use(checkFirstLogin);

// Dashboard & profile
router.get('/dashboard',   adminController.getDashboardStats);
router.get('/me',          adminController.getMyProfile);            // FIX: admin own profile

// Employee list & detail
router.get('/employees',              adminController.getEmployeeList);
router.get('/employees/:profileId',   adminController.getEmployeeDetail);

// Section verification
router.patch(
  '/employees/:profileId/verify/:section',
  validate(schemas.verification),
  adminController.verifySection
);

// FIX: per-document verification
router.patch(
  '/employees/:profileId/verify-document',
  validate(schemas.documentVerify),
  adminController.verifyDocument
);

// FIX: mark document as viewed
router.patch(
  '/employees/:profileId/view-document/:docType',
  adminController.markDocumentViewed
);

router.patch(
  '/employees/:profileId/fixed-pay',
  validate(schemas.fixedPayUpdate),
  adminController.updateFixedPay
);

// Forward to Super Admin
router.patch('/employees/:profileId/forward', adminController.forwardToSuperAdmin);

module.exports = router;
