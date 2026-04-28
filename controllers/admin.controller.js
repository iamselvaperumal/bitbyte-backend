const adminService = require('../services/admin.service');
const catchAsync   = require('../utils/catchAsync');

exports.getEmployeeList = catchAsync(async (req, res) => {
  const { status, page, limit, search } = req.query;
  const result = await adminService.getEmployeeList({ status, page, limit, search });
  res.status(200).json({ status: 'success', data: result });
});

exports.getEmployeeDetail = catchAsync(async (req, res) => {
  const { profile, documents, logs } = await adminService.getEmployeeDetail(req.params.profileId);
  res.status(200).json({ status: 'success', data: { profile, documents, logs } });
});

exports.verifySection = catchAsync(async (req, res) => {
  const { profileId, section } = req.params;
  const profile = await adminService.verifySection(profileId, section, req.body, req.user);
  res.status(200).json({
    status: 'success',
    message: `Section "${section}" has been ${req.body.action}.`,
    data: { profile },
  });
});

// FIX: new — per-document verification controller
exports.verifyDocument = catchAsync(async (req, res) => {
  const { profileId } = req.params;
  const documents = await adminService.verifyDocument(profileId, req.body, req.user);
  res.status(200).json({
    status: 'success',
    message: `Document "${req.body.docType}" has been ${req.body.action}.`,
    data: { documents },
  });
});

// FIX: new — mark doc as viewed (enables approve/reject buttons on frontend)
exports.markDocumentViewed = catchAsync(async (req, res) => {
  const { profileId, docType } = req.params;
  const documents = await adminService.markDocumentViewed(profileId, docType, req.user);
  res.status(200).json({ status: 'success', data: { documents } });
});

exports.forwardToSuperAdmin = catchAsync(async (req, res) => {
  const profile = await adminService.forwardToSuperAdmin(req.params.profileId, req.user);
  res.status(200).json({
    status: 'success',
    message: 'Employee profile forwarded to Super Admin for final approval.',
    data: { profile },
  });
});

// FIX: admin profile endpoint
exports.getMyProfile = catchAsync(async (req, res) => {
  const admin = await adminService.getAdminProfile(req.user._id);
  res.status(200).json({ status: 'success', data: { user: admin } });
});

exports.getDashboardStats = catchAsync(async (req, res) => {
  const result = await adminService.getDashboardStats();
  res.status(200).json({ status: 'success', data: result });
});
