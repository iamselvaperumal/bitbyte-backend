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
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return next(new AppError('Validation failed', 400, errors));
    }
    req[source] = value;
    next();
  };
};

// ── Auth schemas ──────────────────────────────────────────────────────────
const loginSchema = Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

// FIX: role is now accepted so Super Admin can create Admins with correct role
const registerUserSchema = Joi.object({
  email:     Joi.string().email().required(),
  firstName: Joi.string().trim().min(2).max(50).required(),
  lastName:  Joi.string().trim().min(2).max(50).required(),
  // FIX: allow role to be passed explicitly; defaults to employee
  role: Joi.string().valid('employee', 'admin', 'super_admin').default('employee'),
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

// ── Personal Details ──────────────────────────────────────────────────────
const personalDetailsSchema = Joi.object({
  firstName:  Joi.string().trim().min(2).max(50).required(),
  lastName:   Joi.string().trim().min(2).max(50).required(),
  dateOfBirth:Joi.date().max('now').required(),
  // FIX: gender is now Male/Female/Other (radio button values)
  gender: Joi.string().valid('Male', 'Female', 'Other').required(),
  bloodGroup: Joi.string()
    .valid('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
    .required(),
  mobile: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required()
    .messages({ 'string.pattern.base': 'Enter a valid 10-digit Indian mobile number' }),
  alternatePhone: Joi.string().pattern(/^[6-9]\d{9}$/).optional().allow(''),
  // FIX: Aadhaar — exactly 12 digits
  aadhaarNumber: Joi.string()
    .pattern(/^\d{12}$/)
    .required()
    .messages({ 'string.pattern.base': 'Aadhaar must be exactly 12 digits' }),
  // FIX: PAN — standard regex ABCDE1234F
  panNumber: Joi.string()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .uppercase()
    .required()
    .messages({ 'string.pattern.base': 'PAN format must be ABCDE1234F' }),
  address: Joi.object({
    street:  Joi.string().required(),
    city:    Joi.string().required(),
    state:   Joi.string().required(),
    pincode: Joi.string().pattern(/^\d{6}$/).required(),
    country: Joi.string().default('India'),
  }).required(),
  permanentAddress: Joi.object({
    street:  Joi.string().required(),
    city:    Joi.string().required(),
    state:   Joi.string().required(),
    pincode: Joi.string().pattern(/^\d{6}$/).required(),
    country: Joi.string().default('India'),
  }).required(),
  sameAsCurrent: Joi.boolean().default(false),
  emergencyContact: Joi.object({
    name:         Joi.string().required(),
    relationship: Joi.string().required(),
    mobile:       Joi.string().pattern(/^[6-9]\d{9}$/).required(),
  }).required(),
});

// FIX: partial personal details for draft save (no required constraints)
const personalDetailsDraftSchema = personalDetailsSchema.fork(
  ['firstName','lastName','dateOfBirth','gender','bloodGroup','mobile',
   'aadhaarNumber','panNumber','address','emergencyContact'],
  (s) => s.optional()
);

// ── Education Details ─────────────────────────────────────────────────────
const educationDetailsSchema = Joi.object({
  // FIX: educationLevel dropdown
  educationLevel: Joi.string().valid('UG','PG','Diploma','HSC','SSLC').required(),
  highestDegree:        Joi.string().required(),
  specialization:       Joi.string().required(),
  collegeName:          Joi.string().required(),
  university:           Joi.string().required(),
  yearOfPassing:        Joi.number().min(1980).max(new Date().getFullYear()).required(),
  percentage:           Joi.number().min(0).max(100).required(),
  totalExperienceYears: Joi.number().min(0).default(0),
  previousEmployer:     Joi.string().allow('').optional(),
  previousDesignation:  Joi.string().allow('').optional(),
  previousCTC:          Joi.number().min(0).optional(),
  expectedCTC:          Joi.number().min(0).required(),
  noticePeriodDays:     Joi.number().min(0).default(0),
  skills:               Joi.array().items(Joi.string()).min(1).required(),
});

const educationDetailsDraftSchema = educationDetailsSchema.fork(
  ['educationLevel','highestDegree','specialization','collegeName',
   'university','yearOfPassing','percentage','expectedCTC','skills'],
  (s) => s.optional()
);

// ── Bank Details ──────────────────────────────────────────────────────────
const bankDetailsSchema = Joi.object({
  accountHolderName: Joi.string().required(),
  accountNumber: Joi.string()
    .pattern(/^\d{9,18}$/)
    .required()
    .messages({ 'string.pattern.base': 'Enter a valid account number (9–18 digits)' }),
  ifscCode: Joi.string()
    .pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)
    .required()
    .messages({ 'string.pattern.base': 'Enter a valid IFSC code' }),
  bankName:   Joi.string().required(),
  branchName: Joi.string().required(),
  accountType:Joi.string().valid('savings','current').default('savings'),
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

// FIX: per-document verify (aadhaar/pan/passbook/passport)
const documentVerifySchema = Joi.object({
  docType: Joi.string().valid('aadhaar','pan','passbook','passport').required(),
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

// FIX: role creation schema (used by Super Admin to create admin accounts)
const createUserSchema = Joi.object({
  email:     Joi.string().email().required(),
  firstName: Joi.string().trim().min(2).max(50).required(),
  lastName:  Joi.string().trim().min(2).max(50).required(),
  role:      Joi.string().valid('admin','super_admin').default('admin'),
});

module.exports = {
  validate,
  schemas: {
    login:                  loginSchema,
    registerUser:           registerUserSchema,
    registerEmployee:       registerUserSchema,   // backward compat alias
    resetPassword:          resetPasswordSchema,
    personalDetails:        personalDetailsSchema,
    personalDetailsDraft:   personalDetailsDraftSchema,
    educationDetails:       educationDetailsSchema,
    educationDetailsDraft:  educationDetailsDraftSchema,
    bankDetails:            bankDetailsSchema,
    bankDetailsDraft:       bankDetailsDraftSchema,
    verification:           verificationSchema,
    documentVerify:         documentVerifySchema,
    superAdminReview:       superAdminReviewSchema,
    createUser:             createUserSchema,
  },
};
