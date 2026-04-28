const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');

// ── Verify JWT ────────────────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to access this resource.', 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('+password');
    if (!user) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    if (user.status !== 'active') {
      return next(new AppError('Your account has been suspended. Contact HR.', 403));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// ── Role-based authorization ──────────────────────────────────────────────
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(`Access denied. Required role: ${roles.join(' or ')}`, 403)
      );
    }
    next();
  };
};

// ── First login guard - force password reset ──────────────────────────────
exports.checkFirstLogin = (req, res, next) => {
  if (req.user.isFirstLogin) {
    return res.status(403).json({
      status: 'fail',
      code: 'FIRST_LOGIN_RESET_REQUIRED',
      message: 'Password reset required before accessing this resource.',
    });
  }
  next();
};

// ── Generate JWT ──────────────────────────────────────────────────────────
exports.generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};
