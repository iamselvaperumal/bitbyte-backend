const superAdminService = require('../services/superAdmin.service');
const catchAsync        = require('../utils/catchAsync');

exports.getPendingApprovals = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  const result = await superAdminService.getPendingApprovals({ page, limit });
  res.status(200).json({ status: 'success', data: result });
});

exports.getAllEmployees = catchAsync(async (req, res) => {
  const { status, page, limit, search } = req.query;
  const result = await superAdminService.getAllEmployees({ status, page, limit, search });
  res.status(200).json({ status: 'success', data: result });
});

exports.getEmployeeDetail = catchAsync(async (req, res) => {
  const { profile, documents, logs } = await superAdminService.getEmployeeDetail(req.params.profileId);
  res.status(200).json({ status: 'success', data: { profile, documents, logs } });
});

exports.finalReview = catchAsync(async (req, res) => {
  const { profile, employeeId } = await superAdminService.finalReview(
    req.params.profileId,
    req.body,
    req.user
  );
  res.status(200).json({
    status: 'success',
    message:
      req.body.action === 'approved'
        ? `Employee approved. ID generated: ${employeeId}`
        : 'Employee application rejected.',
    data: { profile, employeeId },
  });
});

exports.getAdminList = catchAsync(async (req, res) => {
  const admins = await superAdminService.getAdminList();
  res.status(200).json({ status: 'success', data: { admins } });
});

// FIX: role is passed through body — fixes employee role bug
exports.createAdmin = catchAsync(async (req, res) => {
  const { user } = await superAdminService.createAdmin(req.body, req.user._id);
  res.status(201).json({
    status: 'success',
    message: `${req.body.role === 'super_admin' ? 'Super Admin' : 'Admin'} created. Login credentials sent via email.`,
    data: { user },
  });
});

exports.updateAdminStatus = catchAsync(async (req, res) => {
  const admin = await superAdminService.updateAdminStatus(
    req.params.adminId,
    req.body.status
  );
  res.status(200).json({
    status: 'success',
    message: `Admin status updated to ${req.body.status}.`,
    data: { admin },
  });
});

exports.getDashboardStats = catchAsync(async (req, res) => {
  const result = await superAdminService.getDashboardStats();
  res.status(200).json({ status: 'success', data: result });
});
