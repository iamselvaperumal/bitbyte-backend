const express            = require('express');
const router             = express.Router();
const employeeController = require('../controllers/employee.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');
const { ensureCloudinaryConfigured, upload } = require('../config/cloudinary');
const AppError = require('../utils/AppError');

const documentUpload = upload.fields([
  { name: 'aadhaar',  maxCount: 1 },
  { name: 'pan',      maxCount: 1 },
  { name: 'passbook', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
]);

const handleDocumentUpload = (req, res, next) => {
  documentUpload(req, res, (err) => {
    if (!err) return next();

    const message = err.message?.includes('Invalid cloud_name')
      ? 'Cloudinary rejected the configured cloud name. Check CLOUDINARY_CLOUD_NAME in backend/.env against your Cloudinary dashboard.'
      : err.message || 'Document upload failed.';

    return next(new AppError(message, 500));
  });
};

router.use(protect);
router.use(authorize('employee'));
router.use(checkFirstLogin);

// Profile & status
router.get('/profile',           employeeController.getProfile);
router.get('/status',            employeeController.getOnboardingStatus);   // FIX: new
router.get('/audit-trail',       employeeController.getAuditTrail);

// FIX: Draft endpoints — no validation enforcement
router.post('/draft/:section',   employeeController.saveDraft);
router.get('/draft',             employeeController.getDraft);

// Section saves — full validation
router.put('/personal',  validate(schemas.personalDetails),  employeeController.savePersonalDetails);
router.put('/education', validate(schemas.educationDetails), employeeController.saveEducationDetails);
router.put('/bank',      validate(schemas.bankDetails),      employeeController.saveBankDetails);

// Document upload
router.post(
  '/documents',
  ensureCloudinaryConfigured,
  handleDocumentUpload,
  employeeController.uploadDocuments
);

// Submit section for review
router.patch('/submit/:section', employeeController.submitSection);

module.exports = router;
