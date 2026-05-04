const EmployeeProfile = require('../models/EmployeeProfile.model');
const User            = require('../models/User.model');
const VerificationLog = require('../models/VerificationLog.model');
const authService     = require('./auth.service');
const emailService    = require('./email.service');
const notificationService = require('./notification.service');
const AppError        = require('../utils/AppError');
const logger          = require('../utils/logger');

class SuperAdminService {

  // FIX: show all employees awaiting super admin final decision
  // Includes: under_super_admin_review (forwarded), admin_approved, and under_review
  // (legacy: old data where all sections approved but status was set to under_review)
  async getPendingApprovals({ page = 1, limit = 10 } = {}) {
    const query = {
      overallStatus: { $in: ['under_super_admin_review', 'admin_approved', 'under_review'] },
    };
    const total = await EmployeeProfile.countDocuments(query);

    const employees = await EmployeeProfile.find(query)
      .populate('userId',      'email firstName lastName createdAt')
      .populate('forwardedBy', 'firstName lastName email')
      .sort({ forwardedAt: 1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    return {
      employees,
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }

  // FIX: All Employees endpoint — no longer silently returns empty
  async getAllEmployees({ status, page = 1, limit = 10, search } = {}) {
    const query = {};
    if (status) query.overallStatus = status;

    const total = await EmployeeProfile.countDocuments(query);

    const employees = await EmployeeProfile.find(query)
      .populate('userId', 'email firstName lastName status createdAt')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    let filtered = employees.filter((e) => e.userId !== null);

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((e) => {
        const u = e.userId;
        return (
          u.firstName?.toLowerCase().includes(s) ||
          u.lastName?.toLowerCase().includes(s)  ||
          u.email?.toLowerCase().includes(s)     ||
          e.employeeId?.toLowerCase().includes(s)
        );
      });
    }

    return {
      employees: filtered,
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }

  // FIX: full profile with documents for super admin review
  async getEmployeeDetail(profileId) {
    const profile = await EmployeeProfile.findById(profileId)
      .populate('userId',      'email firstName lastName status createdAt')
      .populate('forwardedBy', 'firstName lastName email')
      .lean();
    if (!profile) throw new AppError('Profile not found', 404);

    const Document = require('../models/Document.model');
    const documents = await Document.findOne({ employeeProfileId: profileId }).lean()
      || await Document.findOne({ userId: profile.userId._id || profile.userId }).lean();

    const logs = await VerificationLog.find({ employeeProfileId: profileId })
      .populate('verifiedBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .lean();

    return { profile, documents, logs };
  }

  // FIX: final review — no section-wise approval needed at this stage
  async finalReview(profileId, { action, comments }, superAdminUser) {
    const profile = await EmployeeProfile.findById(profileId)
      .populate('userId', 'email firstName lastName');
    if (!profile) throw new AppError('Profile not found', 404);

    const reviewableStatuses = ['under_super_admin_review', 'admin_approved', 'under_review'];
    if (!reviewableStatuses.includes(profile.overallStatus)) {
      throw new AppError(`Cannot review. Current status: ${profile.overallStatus}`, 400);
    }

    profile.superAdminReview = {
      reviewedBy: superAdminUser._id,
      reviewedAt: new Date(),
      comments:   comments || '',
      status:     action,
    };

    let employeeId = null;

    if (action === 'approved') {
      employeeId         = await EmployeeProfile.generateEmployeeId();
      profile.employeeId = employeeId;
      profile.overallStatus = 'approved';

      await VerificationLog.create({
        employeeId:        profile.userId._id,
        employeeProfileId: profile._id,
        section:  'overall', action: 'final_approved',
        previousStatus: profile.overallStatus, newStatus: 'approved',
        comments, verifiedBy: superAdminUser._id, verifierRole: 'super_admin',
        metadata: { employeeId },
      });

      emailService
        .sendFinalApproval({ to: profile.userId.email, firstName: profile.userId.firstName, employeeId })
        .catch((err) => logger.error(`Final approval email failed: ${err.message}`));

      // In-app notification
      notificationService.notifyEmployeeFinalDecision(profile.userId._id, 'approved', comments, employeeId)
        .catch((err) => logger.error(`Final approval in-app notification failed: ${err.message}`));
    } else {
      profile.overallStatus = 'rejected';

      await VerificationLog.create({
        employeeId:        profile.userId._id,
        employeeProfileId: profile._id,
        section:  'overall', action: 'final_rejected',
        previousStatus: profile.overallStatus, newStatus: 'rejected',
        comments, verifiedBy: superAdminUser._id, verifierRole: 'super_admin',
      });

      emailService
        .sendFinalRejection({ to: profile.userId.email, firstName: profile.userId.firstName, comments })
        .catch((err) => logger.error(`Final rejection email failed: ${err.message}`));

      // In-app notification
      notificationService.notifyEmployeeFinalDecision(profile.userId._id, 'rejected', comments)
        .catch((err) => logger.error(`Final rejection in-app notification failed: ${err.message}`));
    }

    await profile.save();
    return { profile, employeeId };
  }

  async getAdminList() {
    return User.find({ role: 'admin' })
      .select('firstName lastName email status createdAt lastLogin')
      .sort({ createdAt: -1 })
      .lean();
  }

  // FIX: createAdmin now explicitly passes role:'admin' — no more employee role bug
  async createAdmin(data, createdBy) {
    return authService.registerUser({ ...data, role: data.role || 'admin' }, createdBy);
  }

  async updateAdminStatus(adminId, status) {
    const admin = await User.findOne({ _id: adminId, role: { $in: ['admin', 'super_admin'] } });
    if (!admin) throw new AppError('Admin not found', 404);
    admin.status = status;
    await admin.save();
    return admin;
  }

  async getDashboardStats() {
    const [statusStats, monthlyData, roleStats] = await Promise.all([
      EmployeeProfile.aggregate([{ $group: { _id: '$overallStatus', count: { $sum: 1 } } }]),
      EmployeeProfile.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id:      { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            count:    { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$overallStatus','approved'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    ]);

    const statusMap = statusStats.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});
    const roleMap   = roleStats  .reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {});

    return {
      stats: {
        totalEmployees: roleMap.employee    || 0,
        totalAdmins:    roleMap.admin       || 0,
        approved:       statusMap.approved  || 0,
        pending:
          (statusMap.form_submitted || 0) +
          (statusMap.under_review   || 0) +
          (statusMap.admin_approved || 0) +
          (statusMap.under_super_admin_review || 0),
        rejected:    statusMap.rejected        || 0,
        inProgress:  statusMap.form_in_progress|| 0,
      },
      statusDistribution: statusStats,
      monthlyData: monthlyData.map((d) => ({
        period:   `${d._id.year}-${String(d._id.month).padStart(2,'0')}`,
        total:    d.count,
        approved: d.approved,
      })),
    };
  }
}

module.exports = new SuperAdminService();
