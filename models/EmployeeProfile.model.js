const mongoose = require('mongoose');

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const verificationStatusSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'submitted', 'under_review', 'approved', 'rejected'],
      default: 'pending',
    },
    comments: { type: String, trim: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    submittedAt: { type: Date },
  },
  { _id: false }
);

// FIX: Added educationLevel enum, gender moved to personalDetails with new values
const personalDetailsSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    dateOfBirth: { type: Date },
    // FIX: Standardised gender values (Male/Female/Other)
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
    mobile: { type: String, trim: true },
    alternatePhone: { type: String, trim: true },
    // FIX: Added Aadhaar & PAN number fields with validation
    aadhaarNumber: {
      type: String,
      trim: true,
      match: [/^\d{12}$/, 'Aadhaar must be exactly 12 digits'],
    },
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'],
    },
    address: {
      street: { type: String, trim: true },
      city:   { type: String, trim: true },
      state:  { type: String, trim: true },
      pincode:{ type: String, trim: true },
      country:{ type: String, trim: true, default: 'India' },
    },
    permanentAddress: {
      street: { type: String, trim: true },
      city:   { type: String, trim: true },
      state:  { type: String, trim: true },
      pincode:{ type: String, trim: true },
      country:{ type: String, trim: true, default: 'India' },
    },
    sameAsCurrent: { type: Boolean, default: false },
    emergencyContact: {
      name:         { type: String, trim: true },
      relationship: { type: String, trim: true },
      mobile:       { type: String, trim: true },
    },
  },
  { _id: false }
);

const educationDetailsSchema = new mongoose.Schema(
  {
    // FIX: educationLevel enum added (UG/PG/Diploma/HSC/SSLC)
    educationLevel: {
      type: String,
      enum: ['UG', 'PG', 'Diploma', 'HSC', 'SSLC'],
    },
    highestDegree:       { type: String, trim: true },
    specialization:      { type: String, trim: true },
    collegeName:         { type: String, trim: true },
    university:          { type: String, trim: true },
    yearOfPassing:       { type: Number },
    percentage:          { type: Number },
    totalExperienceYears:{ type: Number, default: 0 },
    previousEmployer:    { type: String, trim: true },
    previousDesignation: { type: String, trim: true },
    previousCTC:         { type: Number },
    expectedCTC:         { type: Number },
    noticePeriodDays:    { type: Number, default: 0 },
    skills:              [{ type: String, trim: true }],
  },
  { _id: false }
);

const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, trim: true },
    accountNumber:     { type: String, trim: true },
    ifscCode:          { type: String, trim: true, uppercase: true },
    bankName:          { type: String, trim: true },
    branchName:        { type: String, trim: true },
    accountType:       { type: String, enum: ['savings', 'current'], default: 'savings' },
  },
  { _id: false }
);

// ─── Main Schema ─────────────────────────────────────────────────────────────

const employeeProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    employeeId: { type: String, unique: true, sparse: true, index: true },

    // ── Sections ─────────────────────────────────────────────────────────
    personalDetails:  { type: personalDetailsSchema,  default: () => ({}) },
    educationDetails: { type: educationDetailsSchema, default: () => ({}) },
    bankDetails:      { type: bankDetailsSchema,      default: () => ({}) },

    // ── Draft support ─────────────────────────────────────────────────────
    // FIX: Added isDraft flag so partial saves don't trigger submission flow
    isDraft: { type: Boolean, default: true },
    draftData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Onboarding completion ─────────────────────────────────────────────
    // FIX: Track onboarding status separately from overall review status
    onboardingStatus: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },

    // ── Verification per section ──────────────────────────────────────────
    verificationStatus: {
      personal:  { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
      education: { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
      bank:      { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
      documents: { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
    },

    // ── Document-level verification ───────────────────────────────────────
    // FIX: Per-document approval status (aadhaar/pan/passbook individually)
    documentVerification: {
      aadhaar:  { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
      pan:      { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
      passbook: { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
      passport: { type: verificationStatusSchema, default: () => ({ status: 'pending' }) },
    },

    // ── Overall workflow status ───────────────────────────────────────────
    overallStatus: {
      type: String,
      enum: [
        'registered',
        'form_in_progress',
        'form_submitted',
        'under_review',
        'partially_rejected',
        'admin_approved',
        'under_super_admin_review',
        'approved',
        'rejected',
      ],
      default: 'registered',
      index: true,
    },

    // ── Super Admin fields ────────────────────────────────────────────────
    superAdminReview: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      comments:   { type: String },
      status:     { type: String, enum: ['approved', 'rejected'] },
    },

    forwardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    forwardedAt: { type: Date },

    // ── Soft delete ───────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
employeeProfileSchema.index({ overallStatus: 1, createdAt: -1 });
employeeProfileSchema.index({ onboardingStatus: 1 });
// FIX: Index Aadhaar & PAN for uniqueness queries
employeeProfileSchema.index({ 'personalDetails.aadhaarNumber': 1 }, { sparse: true });
employeeProfileSchema.index({ 'personalDetails.panNumber':     1 }, { sparse: true });
employeeProfileSchema.index({ 'verificationStatus.personal.status':  1 });
employeeProfileSchema.index({ 'verificationStatus.education.status': 1 });
employeeProfileSchema.index({ 'verificationStatus.bank.status':      1 });
employeeProfileSchema.index({ 'verificationStatus.documents.status': 1 });

// ─── Methods ──────────────────────────────────────────────────────────────────

employeeProfileSchema.methods.allSectionsApproved = function () {
  const vs = this.verificationStatus;
  return (
    vs.personal.status  === 'approved' &&
    vs.education.status === 'approved' &&
    vs.bank.status      === 'approved' &&
    vs.documents.status === 'approved'
  );
};

// Helper to check if profile is ready for super admin review
employeeProfileSchema.methods.isReadyForFinalReview = function () {
  return this.allSectionsApproved() &&
    ['admin_approved', 'under_review', 'under_super_admin_review'].includes(this.overallStatus);
};

employeeProfileSchema.methods.hasRejectedSection = function () {
  const vs = this.verificationStatus;
  return ['personal', 'education', 'bank', 'documents'].some(
    (s) => vs[s].status === 'rejected'
  );
};

// ─── Pre-save ─────────────────────────────────────────────────────────────────
employeeProfileSchema.pre('save', function (next) {
  if (this.isModified('verificationStatus')) {
    if (this.hasRejectedSection() && ['under_review', 'admin_approved'].includes(this.overallStatus)) {
      this.overallStatus = 'partially_rejected';
    }
  }
  next();
});

// ─── Static: Employee ID generator ───────────────────────────────────────────
employeeProfileSchema.statics.generateEmployeeId = async function () {
  const year   = new Date().getFullYear();
  const prefix = `EMP-${year}-`;

  const last = await this.findOne(
    { employeeId: { $regex: `^${prefix}` } },
    { employeeId: 1 },
    { sort: { employeeId: -1 } }
  ).lean();

  let seq = 1;
  if (last && last.employeeId) {
    const parts = last.employeeId.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
};

module.exports = mongoose.model('EmployeeProfile', employeeProfileSchema);
