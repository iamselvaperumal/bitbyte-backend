const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middlewares/auth.middleware');
const catchAsync = require('../utils/catchAsync');
const EmployeeProfile = require('../models/EmployeeProfile.model');
const User = require('../models/User.model');

router.use(protect);
router.use(authorize('admin', 'super_admin'));

// Weekly registrations
router.get(
  '/weekly',
  catchAsync(async (req, res) => {
    const data = await EmployeeProfile.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.status(200).json({ status: 'success', data });
  })
);

// Monthly registrations
router.get(
  '/monthly',
  catchAsync(async (req, res) => {
    const data = await EmployeeProfile.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.status(200).json({ status: 'success', data });
  })
);

// Status distribution
router.get(
  '/status-distribution',
  catchAsync(async (req, res) => {
    const data = await EmployeeProfile.aggregate([
      { $group: { _id: '$overallStatus', count: { $sum: 1 } } },
    ]);
    res.status(200).json({ status: 'success', data });
  })
);

// Summary counts
router.get(
  '/summary',
  catchAsync(async (req, res) => {
    const [employees, admins, profileStats] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      User.countDocuments({ role: 'admin' }),
      EmployeeProfile.aggregate([
        { $group: { _id: '$overallStatus', count: { $sum: 1 } } },
      ]),
    ]);

    const statusMap = profileStats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    res.status(200).json({
      status: 'success',
      data: {
        totalEmployees: employees,
        totalAdmins: admins,
        approved: statusMap.approved || 0,
        pending:
          (statusMap.form_submitted || 0) +
          (statusMap.under_review || 0) +
          (statusMap.under_super_admin_review || 0),
        rejected: statusMap.rejected || 0,
      },
    });
  })
);

module.exports = router;
