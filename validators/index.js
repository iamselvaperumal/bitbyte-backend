const Joi = require('joi');
const AppError = require('../utils/AppError');

// ── Validator middleware factory ──────────────────────────────────────────
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });
    if (error) {
      const errors = {};
      error.details.forEach((d) => {
        const field = d.path.join('.');
        errors[field] = d.message.replace(/['"]/g, '');
      });
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors,
      });
    }
    req[source] = value;
    next();
  };
};

// ── Shared regex patterns ─────────────────────────────────────────────────
const ALPHA_SPACE = /^[A-Za-z ]+$/;
const MOBILE_10   = /^\d{10}$/;
const AADHAAR_12  = /^\d{12}$/;
const PAN_FORMAT  = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const PINCODE_6   = /^\d{6}$/;
const IFSC_CODE   = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCT_NUM    = /^\d{9,18}$/;

// Predefined skills list
const PREDEFINED_SKILLS = [
  'MERN Developer',
  'Python Full Stack',
  'Java Full Stack',
  'Frontend Developer',
  'Backend Developer',
  'Digital Marketing',
  'Data Analyst',
  'Data Scientist',
  'AI/ML Developer',
  'Others',
];

const POSITION_OPTIONS = ['Intern', 'Full-time'];

// ── Auth schemas ──────────────────────────────────────────────────────────
const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerUserSchema = Joi.object({
  email:     Joi.string().email().required(),
  firstName: Joi.string().trim().pattern(ALPHA_SPACE).min(2).max(50).required()
    .messages({ 'string.pattern.base': 'First name must contain only alphabets and spaces' }),
  lastName:  Joi.string().trim().pattern(ALPHA_SPACE).min(2).max(50).required()
    .messages({ 'string.pattern.base': 'Last name must contain only alphabets and spaces' }),
  role: Joi.string().valid('employee', 'admin', 'super_admin', 'intern').default('employee'),
});

const resetPasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain uppercase, lowercase, number and special character',
    }),
  confirmPassword: Joi.any()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({ 'any.only': 'Passwords do not match' }),
});

// ── Structured Address Schema ─────────────────────────────────────────────
const addressSchema = Joi.object({
  houseNo:  Joi.string().trim().required().messages({ 'any.required': 'House No is required' }),
  flatName: Joi.string().trim().optional().allow(''),
  street:   Joi.string().trim().required().messages({ 'any.required': 'Street is required' }),
  city:     Joi.string().trim().required().messages({ 'any.required': 'City is required' }),
  state:    Joi.string().trim().required().messages({ 'any.required': 'State is required' }),
  pincode:  Joi.string().pattern(PINCODE_6).required()
    .messages({ 'string.pattern.base': 'Pincode must be exactly 6 digits' }),
  country:  Joi.string().trim().default('India'),
});

// ── Personal Details ──────────────────────────────────────────────────────
const personalDetailsSchema = Joi.object({
  firstName: Joi.string().trim().pattern(ALPHA_SPACE).min(2).max(50).required()
    .messages({ 'string.pattern.base': 'First name must contain only alphabets and spaces' }),
  lastName: Joi.string().trim().pattern(ALPHA_SPACE).min(2).max(50).required()
    .messages({ 'string.pattern.base': 'Last name must contain only alphabets and spaces' }),
  dateOfBirth: Joi.date().max('now').required(),
  gender: Joi.string().valid('Male', 'Female', 'Other').required(),
  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .required(),
  mobile: Joi.string()
    .pattern(MOBILE_10)
    .required()
    .messages({ 'string.pattern.base': 'Mobile must be exactly 10 digits' }),
  alternatePhone: Joi.string().pattern(MOBILE_10).optional().allow('')
    .messages({ 'string.pattern.base': 'Alternate phone must be exactly 10 digits' }),
  aadhaarNumber: Joi.string()
    .pattern(AADHAAR_12)
    .required()
    .messages({ 'string.pattern.base': 'Aadhaar must be exactly 12 digits (numeric only)' }),
  panNumber: Joi.string()
    .pattern(PAN_FORMAT)
    .uppercase()
    .required()
    .messages({ 'string.pattern.base': 'PAN format must be ABCDE1234F' }),
  // Structured address objects
  address: addressSchema.required(),
  permanentAddress: addressSchema.required(),
  sameAsCurrent: Joi.boolean().default(false),
  emergencyContact: Joi.object({
    name: Joi.string().trim().pattern(ALPHA_SPACE).required()
      .messages({ 'string.pattern.base': 'Emergency contact name must contain only alphabets and spaces' }),
    relationship: Joi.string().valid('Parent', 'Guardian', 'Friend').required()
      .messages({ 'any.only': 'Relationship must be Parent, Guardian, or Friend' }),
    mobile: Joi.string().pattern(MOBILE_10).required()
      .messages({ 'string.pattern.base': 'Emergency contact mobile must be exactly 10 digits' }),
  }).required(),
});

