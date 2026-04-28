const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'registration_credentials',
        'section_approved',
        'section_rejected',
        'forwarded_to_super_admin',
        'final_approved',
        'final_rejected',
        'employee_id_generated',
        'password_reset',
      ],
      required: true,
    },
    channel: {
      type: String,
      enum: ['email', 'in_app'],
      default: 'email',
    },
    subject: { type: String },
    body: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
      index: true,
    },
    sentAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipientId: 1, status: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
