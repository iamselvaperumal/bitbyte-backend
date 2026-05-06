const express = require('express');
const router = express.Router();

const payrollController = require('../controllers/payroll.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.use(protect);
router.use(checkFirstLogin);

router.get('/employees', authorize('admin'), payrollController.searchEmployees);
router.get('/analytics', authorize('admin', 'super_admin'), payrollController.getAnalytics);
router.post('/create', authorize('admin'), validate(schemas.payrollCreate), payrollController.createPayroll);
router.get('/all', authorize('admin', 'super_admin'), payrollController.getAllPayroll);
router.get('/me', authorize('employee', 'intern'), payrollController.getMyPayroll);
router.get('/payslip/:id', authorize('admin', 'super_admin', 'employee', 'intern'), payrollController.getPayslip);
router.delete('/:id', authorize('admin'), payrollController.deletePayroll);
router.get('/:employeeId', authorize('admin', 'super_admin', 'employee', 'intern'), payrollController.getPayrollByEmployeeId);

module.exports = router;
