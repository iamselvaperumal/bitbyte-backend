const EmployeeLeave = require('../models/EmployeeLeave.model');
const LeaveRequest = require('../models/LeaveRequest.model');
const EmployeeProfile = require('../models/EmployeeProfile.model');
const AppError = require('../utils/AppError');

const BALANCE_KEYS = {
  earned_leave: 'earnedLeave',
  casual_leave: 'casualLeave',
  sick_leave: 'sickLeave',
  maternity_leave: 'maternityLeave',
  paternity_leave: 'paternityLeave',
};

const LEAVE_TYPE_LABELS = {
  earned_leave: 'Earned Leave',
  casual_leave: 'Casual Leave',
  sick_leave: 'Sick Leave',
  maternity_leave: 'Maternity Leave',
  paternity_leave: 'Paternity Leave',
  comp_off: 'Comp Off',
  lop: 'Loss of Pay',
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getPolicy = () => ({
  earnedLeaveDays: toNumber(process.env.LEAVE_EARNED_DAYS, 15),
  casualLeaveDays: toNumber(process.env.LEAVE_CASUAL_DAYS, 8),
  sickLeaveDays: toNumber(process.env.LEAVE_SICK_DAYS, 8),
  maternityLeaveDays: toNumber(process.env.LEAVE_MATERNITY_DAYS, 182),
  paternityLeaveDays: toNumber(process.env.LEAVE_PATERNITY_DAYS, 15),
  compOffValidityDays: toNumber(process.env.LEAVE_COMP_OFF_VALIDITY_DAYS, 30),
  publicHolidays: String(process.env.LEAVE_PUBLIC_HOLIDAYS || '')
    .split(',')
    .map((date) => date.trim())
    .filter(Boolean),
});

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const addDays = (date, days) => {
  const value = startOfDay(date);
  value.setDate(value.getDate() + days);
  return value;
};

const getYear = (value = new Date()) => new Date(value).getFullYear();

const formatDateKey = (date) => startOfDay(date).toISOString().slice(0, 10);

const isWeekend = (date) => [0, 6].includes(date.getDay());

const getWorkingDays = (fromDate, toDate, publicHolidays = []) => {
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  if (to < from) throw new AppError('Leave end date cannot be before start date.', 400);

  const holidaySet = new Set(publicHolidays);
  let days = 0;
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    if (!isWeekend(cursor) && !holidaySet.has(formatDateKey(cursor))) days += 1;
  }

  if (days <= 0) {
    throw new AppError('Selected leave period has no working days to deduct.', 400);
  }

  return days;
};

const getCalendarDays = (fromDate, toDate) => {
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  if (to < from) throw new AppError('Leave end date cannot be before start date.', 400);
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
};

const getEmployeeName = (profile) =>
  `${profile.userId?.firstName || ''} ${profile.userId?.lastName || ''}`.trim();

const normalizeBalance = (balance = {}) => {
  const total = toNumber(balance.total);
  const used = Math.min(toNumber(balance.used), total);
  return {
    total,
    used,
    remaining: Math.max(total - used, 0),
  };
};

const createDefaultBalances = (carryForward = 0) => {
  const policy = getPolicy();
  return {
    earnedLeave: normalizeBalance({ total: policy.earnedLeaveDays + carryForward, used: 0 }),
    casualLeave: normalizeBalance({ total: policy.casualLeaveDays, used: 0 }),
    sickLeave: normalizeBalance({ total: policy.sickLeaveDays, used: 0 }),
    maternityLeave: normalizeBalance({ total: policy.maternityLeaveDays, used: 0 }),
    paternityLeave: normalizeBalance({ total: policy.paternityLeaveDays, used: 0 }),
  };
};

class LeaveService {
  async getApprovedEmployee(employeeId) {
    const profile = await EmployeeProfile.findOne({
      _id: employeeId,
      isDeleted: false,
      overallStatus: 'approved',
    }).populate('userId', 'firstName lastName email');

    if (!profile) throw new AppError('Approved employee profile not found.', 404);
    return profile;
  }

