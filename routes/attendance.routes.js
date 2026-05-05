const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { protect, authorize, checkFirstLogin } = require('../middlewares/auth.middleware');
const { validate, schemas } = require('../validators/index');

router.use(protect);
router.use(checkFirstLogin);

router.get('/google-sheet', authorize('admin', 'super_admin'), attendanceController.getGoogleSheetAttendance);
router.get('/today', authorize('admin', 'super_admin'), attendanceController.getTodayAttendance);
router.post('/check-in', authorize('admin'), validate(schemas.attendanceAction), attendanceController.checkIn);
router.post('/check-out', authorize('admin'), validate(schemas.attendanceAction), attendanceController.checkOut);
router.post('/absent', authorize('admin'), validate(schemas.attendanceAction), attendanceController.markAbsent);

module.exports = router;