const personalDetailsDraftSchema = personalDetailsSchema.fork(
  ['firstName','lastName','dateOfBirth','gender','bloodGroup','mobile',
   'aadhaarNumber','panNumber','address','emergencyContact'],
  (s) => s.optional()
);

// ── Education Entry Schema (single entry in array) ────────────────────────
const educationEntrySchema = Joi.object({
  level: Joi.string().valid('SSLC', 'HSC', 'Diploma', 'UG', 'PG').required()
    .messages({ 'any.required': 'Education level is required' }),
  // degree & specialization only required for UG/PG
  degree: Joi.when('level', {
    is: Joi.valid('UG', 'PG'),
    then: Joi.string().trim().required()
      .messages({ 'any.required': 'Degree is required for UG/PG' }),
    otherwise: Joi.string().trim().optional().allow(''),
  }),
  specialization: Joi.when('level', {
    is: Joi.valid('UG', 'PG'),
    then: Joi.string().trim().required()
      .messages({ 'any.required': 'Specialization is required for UG/PG' }),
    otherwise: Joi.string().trim().optional().allow(''),
  }),
  institution: Joi.string().trim().required()
    .messages({ 'any.required': 'Institution name is required' }),
  yearOfPassing: Joi.number()
    .integer()
    .min(1980)
    .max(new Date().getFullYear())
    .required()
    .messages({ 'number.min': 'Year of passing must be 1980 or later' }),
  percentage: Joi.number().min(0).max(100).required()
    .messages({ 'number.min': 'Percentage cannot be negative' }),
});

// ── Education Details (array of entries) ─────────────────────────────────
const educationDetailsSchema = Joi.object({
  education: Joi.array().items(educationEntrySchema).min(1).required()
    .messages({ 'array.min': 'At least one education entry is required' }),
});

const educationDetailsDraftSchema = Joi.object({
  education: Joi.array().items(educationEntrySchema).optional(),
});

// ── Career Details Schema ─────────────────────────────────────────────────
const careerDetailsSchema = Joi.object({
  appliedPosition: Joi.string().valid(...POSITION_OPTIONS).required()
    .messages({ 'any.only': 'Applied position must be Intern or Full-time' }),
  type: Joi.string().valid('fresher', 'experienced').required()
    .messages({ 'any.required': 'Career type (fresher/experienced) is required' }),
  // Experienced-only fields
  companyName: Joi.when('type', {
    is: 'experienced',
    then: Joi.string().trim().pattern(ALPHA_SPACE).required()
      .messages({
        'any.required': 'Company name is required for experienced candidates',
        'string.pattern.base': 'Company name must contain only alphabets and spaces',
      }),
    otherwise: Joi.forbidden(),
  }),
  position: Joi.when('type', {
    is: 'experienced',
    then: Joi.string().trim().required()
      .messages({ 'any.required': 'Position is required for experienced candidates' }),
    otherwise: Joi.forbidden(),
  }),
  previousCTC: Joi.when('type', {
    is: 'experienced',
    then: Joi.number().min(0).required()
      .messages({
        'any.required': 'Previous CTC is required for experienced candidates',
        'number.min': 'Previous CTC cannot be negative',
      }),
    otherwise: Joi.forbidden(),
  }),
  // Common fields
  expectedCTC:  Joi.number().min(0).required()
    .messages({ 'number.min': 'Expected CTC cannot be negative' }),
  noticePeriod: Joi.string().trim().required()
    .messages({ 'any.required': 'Notice period is required' }),
  skills: Joi.array()
    .items(Joi.string().trim())
    .min(1)
    .max(5)
    .unique()
    .required()
    .messages({ 
      'array.min': 'At least one skill must be selected',
      'array.max': 'Maximum 5 skills allowed',
      'array.unique': 'Duplicate skills are not allowed'
    }),
});

