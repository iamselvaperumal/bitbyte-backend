const attendanceService = require('../services/attendance.service');
const googleAttendanceService = require('../services/googleAttendance.service');
const catchAsync = require('../utils/catchAsync');

exports.checkIn = catchAsync(async (req, res) => {
  const attendance = await attendanceService.checkIn(req.body.employeeId, req.user._id);
  res.status(201).json({
    status: 'success',
    message: 'Employee checked in successfully.',
    data: { attendance },
  });
});

exports.checkOut = catchAsync(async (req, res) => {
  const attendance = await attendanceService.checkOut(req.body.employeeId, req.user._id);
  res.status(200).json({
    status: 'success',
    message: 'Employee checked out successfully.',
    data: { attendance },
  });
});

exports.markAbsent = catchAsync(async (req, res) => {
  const attendance = await attendanceService.markAbsent(req.body.employeeId, req.user._id);
  res.status(201).json({
    status: 'success',
    message: 'Employee marked absent.',
    data: { attendance },
  });
});

exports.getTodayAttendance = catchAsync(async (req, res) => {
  const result = await attendanceService.getTodayAttendance();
  res.status(200).json({ status: 'success', data: result });
});

exports.getGoogleSheetAttendance = catchAsync(async (req, res) => {
  const result = await googleAttendanceService.getAttendance({
    date: req.query.date,
    sheetName: req.query.sheet,
    forceRefresh: req.query.refresh === 'true',
    limit: req.query.limit,
  });

  res.status(200).json({ status: 'success', data: result });
});
