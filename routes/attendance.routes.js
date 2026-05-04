const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.use(protect);
router.use(authorize('admin', 'super_admin'));
router.use(checkFirstLogin);

router.get('/today', attendanceController.getTodayAttendance);
router.post('/check-in', validate(schemas.attendanceAction), attendanceController.checkIn);
router.post('/check-out', validate(schemas.attendanceAction), attendanceController.checkOut);
router.post('/absent', validate(schemas.attendanceAction), attendanceController.markAbsent);

module.exports = router;
