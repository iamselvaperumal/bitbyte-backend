const Notification = require('../models/Notification.model');
const catchAsync = require('../utils/catchAsync');

exports.getNotifications = catchAsync(async (req, res) => {
  const notifications = await Notification.find({ recipientId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.status(200).json({ status: 'success', data: { notifications } });
});

exports.markAsRead = catchAsync(async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { status: 'sent' });
  res.status(200).json({ status: 'success' });
});

exports.createManualNotification = catchAsync(async (req, res) => {
  const { recipientId, type, subject, body } = req.body;
  const notification = await Notification.create({
    recipientId,
    type,
    channel: 'in_app',
    subject,
    body,
    status: 'pending'
  });
  res.status(201).json({ status: 'success', data: { notification } });
});