  async getSelfEmployeeProfile(userId) {
    const profile = await EmployeeProfile.findOne({
      userId,
      isDeleted: false,
      overallStatus: 'approved',
    });

    if (!profile) throw new AppError('Approved employee profile not found for this user.', 404);
    return profile;
  }

  async ensureEmployeeLeave(employeeId, year = getYear()) {
    const profile = await this.getApprovedEmployee(employeeId);
    return this.ensureEmployeeLeaveForProfile(profile, year);
  }

  async ensureEmployeeLeaveForProfile(profile, year = getYear()) {
    let leave = await EmployeeLeave.findOne({ employeeId: profile._id, year });
    if (leave) {
      await this.expireCompOff(leave);
      return leave;
    }

    const previous = await EmployeeLeave.findOne({ employeeId: profile._id, year: year - 1 });
    const carryForward = previous?.earnedLeave?.remaining || 0;
    leave = await EmployeeLeave.create({
      employeeId: profile._id,
      year,
      ...createDefaultBalances(carryForward),
      lastPolicyResetAt: new Date(),
    });

    return leave;
  }

  async expireCompOff(leave) {
    const today = startOfDay(new Date());
    let changed = false;

    leave.compOff.forEach((grant) => {
      if (!grant.expired && !grant.used && startOfDay(grant.expiryDate) < today) {
        grant.expired = true;
        changed = true;
      }
    });

    if (changed) await leave.save();
    return leave;
  }

  getCompOffSummary(leave) {
    return leave.compOff.reduce(
      (acc, grant) => {
        const remaining = Math.max(toNumber(grant.days) - toNumber(grant.usedDays), 0);
        acc.total += toNumber(grant.days);
        acc.used += toNumber(grant.usedDays);
        if (grant.expired) acc.expired += remaining;
        if (!grant.expired && !grant.used) acc.remaining += remaining;
        return acc;
      },
      { total: 0, used: 0, remaining: 0, expired: 0 }
    );
  }

  serializeLeave(leave, profile) {
    const compOffSummary = this.getCompOffSummary(leave);
    return {
      _id: leave._id,
      year: leave.year,
      profileId: profile?._id || leave.employeeId,
      employeeId: profile?.employeeId,
      employeeName: profile ? getEmployeeName(profile) : '',
      email: profile?.userId?.email,
      department: profile?.department,
      position: profile?.position || profile?.appliedPosition,
      earnedLeave: leave.earnedLeave,
      casualLeave: leave.casualLeave,
      sickLeave: leave.sickLeave,
      maternityLeave: leave.maternityLeave,
      paternityLeave: leave.paternityLeave,
      compOff: leave.compOff,
      compOffSummary,
      lopDays: leave.lopDays,
      updatedAt: leave.updatedAt,
    };
  }

  serializeRequest(request) {
    const profile = request.employeeId;
    return {
      _id: request._id,
      profileId: profile?._id || request.employeeId,
      employeeId: profile?.employeeId,
      employeeName: profile?.userId ? getEmployeeName(profile) : '',
      department: profile?.department,
      leaveType: request.leaveType,
      leaveTypeLabel: LEAVE_TYPE_LABELS[request.leaveType],
      fromDate: request.fromDate,
      toDate: request.toDate,
      days: request.days,
      payableDays: request.payableDays,
      lopDays: request.lopDays,
      status: request.status,
      reason: request.reason,
      rejectionReason: request.rejectionReason,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
    };
  }

