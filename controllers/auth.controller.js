const authService = require('../services/auth.service');
const catchAsync = require('../utils/catchAsync');

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const { token, user } = await authService.login(email, password);

  res.status(200).json({
    status: 'success',
    data: { token, user },
  });
});

exports.registerEmployee = catchAsync(async (req, res) => {
  const { user } = await authService.registerEmployee(req.body, req.user?._id);

  res.status(201).json({
    status: 'success',
    message: 'Employee registered successfully. Login credentials sent via email.',
    data: { user },
  });
});

exports.resetPassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { token } = await authService.resetPassword(
    req.user._id,
    currentPassword,
    newPassword
  );

  res.status(200).json({
    status: 'success',
    message: 'Password reset successfully.',
    data: { token },
  });
});

exports.getMe = catchAsync(async (req, res) => {
  const user = await authService.getMe(req.user._id);

  res.status(200).json({
    status: 'success',
    data: { user },
  });
});
