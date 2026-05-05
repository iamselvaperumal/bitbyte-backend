const leaveService = require('../services/leave.service');
const catchAsync = require('../utils/catchAsync');

exports.getAllLeaves = catchAsync(async (req, res) => {
  const result = await leaveService.getAll(req.query);
  res.status(200).json({ status: 'success', data: result });
});

exports.getEmployeeLeave = catchAsync(async (req, res) => {
  const result = await leaveService.getEmployeeLeave(req.params.employeeId, req.query.year);
  res.status(200).json({ status: 'success', data: result });
});

exports.allocateLeave = catchAsync(async (req, res) => {
  const result = await leaveService.allocate(req.body, req.user);
  res.status(200).json({
    status: 'success',
    message: 'Leave allocation updated successfully.',
    data: result,
  });
});

exports.createLeaveRequest = catchAsync(async (req, res) => {
  const result = await leaveService.createRequest(req.body, req.user);
  res.status(201).json({
    status: 'success',
    message: 'Leave request created successfully.',
    data: result,
  });
});

exports.approveLeaveRequest = catchAsync(async (req, res) => {
  const result = await leaveService.approve(req.body.requestId, req.user);
  res.status(200).json({
    status: 'success',
    message: result.lopDays > 0
      ? 'Leave approved with LOP for exhausted balance.'
      : 'Leave approved successfully.',
    data: result,
  });
});

exports.rejectLeaveRequest = catchAsync(async (req, res) => {
  const result = await leaveService.reject(req.body.requestId, req.body.rejectionReason, req.user);
  res.status(200).json({
    status: 'success',
    message: 'Leave request rejected successfully.',
    data: result,
  });
});

exports.grantCompOff = catchAsync(async (req, res) => {
  const result = await leaveService.grantCompOff(req.body, req.user);
  res.status(201).json({
    status: 'success',
    message: 'Comp off granted successfully.',
    data: result,
  });
});

exports.getLeaveRequests = catchAsync(async (req, res) => {
  const result = await leaveService.getRequests(req.query);
  res.status(200).json({ status: 'success', data: { requests: result } });
});