  async getAll({ year = getYear(), department, search } = {}) {
    const employeeQuery = { overallStatus: 'approved', isDeleted: false };
    if (department) employeeQuery.department = department;

    const employees = await EmployeeProfile.find(employeeQuery)
      .populate('userId', 'firstName lastName email')
      .sort({ employeeId: 1, updatedAt: -1 })
      .lean();

    const searchText = String(search || '').trim().toLowerCase();
    const filteredEmployees = searchText
      ? employees.filter((profile) =>
          [
            profile.employeeId,
            getEmployeeName(profile),
            profile.userId?.email,
            profile.department,
          ].some((value) => String(value || '').toLowerCase().includes(searchText))
        )
      : employees;

    const rows = [];
    for (const profile of filteredEmployees) {
      const leave = await this.ensureEmployeeLeaveForProfile(profile, Number(year));
      rows.push(this.serializeLeave(leave, profile));
    }

    return {
      year: Number(year),
      employees: rows,
      policy: getPolicy(),
    };
  }

  async getEmployeeLeave(employeeId, year = getYear()) {
    const profile = await this.getApprovedEmployee(employeeId);
    const leave = await this.ensureEmployeeLeave(employeeId, Number(year));
    return this.serializeLeave(leave, profile);
  }

  async getMyLeave(userId, year = getYear()) {
    const profile = await EmployeeProfile.findOne({
      userId,
      isDeleted: false,
      overallStatus: 'approved',
    }).populate('userId', 'firstName lastName email');

    if (!profile) throw new AppError('Leave balance is available after onboarding approval.', 404);

    const leave = await this.ensureEmployeeLeaveForProfile(profile, Number(year));
    return this.serializeLeave(leave, profile);
  }

  async allocate({ employeeId, year = getYear(), balances }, adminUser) {
    const leave = await this.ensureEmployeeLeave(employeeId, Number(year));

    Object.entries(balances || {}).forEach(([key, value]) => {
      if (!['earnedLeave', 'casualLeave', 'sickLeave', 'maternityLeave', 'paternityLeave'].includes(key)) {
        return;
      }
      const current = leave[key] || {};
      leave[key] = normalizeBalance({
        total: value.total ?? current.total,
        used: value.used ?? current.used,
      });
    });

    leave.updatedBy = adminUser._id;
    await leave.save();
    return this.getEmployeeLeave(employeeId, year);
  }

  calculateLeaveDays(leaveType, fromDate, toDate, requestedDays) {
    if (requestedDays) return requestedDays;
    if (['maternity_leave', 'paternity_leave'].includes(leaveType)) {
      return getCalendarDays(fromDate, toDate);
    }
    return getWorkingDays(fromDate, toDate, getPolicy().publicHolidays);
  }

  async createRequest(payload, user) {
    let employeeId = payload.employeeId;
    if (!employeeId && ['employee', 'intern'].includes(user.role)) {
      const profile = await this.getSelfEmployeeProfile(user._id);
      employeeId = profile._id;
    }

    if (!employeeId) throw new AppError('Employee is required for leave request.', 400);

    const profile = await this.getApprovedEmployee(employeeId);
    if (['employee', 'intern'].includes(user.role) && String(profile.userId._id || profile.userId) !== String(user._id)) {
      throw new AppError('You can only request leave for your own profile.', 403);
    }

    const days = this.calculateLeaveDays(
      payload.leaveType,
      payload.fromDate,
      payload.toDate,
      payload.days
    );

    const request = await LeaveRequest.create({
      employeeId,
      leaveType: payload.leaveType,
      fromDate: startOfDay(payload.fromDate),
      toDate: startOfDay(payload.toDate),
      days,
      reason: payload.reason,
      requestedBy: user._id,
    });

    return this.serializeRequest(await request.populate({
      path: 'employeeId',
      populate: { path: 'userId', select: 'firstName lastName email' },
    }));
  }

  deductBalance(leave, balanceKey, days) {
    const balance = leave[balanceKey];
    const available = Math.max(toNumber(balance.remaining), 0);
    const payableDays = Math.min(available, days);
    const lopDays = Math.max(days - payableDays, 0);

    balance.used = toNumber(balance.used) + payableDays;
    balance.remaining = Math.max(toNumber(balance.total) - toNumber(balance.used), 0);

    return { payableDays, lopDays };
  }

