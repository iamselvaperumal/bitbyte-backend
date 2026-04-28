const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');

// All user routes require authentication
router.use(protect);

// Super admin: list all users
router.get(
  '/',
  authorize('super_admin'),
  catchAsync(async (req, res) => {
    const { role, status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  })
);

// Get single user
router.get(
  '/:id',
  authorize('super_admin', 'admin'),
  catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) throw new AppError('User not found', 404);
    res.status(200).json({ status: 'success', data: { user } });
  })
);

// Update user status (super admin only)
router.patch(
  '/:id/status',
  authorize('super_admin'),
  catchAsync(async (req, res) => {
    const { status } = req.body;
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      throw new AppError('Invalid status value', 400);
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) throw new AppError('User not found', 404);
    res.status(200).json({ status: 'success', data: { user } });
  })
);

// Soft delete user
router.delete(
  '/:id',
  authorize('super_admin'),
  catchAsync(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found', 404);
    await user.softDelete();
    res.status(200).json({ status: 'success', message: 'User deleted successfully.' });
  })
);

module.exports = router;
