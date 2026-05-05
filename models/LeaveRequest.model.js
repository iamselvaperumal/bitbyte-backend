const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeProfile',
      required: true,
      index: true,
    },
    leaveType: {
      type: String,
      enum: [
        'earned_leave',
        'casual_leave',
        'sick_leave',
        'maternity_leave',
        'paternity_leave',
        'comp_off',
        'lop',
      ],
      required: true,
      index: true,
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    payableDays: { type: Number, default: 0, min: 0 },
    lopDays: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reason: { type: String, trim: true, maxlength: 1000 },
    rejectionReason: { type: String, trim: true, maxlength: 1000 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

leaveRequestSchema.index({ employeeId: 1, fromDate: 1, toDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
