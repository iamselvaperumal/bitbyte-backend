const payrollService = require('../services/payroll.service');
const catchAsync = require('../utils/catchAsync');

exports.searchEmployees = catchAsync(async (req, res) => {
  const employees = await payrollService.searchEmployees(req.query);
  res.status(200).json({ status: 'success', data: { employees } });
});

exports.createPayroll = catchAsync(async (req, res) => {
  const payroll = await payrollService.createPayroll(req.body, req.user);
  res.status(201).json({
    status: 'success',
    message: 'Payroll created and payslip generated successfully.',
    data: { payroll },
  });
});

exports.getAllPayroll = catchAsync(async (req, res) => {
  const result = await payrollService.getAllPayroll(req.query);
  res.status(200).json({ status: 'success', data: result });
});

exports.getAnalytics = catchAsync(async (req, res) => {
  const analytics = await payrollService.getAnalytics(payrollService.buildListQuery(req.query));
  res.status(200).json({ status: 'success', data: { analytics } });
});

exports.getMyPayroll = catchAsync(async (req, res) => {
  const records = await payrollService.getMyPayroll(req.user._id);
  res.status(200).json({ status: 'success', data: { records } });
});

exports.getPayrollByEmployeeId = catchAsync(async (req, res) => {
  const records = await payrollService.getPayrollByEmployeeId(req.params.employeeId, req.user);
  res.status(200).json({ status: 'success', data: { records } });
});

exports.getPayslip = catchAsync(async (req, res) => {
  const payslip = await payrollService.getPayslip(req.params.id, req.user);
  res.status(200).json({ status: 'success', data: { payslip } });
});

exports.deletePayroll = catchAsync(async (req, res) => {
  await payrollService.deletePayroll(req.params.id);
  res.status(200).json({
    status: 'success',
    message: 'Payroll record deleted successfully.',
  });
});
