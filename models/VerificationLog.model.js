const mongoose = require('mongoose');

const verificationLogSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeProfile',
      required: true,
      index: true,
    },
    section: {
      type: String,
      enum: ['personal', 'education', 'bank', 'documents', 'overall'],
      required: true,
    },
    action: {
      type: String,
      enum: [
        'submitted',
        'approved',
        'rejected',
        'resubmitted',
        'forwarded_to_super_admin',
        'final_approved',
        'final_rejected',
        'employee_id_generated',
      ],
      required: true,
    },
    previousStatus: { type: String },
    newStatus: { type: String },
    comments: { type: String, trim: true },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    verifierRole: {
      type: String,
      enum: ['employee', 'admin', 'super_admin'],
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,  // flexible extra info (employeeId generated, etc.)
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
verificationLogSchema.index({ employeeId: 1, section: 1, createdAt: -1 });
verificationLogSchema.index({ verifiedBy: 1, createdAt: -1 });
verificationLogSchema.index({ action: 1, createdAt: -1 });

// ─── Static: get full audit trail for an employee ────────────────────────────
verificationLogSchema.statics.getAuditTrail = function (employeeId) {
  return this.find({ employeeId })
    .sort({ createdAt: -1 })
    .populate('verifiedBy', 'firstName lastName email role')
    .lean();
};

module.exports = mongoose.model('VerificationLog', verificationLogSchema);
