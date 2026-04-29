const employeeService = require('../services/employee.service');
const catchAsync      = require('../utils/catchAsync');

exports.getProfile = catchAsync(async (req, res) => {
  const { profile, documents } = await employeeService.getProfile(req.user._id);
  res.status(200).json({ status: 'success', data: { profile, documents } });
});

exports.getOnboardingStatus = catchAsync(async (req, res) => {
  const status = await employeeService.getOnboardingStatus(req.user._id);
  res.status(200).json({ status: 'success', data: status });
});

exports.saveDraft = catchAsync(async (req, res) => {
  const { section } = req.params;
  const profile = await employeeService.saveDraft(req.user._id, section, req.body);
  res.status(200).json({
    status: 'success',
    message: `Draft saved for ${section}.`,
    data: { profile },
  });
});

exports.getDraft = catchAsync(async (req, res) => {
  const profile = await employeeService.getDraft(req.user._id);
  res.status(200).json({ status: 'success', data: profile });
});

exports.savePersonalDetails = catchAsync(async (req, res) => {
  const profile = await employeeService.savePersonalDetails(req.user._id, req.body);
  res.status(200).json({
    status: 'success',
    message: 'Personal details saved successfully.',
    data: { profile },
  });
});

exports.saveEducationDetails = catchAsync(async (req, res) => {
  const profile = await employeeService.saveEducationDetails(req.user._id, req.body);
  res.status(200).json({
    status: 'success',
    message: 'Education details saved successfully.',
    data: { profile },
  });
});

// NEW: career details
exports.saveCareerDetails = catchAsync(async (req, res) => {
  const profile = await employeeService.saveCareerDetails(req.user._id, req.body);
  res.status(200).json({
    status: 'success',
    message: 'Career details saved successfully.',
    data: { profile },
  });
});

exports.saveBankDetails = catchAsync(async (req, res) => {
  const profile = await employeeService.saveBankDetails(req.user._id, req.body);
  res.status(200).json({
    status: 'success',
    message: 'Bank details saved successfully.',
    data: { profile },
  });
});

exports.uploadDocuments = catchAsync(async (req, res) => {
  const { profile, documents } = await employeeService.uploadDocuments(
    req.user._id,
    req.files
  );
  res.status(200).json({
    status: 'success',
    message: 'Documents uploaded successfully.',
    data: { profile, documents },
  });
});

exports.submitSection = catchAsync(async (req, res) => {
  const { section } = req.params;
  const profile = await employeeService.submitSection(req.user._id, section);
  res.status(200).json({
    status: 'success',
    message: `${section} section submitted for review.`,
    data: { profile },
  });
});

exports.getAuditTrail = catchAsync(async (req, res) => {
  const logs = await employeeService.getAuditTrail(req.user._id);
  res.status(200).json({ status: 'success', data: { logs } });
});
