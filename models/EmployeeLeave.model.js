const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    remaining: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const compOffGrantSchema = new mongoose.Schema(
  {
    days: { type: Number, required: true, min: 0.5 },
    usedDays: { type: Number, default: 0, min: 0 },
    used: { type: Boolean, default: false },
    expired: { type: Boolean, default: false },
    grantedDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true },
    reason: { type: String, trim: true, maxlength: 500 },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const employeeLeaveSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeProfile',
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    earnedLeave: { type: leaveBalanceSchema, default: () => ({}) },
    casualLeave: { type: leaveBalanceSchema, default: () => ({}) },
    sickLeave: { type: leaveBalanceSchema, default: () => ({}) },
    maternityLeave: { type: leaveBalanceSchema, default: () => ({}) },
    paternityLeave: { type: leaveBalanceSchema, default: () => ({}) },
    compOff: { type: [compOffGrantSchema], default: () => [] },
    lopDays: { type: Number, default: 0, min: 0 },
    lastPolicyResetAt: { type: Date },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

employeeLeaveSchema.index({ employeeId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('EmployeeLeave', employeeLeaveSchema);
