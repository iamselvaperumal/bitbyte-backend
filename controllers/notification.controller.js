const mongoose = require('mongoose');
const Notification = require('../models/Notification.model');
const catchAsync = require('../utils/catchAsync');

exports.getNotifications = catchAsync(async (req, res) => {
  // Ensure we are querying by ObjectId for maximum compatibility
  const recipientId = new mongoose.Types.ObjectId(req.user._id);
  
  const notifications = await Notification.find({ recipientId })
    .sort({ createdAt: -1 })
    .limit(50);
  res.status(200).json({ status: 'success', data: { notifications } });
});

exports.markAsRead = catchAsync(async (req, res) => {
  // FIX: Delete notification on view as requested
  await Notification.findByIdAndDelete(req.params.id);
  res.status(200).json({ status: 'success' });
});

exports.createManualNotification = catchAsync(async (req, res) => {
  const { recipientId, type, subject, body } = req.body;
  const notification = await Notification.create({
    recipientId: recipientId || req.user._id,
    type: type || 'test_notification',
    channel: 'in_app',
    subject: subject || '🔔 Test Notification',
    body: body || 'This is a test notification to verify that the system is working correctly.',
    status: 'pending'
  });
  res.status(201).json({ status: 'success', data: { notification } });
});
