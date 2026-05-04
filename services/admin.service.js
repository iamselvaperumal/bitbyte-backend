const EmployeeProfile = require('../models/EmployeeProfile.model');
const Document        = require('../models/Document.model');
const VerificationLog = require('../models/VerificationLog.model');
const emailService    = require('./email.service');
const notificationService = require('./notification.service');
const AppError        = require('../utils/AppError');
const logger          = require('../utils/logger');

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'object') return Object.values(value).some(hasValue);
  return true;
};

const mergeWithDraftFallback = (saved = {}, draft = {}) => {
  const merged = { ...draft };

  for (const [key, value] of Object.entries(saved || {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      merged[key] = mergeWithDraftFallback(value, draft?.[key] || {});
    } else if (hasValue(value)) {
      merged[key] = value;
    }
  }

  return merged;
};

const getPathValue = (source, path) =>
  path.split('.').reduce((current, key) => current?.[key], source);

const hydrateReviewSection = (saved, draft, requiredAnchors) => {
  const isArray = Array.isArray(saved);
  const savedHasSubmittedData = isArray
    ? saved.some((item) => hasValue(item))
    : requiredAnchors.some((path) => hasValue(getPathValue(saved, path)));

  if (!savedHasSubmittedData && hasValue(draft)) {
    return draft;
  }

  if (isArray) return saved;

  return mergeWithDraftFallback(saved, draft);
};

class AdminService {

  // FIX: Return ALL relevant statuses including form_in_progress so admin sees everyone
  async getEmployeeList({ status, page = 1, limit = 10, search } = {}) {
    const query = {};

    if (status) {
      query.overallStatus = status;
    } else {
      // FIX: include all non-registered statuses so admin sees full list
      query.overallStatus = {
        $in: [
          'form_in_progress',
          'form_submitted',
          'under_review',
          'partially_rejected',
          'admin_approved',
          'under_super_admin_review',
          'approved',
          'rejected',
        ],
      };
    }

    // FIX: search is done via aggregation to avoid populate-match nulls
    let matchUser = {};
    if (search) {
      matchUser = {
        $or: [
          { 'userInfo.firstName': { $regex: search, $options: 'i' } },
          { 'userInfo.lastName':  { $regex: search, $options: 'i' } },
          { 'userInfo.email':     { $regex: search, $options: 'i' } },
        ],
      };
    }

    const total = await EmployeeProfile.countDocuments(query);

    const profiles = await EmployeeProfile.find(query)
      .populate('userId', 'email firstName lastName status createdAt lastLogin')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    // Filter nulls (deleted users) and apply search manually
    let filtered = profiles.filter((p) => p.userId !== null);
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((p) => {
        const u = p.userId;
        return (
          u.firstName?.toLowerCase().includes(s) ||
          u.lastName?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s)
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

  // FIX: Also fetch documents by userId (not just employeeProfileId) as fallback
  async getEmployeeDetail(profileId) {
    const profile = await EmployeeProfile.findById(profileId)
      .populate('userId', 'email firstName lastName status createdAt lastLogin')
      .populate('forwardedBy', 'firstName lastName email')
      .lean();

    if (!profile) throw new AppError('Employee profile not found', 404);

    // Employees can submit a section while data is still in draftData.
    // Hydrate admin review fields from persisted data first, then draft fallback.
    profile.personalDetails = hydrateReviewSection(
      profile.personalDetails,
      profile.draftData?.personal,
      ['firstName', 'lastName', 'mobile', 'aadhaarNumber', 'panNumber'],
    );
    const draftEdu = profile.draftData?.education;
    const eduDraft = (draftEdu && Array.isArray(draftEdu.education)) ? draftEdu.education : draftEdu;

    profile.educationDetails = hydrateReviewSection(
      profile.educationDetails,
      eduDraft,
      ['level', 'degree', 'institution'],
    );
    profile.careerDetails = hydrateReviewSection(
      profile.careerDetails,
      profile.draftData?.career,
      ['type', 'expectedCTC'],
    );
    profile.bankDetails = hydrateReviewSection(
      profile.bankDetails,
      profile.draftData?.bank,
      ['accountHolderName', 'accountNumber', 'ifscCode', 'bankName'],
    );

    // FIX: look up documents by both userId and profileId
    let documents = await Document.findOne({ employeeProfileId: profileId }).lean();
    if (!documents && profile.userId) {
      documents = await Document.findOne({ userId: profile.userId._id || profile.userId }).lean();
    }

    const sections = ['personal', 'education', 'bank', 'documents'];
    let changed = false;
    sections.forEach((s) => {
      if (profile.verificationStatus[s]?.status === 'submitted') {
        profile.verificationStatus[s].status = 'under_review';
        changed = true;
      }
    });

    if (changed) {
      if (profile.overallStatus === 'form_submitted') {
        profile.overallStatus = 'under_review';
      }
      // We need the model instance to save, but profile is lean. 
      // Let's re-fetch the model and save if changed.
      const profileModel = await EmployeeProfile.findById(profileId);
      sections.forEach((s) => {
        if (profileModel.verificationStatus[s]?.status === 'submitted') {
          profileModel.verificationStatus[s].status = 'under_review';
        }
      });
      if (profileModel.overallStatus === 'form_submitted') {
        profileModel.overallStatus = 'under_review';
      }
      await profileModel.save();
    }

    const logs = await VerificationLog.find({ employeeProfileId: profileId })
      .populate('verifiedBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .lean();

    return { profile, documents, logs };
  }

  // ── Verify a section ──────────────────────────────────────────────────
  async verifySection(profileId, section, { action, comments }, adminUser) {
    const validSections = ['personal', 'education', 'bank', 'documents'];
    if (!validSections.includes(section)) {
      throw new AppError(`Invalid section: ${section}`, 400);
    }

    const profile = await EmployeeProfile.findById(profileId).populate('userId', 'email firstName');
    if (!profile) throw new AppError('Profile not found', 404);

    const currentStatus = profile.verificationStatus[section].status;
    if (!['submitted', 'under_review'].includes(currentStatus)) {
      throw new AppError(
        `Section must be in submitted/under_review state. Current: ${currentStatus}`, 400
      );
    }

    const previousStatus = currentStatus;
    profile.verificationStatus[section].status     = action;
    profile.verificationStatus[section].comments   = comments || '';
    profile.verificationStatus[section].verifiedBy = adminUser._id;
    profile.verificationStatus[section].verifiedAt = new Date();

    if (action === 'rejected') {
      profile.overallStatus = 'partially_rejected';
    } else if (action === 'approved') {
      const allApproved = ['personal', 'education', 'bank', 'documents'].every((s) =>
        s === section ? true : profile.verificationStatus[s].status === 'approved'
      );
      if (allApproved) profile.overallStatus = 'admin_approved';
    }

    await profile.save();

    await VerificationLog.create({
      employeeId:        profile.userId._id,
      employeeProfileId: profile._id,
      section, action, previousStatus,
      newStatus:   action,
      comments,
      verifiedBy:  adminUser._id,
      verifierRole:'admin',
    });

    const employee = profile.userId;
    emailService
      .sendSectionStatus({ to: employee.email, firstName: employee.firstName, section, status: action, comments })
      .catch((err) => logger.error(`Section email notification failed: ${err.message}`));

    // In-app notification
    notificationService.notifyEmployeeSectionUpdate(employee._id, section, action, comments)
      .catch((err) => logger.error(`Section in-app notification failed: ${err.message}`));

    return profile;
  }

  // FIX: per-document verification (aadhaar/pan/passbook/passport/resume)
  async verifyDocument(profileId, { docType, action, comments }, adminUser) {
    const validTypes = ['aadhaar', 'pan', 'passbook', 'passport', 'resume'];
    if (!validTypes.includes(docType)) throw new AppError(`Invalid doc type: ${docType}`, 400);

    const profile  = await EmployeeProfile.findById(profileId).populate('userId', 'email firstName');
    if (!profile) throw new AppError('Profile not found', 404);

    const documents = await Document.findOne({ employeeProfileId: profileId })
      || await Document.findOne({ userId: profile.userId._id });
    if (!documents) throw new AppError('Documents not found', 404);

    // Check doc was actually uploaded
    if (!documents[docType]) throw new AppError(`${docType} document not uploaded`, 400);

    const statusKey = `${docType}Status`;
    documents[statusKey].status     = action;
    documents[statusKey].comments   = comments || '';
    documents[statusKey].verifiedBy = adminUser._id;
    documents[statusKey].verifiedAt = new Date();
    await documents.save();

    // FIX: if all required docs approved → approve the documents section
    if (documents.aadhaarStatus?.status === 'approved' &&
        documents.panStatus?.status     === 'approved' &&
        documents.passbookStatus?.status=== 'approved') {
      await this.verifySection(profileId, 'documents', { action: 'approved', comments: 'All documents verified' }, adminUser);
    } else if (action === 'rejected') {
      // Any rejection → reject the section
      await this.verifySection(profileId, 'documents', { action: 'rejected', comments }, adminUser);
    }

    return documents;
  }

  // FIX: mark admin has viewed a specific document
  async markDocumentViewed(profileId, docType, adminUser) {
    const validTypes = ['aadhaar', 'pan', 'passbook', 'passport', 'resume'];
    if (!validTypes.includes(docType)) throw new AppError(`Invalid doc type: ${docType}`, 400);

    const profile   = await EmployeeProfile.findById(profileId);
    if (!profile) throw new AppError('Profile not found', 404);

    const documents = await Document.findOne({ employeeProfileId: profileId })
      || await Document.findOne({ userId: profile.userId });
    if (!documents) throw new AppError('Documents not found', 404);

    const statusKey = `${docType}Status`;
    if (!documents[statusKey].viewedAt) {
      documents[statusKey].viewedAt = new Date();
      await documents.save();
    }
    return documents;
  }

  // ── Forward to Super Admin ─────────────────────────────────────────────
  async forwardToSuperAdmin(profileId, adminUser) {
    const profile = await EmployeeProfile.findById(profileId).populate('userId', 'email firstName');
    if (!profile) throw new AppError('Profile not found', 404);

    if (!profile.allSectionsApproved()) {
      throw new AppError('All sections must be approved before forwarding to Super Admin.', 400);
    }
    if (!profile.department || !profile.position) {
      throw new AppError('Assign department and position before forwarding to Super Admin.', 400);
    }
    if (!['admin_approved', 'under_review'].includes(profile.overallStatus)) {
      throw new AppError(`Cannot forward. Current status: ${profile.overallStatus}`, 400);
    }

    const previousStatus = profile.overallStatus;
    profile.overallStatus = 'under_super_admin_review';
    profile.forwardedBy   = adminUser._id;
    profile.forwardedAt   = new Date();
    await profile.save();

    await VerificationLog.create({
      employeeId:        profile.userId._id,
      employeeProfileId: profile._id,
      section:     'overall',
      action:      'forwarded_to_super_admin',
      previousStatus,
      newStatus:   'under_super_admin_review',
      verifiedBy:  adminUser._id,
      verifierRole:'admin',
    });

    emailService
      .sendForwardedNotification({ to: profile.userId.email, firstName: profile.userId.firstName })
      .catch((err) => logger.error(`Forward email notification failed: ${err.message}`));

    // In-app notification for employee
    notificationService.notifyEmployeeForwarded(profile.userId._id)
      .catch((err) => logger.error(`Forward in-app notification for employee failed: ${err.message}`));

    // In-app notification for super admins
    notificationService.notifySuperAdminNewForward(profile, adminUser)
      .catch((err) => logger.error(`Forward in-app notification for super admins failed: ${err.message}`));

    return profile;
  }

  // FIX: Admin profile getter — returns admin's own user info
  async getAdminProfile(adminId) {
    const User = require('../models/User.model');
    const admin = await User.findById(adminId).select('-password').lean();
    if (!admin) throw new AppError('Admin not found', 404);
    return admin;
  }

  async getDashboardStats() {
    const [stats, weeklyData] = await Promise.all([
      EmployeeProfile.aggregate([{ $group: { _id: '$overallStatus', count: { $sum: 1 } } }]),
      EmployeeProfile.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const statusMap = stats.reduce((acc, s) => { acc[s._id] = s.count; return acc; }, {});

    return {
      stats: {
        total:            Object.values(statusMap).reduce((a, b) => a + b, 0),
        pending:          (statusMap.form_submitted || 0) + (statusMap.under_review || 0),
        approved:          statusMap.approved || 0,
        rejected:          statusMap.rejected || 0,
        underReview:       statusMap.under_super_admin_review || 0,
        partiallyRejected: statusMap.partially_rejected || 0,
      },
      chartData: weeklyData.map((d) => ({ date: d._id, count: d.count })),
    };
  }
}

module.exports = new AdminService();