  deductCompOff(leave, days) {
    let remainingToDeduct = days;
    let payableDays = 0;

    const activeGrants = leave.compOff
      .filter((grant) => !grant.expired && !grant.used)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

    activeGrants.forEach((grant) => {
      if (remainingToDeduct <= 0) return;
      const available = Math.max(toNumber(grant.days) - toNumber(grant.usedDays), 0);
      const used = Math.min(available, remainingToDeduct);
      grant.usedDays = toNumber(grant.usedDays) + used;
      grant.used = grant.usedDays >= grant.days;
      remainingToDeduct -= used;
      payableDays += used;
    });

    return { payableDays, lopDays: Math.max(remainingToDeduct, 0) };
  }

  async approve(requestId, adminUser) {
    const request = await LeaveRequest.findById(requestId);
    if (!request) throw new AppError('Leave request not found.', 404);
    if (request.status !== 'pending') throw new AppError('Only pending leave requests can be approved.', 400);

    const leave = await this.ensureEmployeeLeave(request.employeeId, getYear(request.fromDate));
    await this.expireCompOff(leave);

    let result = { payableDays: 0, lopDays: request.days };
    if (BALANCE_KEYS[request.leaveType]) {
      result = this.deductBalance(leave, BALANCE_KEYS[request.leaveType], request.days);
    } else if (request.leaveType === 'comp_off') {
      result = this.deductCompOff(leave, request.days);
    }

    if (request.leaveType === 'lop') result = { payableDays: 0, lopDays: request.days };
    leave.lopDays = toNumber(leave.lopDays) + result.lopDays;
    leave.updatedBy = adminUser._id;
    await leave.save();

    request.status = 'approved';
    request.payableDays = result.payableDays;
    request.lopDays = result.lopDays;
    request.reviewedBy = adminUser._id;
    request.reviewedAt = new Date();
    await request.save();

    return this.serializeRequest(await request.populate({
      path: 'employeeId',
      populate: { path: 'userId', select: 'firstName lastName email' },
    }));
  }

  async reject(requestId, rejectionReason, adminUser) {
    const request = await LeaveRequest.findById(requestId);
    if (!request) throw new AppError('Leave request not found.', 404);
    if (request.status !== 'pending') throw new AppError('Only pending leave requests can be rejected.', 400);

    request.status = 'rejected';
    request.rejectionReason = rejectionReason;
    request.reviewedBy = adminUser._id;
    request.reviewedAt = new Date();
    await request.save();

    return this.serializeRequest(await request.populate({
      path: 'employeeId',
      populate: { path: 'userId', select: 'firstName lastName email' },
    }));
  }

  async grantCompOff({ employeeId, days, grantedDate, validityDays, reason }, adminUser) {
    const policy = getPolicy();
    const leave = await this.ensureEmployeeLeave(employeeId, getYear(grantedDate || new Date()));
    const grantDate = startOfDay(grantedDate || new Date());
    const expiryDate = addDays(grantDate, (validityDays || policy.compOffValidityDays) - 1);

    leave.compOff.push({
      days,
      grantedDate: grantDate,
      expiryDate,
      reason,
      grantedBy: adminUser._id,
    });
    leave.updatedBy = adminUser._id;
    await leave.save();

    return this.getEmployeeLeave(employeeId, leave.year);
  }

  async getRequests({ status, employeeId, year = getYear() } = {}) {
    const query = {};
    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;

    const from = new Date(Number(year), 0, 1);
    const to = new Date(Number(year), 11, 31, 23, 59, 59, 999);
    query.fromDate = { $gte: from, $lte: to };

    const requests = await LeaveRequest.find(query)
      .populate({
        path: 'employeeId',
        select: 'employeeId department position appliedPosition userId',
        populate: { path: 'userId', select: 'firstName lastName email' },
      })
      .sort({ createdAt: -1 })
      .lean();

    return requests.map((request) => this.serializeRequest(request));
  }
}

module.exports = new LeaveService();
