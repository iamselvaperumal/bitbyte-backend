const express = require('express');
const router = express.Router();

const leaveController = require('../controllers/leave.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.use(protect);
router.use(checkFirstLogin);

router.get('/all', authorize('admin'), leaveController.getAllLeaves);
router.get('/requests', authorize('admin'), leaveController.getLeaveRequests);
router.get('/me', authorize('employee', 'intern'), leaveController.getMyLeave);
router.get('/:employeeId', authorize('admin'), leaveController.getEmployeeLeave);

router.post('/allocate', authorize('admin'), validate(schemas.leaveAllocation), leaveController.allocateLeave);
router.post('/request', authorize('admin'), validate(schemas.leaveRequest), leaveController.createLeaveRequest);
router.put('/approve', authorize('admin'), validate(schemas.leaveDecision), leaveController.approveLeaveRequest);
router.put('/reject', authorize('admin'), validate(schemas.leaveReject), leaveController.rejectLeaveRequest);
router.post('/comp-off', authorize('admin'), validate(schemas.compOffGrant), leaveController.grantCompOff);

module.exports = router;