const careerDetailsDraftSchema = careerDetailsSchema.fork(
  ['appliedPosition', 'type', 'expectedCTC', 'noticePeriod', 'skills'],
  (s) => s.optional()
);

// ── Bank Details ──────────────────────────────────────────────────────────
const bankDetailsSchema = Joi.object({
  accountHolderName: Joi.string().trim().pattern(ALPHA_SPACE).required()
    .messages({ 'string.pattern.base': 'Account holder name must contain only alphabets and spaces' }),
  accountNumber: Joi.string()
    .pattern(ACCT_NUM)
    .required()
    .messages({ 'string.pattern.base': 'Enter a valid account number (9–18 digits)' }),
  ifscCode: Joi.string()
    .pattern(IFSC_CODE)
    .uppercase()
    .required()
    .messages({ 'string.pattern.base': 'Enter a valid IFSC code (e.g. SBIN0001234)' }),
  bankName: Joi.string().trim().pattern(ALPHA_SPACE).required()
    .messages({ 'string.pattern.base': 'Bank name must contain only alphabets and spaces' }),
  branchName: Joi.string().trim().pattern(ALPHA_SPACE).required()
    .messages({ 'string.pattern.base': 'Branch name must contain only alphabets and spaces' }),
  accountType: Joi.string().valid('savings', 'current').default('savings'),
});

const bankDetailsDraftSchema = bankDetailsSchema.fork(
  ['accountHolderName','accountNumber','ifscCode','bankName','branchName'],
  (s) => s.optional()
);

// ── Admin verification ────────────────────────────────────────────────────
const verificationSchema = Joi.object({
  action: Joi.string().valid('approved','rejected').required(),
  comments: Joi.when('action', {
    is: 'rejected',
    then: Joi.string().min(10).required().messages({
      'string.min':   'Rejection comment must be at least 10 characters',
      'any.required': 'Comment is required when rejecting',
    }),
    otherwise: Joi.string().optional().allow(''),
  }),
});

