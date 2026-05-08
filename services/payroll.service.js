const Payroll = require('../models/Payroll.model');
const EmployeeProfile = require('../models/EmployeeProfile.model');
const AppError = require('../utils/AppError');
const payrollCalculator = require('./payrollCalculator');

const COMPANY_DETAILS = {
  name: process.env.COMPANY_NAME || 'BitByte Tech',
  address: process.env.COMPANY_ADDRESS || 'Corporate Office',
  cityPincode: process.env.COMPANY_CITY_PINCODE || 'India',
  logoUrl: process.env.COMPANY_LOGO_URL || '/logo.png',
};

const getEmployeeName = (profile) => {
  const personalName = `${profile.personalDetails?.firstName || ''} ${profile.personalDetails?.lastName || ''}`.trim();
  const userName = `${profile.userId?.firstName || ''} ${profile.userId?.lastName || ''}`.trim();
  return personalName || userName || 'Employee';
};

const buildPayslipPayload = (payroll) => ({
  company: COMPANY_DETAILS,
  payroll,
});

class PayrollService {
  async searchEmployees({ search = '', limit = 12 } = {}) {
    const query = {
      employeeId: { $exists: true, $ne: null },
      overallStatus: 'approved',
    };

    if (search) {
      query.$or = [
        { employeeId: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
        { 'personalDetails.firstName': { $regex: search, $options: 'i' } },
        { 'personalDetails.lastName': { $regex: search, $options: 'i' } },
      ];
    }

    const profiles = await EmployeeProfile.find(query)
      .populate('userId', 'firstName lastName email status')
      .sort({ employeeId: 1 })
      .limit(Math.min(Number(limit) || 12, 25))
      .lean();

    return profiles.map((profile) => ({
      profileId: profile._id,
      userId: profile.userId?._id || profile.userId,
      employeeId: profile.employeeId,
      employeeName: getEmployeeName(profile),
      email: profile.userId?.email,
      department: profile.department || '',
      position: profile.position || profile.appliedPosition || '',
    }));
  }

  calculatePayroll(data) {
    return payrollCalculator.calculatePayroll(data);
  }

  async createPayroll(data, createdBy) {
    const profile = await EmployeeProfile.findOne({ employeeId: data.employeeId })
      .populate('userId', 'firstName lastName email status')
      .lean();

    if (!profile) {
      throw new AppError('Employee not found for the selected Employee ID.', 404);
    }

    if (profile.overallStatus !== 'approved') {
      throw new AppError('Payroll can only be created for approved employees.', 400);
    }

    const totals = this.calculatePayroll(data);

    try {
      const payroll = await Payroll.create({
        employeeProfileId: profile._id,
        userId: profile.userId?._id || profile.userId,
        employeeId: profile.employeeId,
        employeeName: getEmployeeName(profile),
        department: profile.department || '',
        position: profile.position || profile.appliedPosition || '',
        payPeriod: data.payPeriod,
        paidDays: data.paidDays,
        lopDays: data.lopDays || 0,
        payDate: data.payDate,
        ...totals,
        createdBy: createdBy._id,
      });

      return payroll;
    } catch (err) {
      if (err.code === 11000) {
        throw new AppError('Payroll already exists for this employee and pay period.', 409);
      }
      throw err;
    }
  }

  buildListQuery({ search, payPeriod, department, status } = {}) {
    const query = {};
    if (payPeriod) query.payPeriod = payPeriod;
    if (department) query.department = department;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { employeeId: { $regex: search, $options: 'i' } },
        { employeeName: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } },
      ];
    }

    return query;
  }

  async getAllPayroll(queryParams = {}) {
    const page = Number(queryParams.page) || 1;
    const limit = Math.min(Number(queryParams.limit) || 10, 100);
    const query = this.buildListQuery(queryParams);

    const [records, total, analytics] = await Promise.all([
      Payroll.find(query)
        .populate('createdBy', 'firstName lastName email')
        .sort({ payPeriod: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Payroll.countDocuments(query),
      this.getAnalytics(query),
    ]);

    return {
      records,
      analytics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getAnalytics(baseQuery = {}) {
    const match = { ...baseQuery };

    const [
      totals,
      monthlySummary,
      departmentSummary,
      salaryDistribution,
      recentPayroll,
    ] = await Promise.all([
      Payroll.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalPayrolls: { $sum: 1 },
            employeesPaid: { $addToSet: '$employeeProfileId' },
            grossPayout: { $sum: '$grossEarnings' },
            totalDeductions: { $sum: '$totalDeductions' },
            netPayout: { $sum: '$netSalary' },
            averageNetSalary: { $avg: '$netSalary' },
          },
        },
        {
          $project: {
            _id: 0,
            totalPayrolls: 1,
            employeesPaid: { $size: '$employeesPaid' },
            grossPayout: { $round: ['$grossPayout', 2] },
            totalDeductions: { $round: ['$totalDeductions', 2] },
            netPayout: { $round: ['$netPayout', 2] },
            averageNetSalary: { $round: ['$averageNetSalary', 2] },
          },
        },
      ]),
      Payroll.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$payPeriod',
            gross: { $sum: '$grossEarnings' },
            deductions: { $sum: '$totalDeductions' },
            net: { $sum: '$netSalary' },
            payrolls: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 12 },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            payPeriod: '$_id',
            gross: { $round: ['$gross', 2] },
            deductions: { $round: ['$deductions', 2] },
            net: { $round: ['$net', 2] },
            payrolls: 1,
          },
        },
      ]),
      Payroll.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$department',
            employees: { $addToSet: '$employeeProfileId' },
            net: { $sum: '$netSalary' },
          },
        },
        { $sort: { net: -1 } },
        { $limit: 8 },
        {
          $project: {
            _id: 0,
            department: { $ifNull: ['$_id', 'Unassigned'] },
            employees: { $size: '$employees' },
            net: { $round: ['$net', 2] },
          },
        },
      ]),
      Payroll.aggregate([
        { $match: match },
        {
          $bucket: {
            groupBy: '$netSalary',
            boundaries: [0, 25000, 50000, 75000, 100000, 100000000],
            default: 'Other',
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Payroll.find(match).sort({ createdAt: -1 }).limit(1).lean(),
    ]);

    const distributionLabels = {
      0: '<25k',
      25000: '25k-50k',
      50000: '50k-75k',
      75000: '75k-100k',
      100000: '100k+',
    };

    return {
      totals: totals[0] || {
        totalPayrolls: 0,
        employeesPaid: 0,
        grossPayout: 0,
        totalDeductions: 0,
        netPayout: 0,
        averageNetSalary: 0,
      },
      monthlySummary,
      departmentSummary,
      salaryDistribution: salaryDistribution.map((bucket) => ({
        range: distributionLabels[bucket._id] || String(bucket._id),
        count: bucket.count,
      })),
      recentPayroll: recentPayroll[0] || null,
    };
  }

  async getPayrollByEmployeeId(employeeId, requester) {
    if (['employee', 'intern'].includes(requester.role)) {
      const profile = await EmployeeProfile.findOne({ userId: requester._id }).select('employeeId').lean();
      if (!profile || profile.employeeId !== employeeId) {
        throw new AppError('You can only view your own payroll records.', 403);
      }
    }

    return Payroll.find({ employeeId })
      .sort({ payPeriod: -1, createdAt: -1 })
      .lean();
  }

  async getMyPayroll(userId) {
    const profile = await EmployeeProfile.findOne({ userId }).select('employeeId').lean();
    if (!profile?.employeeId) {
      return [];
    }

    return Payroll.find({ employeeId: profile.employeeId })
      .sort({ payPeriod: -1, createdAt: -1 })
      .lean();
  }

  async getPayslip(payrollId, requester) {
    const payroll = await Payroll.findById(payrollId)
      .populate('createdBy', 'firstName lastName email')
      .lean();

    if (!payroll) {
      throw new AppError('Payslip not found.', 404);
    }

    if (['employee', 'intern'].includes(requester.role) && String(payroll.userId) !== String(requester._id)) {
      throw new AppError('You can only view your own payslips.', 403);
    }

    return buildPayslipPayload(payroll);
  }

  async deletePayroll(payrollId) {
    const payroll = await Payroll.findByIdAndDelete(payrollId);
    if (!payroll) {
      throw new AppError('Payroll record not found.', 404);
    }
    return payroll;
  }
}

module.exports = new PayrollService();
