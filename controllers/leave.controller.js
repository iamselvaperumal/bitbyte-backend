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

exports.getMyLeave = catchAsync(async (req, res) => {
  const result = await leaveService.getMyLeave(req.user._id, req.query.year);
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

exports.markLeave = catchAsync(async (req, res) => {
  const result = await leaveService.markLeave(req.body, req.user);
  res.status(201).json({
    status: 'success',
    message: result.request.lopDays > 0
      ? 'Leave marked with LOP for exhausted balance.'
      : 'Leave marked successfully.',
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
  const query = { ...req.query };

  // If not admin, force employeeId to be the current user's profile ID
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    const profile = await leaveService.getSelfEmployeeProfile(req.user._id);
    query.employeeId = profile._id.toString();
  }

  const result = await leaveService.getRequests(query);
  res.status(200).json({ status: 'success', data: { requests: result } });
});