const documentVerifySchema = Joi.object({
  docType: Joi.string().valid('aadhaar','pan','passbook','passport','resume').required(),
  action:  Joi.string().valid('approved','rejected').required(),
  comments: Joi.when('action', {
    is: 'rejected',
    then: Joi.string().min(5).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
});

// ── Super Admin final review ──────────────────────────────────────────────
const superAdminReviewSchema = Joi.object({
  action: Joi.string().valid('approved','rejected').required(),
  comments: Joi.when('action', {
    is: 'rejected',
    then: Joi.string().min(10).required(),
    otherwise: Joi.string().optional().allow(''),
  }),
});

const createUserSchema = Joi.object({
  email:     Joi.string().email().required(),
  firstName: Joi.string().trim().pattern(ALPHA_SPACE).min(2).max(50).required()
    .messages({ 'string.pattern.base': 'First name must contain only alphabets and spaces' }),
  lastName:  Joi.string().trim().pattern(ALPHA_SPACE).min(2).max(50).required()
    .messages({ 'string.pattern.base': 'Last name must contain only alphabets and spaces' }),
  role:      Joi.string().valid('admin','super_admin', 'intern').default('admin'),
});

const attendanceActionSchema = Joi.object({
  employeeId: Joi.string().hex().length(24).required(),
});

const departmentUpdateSchema = Joi.object({
  profileId: Joi.string().hex().length(24).required(),
  department: Joi.string().trim().min(1).max(80).required()
    .messages({ 'string.empty': 'Department must be selected' }),
});

const positionUpdateSchema = Joi.object({
  profileId: Joi.string().hex().length(24).required(),
  position: Joi.string().valid(...POSITION_OPTIONS).required()
    .messages({ 'any.only': 'Position must be Intern or Full-time' }),
});

const leaveBalanceUpdateSchema = Joi.object({
  total: Joi.number().min(0).optional(),
  used: Joi.number().min(0).optional(),
}).min(1);

const leaveAllocationSchema = Joi.object({
  employeeId: Joi.string().hex().length(24).required(),
  year: Joi.number().integer().min(2020).max(2100).optional(),
  balances: Joi.object({
    earnedLeave: leaveBalanceUpdateSchema.optional(),
    casualLeave: leaveBalanceUpdateSchema.optional(),
    sickLeave: leaveBalanceUpdateSchema.optional(),
    maternityLeave: leaveBalanceUpdateSchema.optional(),
    paternityLeave: leaveBalanceUpdateSchema.optional(),
  }).min(1).required(),
});

const leaveTypeSchema = Joi.string().valid(
  'earned_leave',
  'casual_leave',
  'sick_leave',
  'maternity_leave',
  'paternity_leave',
  'comp_off',
  'lop'
);

const leaveRequestSchema = Joi.object({
  employeeId: Joi.string().hex().length(24).optional(),
  leaveType: leaveTypeSchema.required(),
  fromDate: Joi.date().required(),
  toDate: Joi.date().min(Joi.ref('fromDate')).required(),
  days: Joi.number().min(0.5).optional(),
  reason: Joi.string().trim().min(3).max(1000).optional().allow(''),
});

const leaveDecisionSchema = Joi.object({
  requestId: Joi.string().hex().length(24).required(),
});

const leaveRejectSchema = Joi.object({
  requestId: Joi.string().hex().length(24).required(),
  rejectionReason: Joi.string().trim().min(3).max(1000).required(),
});

const compOffGrantSchema = Joi.object({
  employeeId: Joi.string().hex().length(24).required(),
  days: Joi.number().min(0.5).required(),
  grantedDate: Joi.date().optional(),
  validityDays: Joi.number().integer().min(1).max(365).optional(),
  reason: Joi.string().trim().max(500).optional().allow(''),
});

module.exports = {
  validate,
  PREDEFINED_SKILLS,
  schemas: {
    login:                  loginSchema,
    registerUser:           registerUserSchema,
    registerEmployee:       registerUserSchema,   // backward compat alias
    resetPassword:          resetPasswordSchema,
    personalDetails:        personalDetailsSchema,
    personalDetailsDraft:   personalDetailsDraftSchema,
    educationDetails:       educationDetailsSchema,
    educationDetailsDraft:  educationDetailsDraftSchema,
    careerDetails:          careerDetailsSchema,
    careerDetailsDraft:     careerDetailsDraftSchema,
    bankDetails:            bankDetailsSchema,
    bankDetailsDraft:       bankDetailsDraftSchema,
    verification:           verificationSchema,
    documentVerify:         documentVerifySchema,
    superAdminReview:       superAdminReviewSchema,
    createUser:             createUserSchema,
    attendanceAction:       attendanceActionSchema,
    departmentUpdate:       departmentUpdateSchema,
    positionUpdate:         positionUpdateSchema,
    leaveAllocation:        leaveAllocationSchema,
    leaveRequest:           leaveRequestSchema,
    leaveDecision:          leaveDecisionSchema,
    leaveReject:            leaveRejectSchema,
    compOffGrant:           compOffGrantSchema,
  },
};
