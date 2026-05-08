const mongoose = require('mongoose');

const salaryComponentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    formula: {
      type: String,
      trim: true,
      maxlength: 180,
      default: '',
    },
    systemGenerated: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true },
);

const payrollSchema = new mongoose.Schema(
  {
    employeeProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeProfile',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    position: {
      type: String,
      trim: true,
      default: '',
    },
    payPeriod: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Pay period must be in YYYY-MM format'],
      index: true,
    },
    paidDays: {
      type: Number,
      required: true,
      min: 0,
    },
    lopDays: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    payDate: {
      type: Date,
      required: true,
      index: true,
    },
    fixedSalary: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    earnings: {
      type: [salaryComponentSchema],
      default: () => [],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'At least one earning component is required',
      },
    },
    deductions: {
      type: [salaryComponentSchema],
      default: () => [],
    },
    grossEarnings: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalDeductions: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    netSalary: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    amountInWords: {
      type: String,
      required: true,
      trim: true,
    },
    calculationMetadata: {
      engine: {
        type: String,
        trim: true,
        default: 'manual-payroll-v1',
      },
      salaryBasis: {
        type: String,
        trim: true,
        default: 'monthly',
      },
      generatedAt: {
        type: Date,
        default: Date.now,
      },
      additionalEarnings: {
        type: Number,
        min: 0,
        default: 0,
      },
      additionalDeductions: {
        type: Number,
        min: 0,
        default: 0,
      },
      rules: {
        type: mongoose.Schema.Types.Mixed,
        default: () => ({}),
      },
    },
    status: {
      type: String,
      enum: ['paid', 'void'],
      default: 'paid',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

payrollSchema.index({ employeeProfileId: 1, payPeriod: 1 }, { unique: true });
payrollSchema.index({ payPeriod: -1, createdAt: -1 });
payrollSchema.index({ employeeName: 'text', employeeId: 'text', department: 'text', position: 'text' });

module.exports = mongoose.model('Payroll', payrollSchema);
