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

// ─── Structured Address Sub-schema ───────────────────────────────────────────
const addressSchema = new mongoose.Schema(
  {
    houseNo:  { type: String, trim: true },
    flatName: { type: String, trim: true }, // optional
    street:   { type: String, trim: true },
    city:     { type: String, trim: true },
    state:    { type: String, trim: true },
    pincode:  { type: String, trim: true, match: [/^\d{6}$/, 'Pincode must be exactly 6 digits'] },
    country:  { type: String, trim: true, default: 'India' },
  },
  { _id: false }
);

const personalDetailsSchema = new mongoose.Schema(
  {
    // Name fields — only alphabets and spaces allowed
    firstName: {
      type: String, trim: true,
      match: [/^[A-Za-z ]+$/, 'First name must contain only alphabets and spaces'],
    },
    lastName: {
      type: String, trim: true,
      match: [/^[A-Za-z ]+$/, 'Last name must contain only alphabets and spaces'],
    },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['Male', 'Female', 'Other'] },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
    mobile:         { type: String, trim: true, match: [/^\d{10}$/, 'Mobile must be exactly 10 digits'] },
    alternatePhone: { type: String, trim: true },
    // Aadhaar — exactly 12 numeric digits
    aadhaarNumber: {
      type: String,
      trim: true,
      match: [/^\d{12}$/, 'Aadhaar must be exactly 12 digits'],
    },
    // PAN — ABCDE1234F format, stored uppercase
    panNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format (e.g. ABCDE1234F)'],
    },
    // Structured current address
    address: { type: addressSchema },
    // Structured permanent address
    permanentAddress: { type: addressSchema },
    sameAsCurrent: { type: Boolean, default: false },
    emergencyContact: {
      name: {
        type: String, trim: true,
        match: [/^[A-Za-z ]+$/, 'Emergency contact name must contain only alphabets and spaces'],
      },
      // Restricted dropdown: Parent | Guardian | Friend
      relationship: {
        type: String, trim: true,
        enum: ['Parent', 'Guardian', 'Friend'],
      },
      mobile: { type: String, trim: true, match: [/^\d{10}$/, 'Mobile must be exactly 10 digits'] },
    },
  },
  { _id: false }
);

// ─── Education Entry Sub-schema (for array) ───────────────────────────────────
const educationEntrySchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ['SSLC', 'HSC', 'Diploma', 'UG', 'PG'],
      required: true,
    },
    // degree & specialization only relevant for UG/PG
    degree:          { type: String, trim: true },
    specialization:  { type: String, trim: true },
    institution:     { type: String, trim: true },
    yearOfPassing:   { type: Number, min: 1980 },
    percentage:      { type: Number, min: 0, max: 100 },
  },
  { _id: true }
);

// ─── Career Sub-schema ────────────────────────────────────────────────────────
const careerSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['fresher', 'experienced'] },
    // Experienced-only fields
    companyName:  {
      type: String, trim: true,
      match: [/^[A-Za-z ]+$/, 'Company name must contain only alphabets and spaces'],
    },
    position:     { type: String, trim: true },
    previousCTC:  { type: Number, min: 0 },
    // Common fields
    expectedCTC:  { type: Number, min: 0 },
    noticePeriod: { type: String, trim: true },
    skills:       [{ type: String, trim: true }],
  },
  { _id: false }
);

// ─── Bank Details ─────────────────────────────────────────────────────────────
const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: {
      type: String, trim: true,
      match: [/^[A-Za-z ]+$/, 'Account holder name must contain only alphabets and spaces'],
    },
    accountNumber:  { type: String, trim: true },
    ifscCode:       { type: String, trim: true, uppercase: true },
    bankName: {
      type: String, trim: true,
      match: [/^[A-Za-z ]+$/, 'Bank name must contain only alphabets and spaces'],
    },
    branchName: {
      type: String, trim: true,
      match: [/^[A-Za-z ]+$/, 'Branch name must contain only alphabets and spaces'],
    },
    accountType: { type: String, enum: ['savings', 'current'], default: 'savings' },
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
    // Education is now an ARRAY of entries supporting multiple qualifications
    educationDetails: { type: [educationEntrySchema],  default: () => [] },
    // Career section (fresher vs experienced)
    careerDetails:    { type: careerSchema,             default: () => ({}) },
    bankDetails:      { type: bankDetailsSchema,        default: () => ({}) },

    // ── Draft support ─────────────────────────────────────────────────────
    isDraft:   { type: Boolean, default: true },
    draftData: { type: mongoose.Schema.Types.Mixed, default: {} },

    // ── Onboarding completion ─────────────────────────────────────────────
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
// Unique + sparse indexes for Aadhaar & PAN (enforced at DB level)
employeeProfileSchema.index(
  { 'personalDetails.aadhaarNumber': 1 },
  { unique: true, sparse: true, name: 'idx_aadhaar_unique' }
);
employeeProfileSchema.index(
  { 'personalDetails.panNumber': 1 },
  { unique: true, sparse: true, name: 'idx_pan_unique' }
);
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
