const User = require('../models/User.model');
const EmployeeProfile = require('../models/EmployeeProfile.model');
const Notification = require('../models/Notification.model');
const { generateToken } = require('../middlewares/auth.middleware');
const emailService = require('./email.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const generateTempPassword = () => {
  const upper   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower   = 'abcdefghijklmnopqrstuvwxyz';
  const digits  = '0123456789';
  const special = '@$!%*?&';
  const all     = upper + lower + digits + special;

  let pwd = '';
  pwd += upper  [Math.floor(Math.random() * upper.length)];
  pwd += lower  [Math.floor(Math.random() * lower.length)];
  pwd += digits [Math.floor(Math.random() * digits.length)];
  pwd += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < 10; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
};

class AuthService {
  async login(email, password) {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      throw new AppError('Invalid email or password', 401);
    }
    if (user.status !== 'active') {
      throw new AppError('Your account is suspended. Contact HR.', 403);
    }
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
    const token  = generateToken(user._id);
    const userObj = user.toObject();
    delete userObj.password;
    return { token, user: userObj };
  }

  // FIX: role is now explicitly passed — no longer hardcoded to 'employee'
  // This fixes the bug where admins were created with role='employee'
  async registerUser(data, createdBy) {
    const { email, firstName, lastName, role = 'employee' } = data;

    const existing = await User.findOne({ email });
    if (existing) throw new AppError('An account with this email already exists', 409);

    const tempPassword = generateTempPassword();

    const user = await User.create({
      email,
      password: tempPassword,
      firstName,
      lastName,
      role,                          // FIX: use the supplied role
      isFirstLogin: true,
      status: 'active',
      createdBy: createdBy || null,
    });

    // Only create an EmployeeProfile for employees and interns
    if (role === 'employee' || role === 'intern') {
      await EmployeeProfile.create({ userId: user._id });
    }

    const notification = await Notification.create({
      recipientId: user._id,
      type: 'registration_credentials',
      channel: 'email',
      subject: 'Your Login Credentials',
      metadata: { email, tempPassword, firstName },
    });

    emailService
      .sendRegistrationCredentials({ to: email, firstName, email, tempPassword })
      .then(() =>
        Notification.findByIdAndUpdate(notification._id, { status: 'sent', sentAt: new Date() }).exec()
      )
      .catch((err) => {
        logger.error(`Registration email failed: ${err.message}`);
        Notification.findByIdAndUpdate(notification._id, {
          status: 'failed', failureReason: err.message,
        }).exec();
      });

    const userObj = user.toObject();
    delete userObj.password;
    return { user: userObj, tempPassword };
  }

  // Backward-compat alias used by old code paths
  async registerEmployee(data, createdBy) {
    return this.registerUser({ ...data, role: 'employee' }, createdBy);
  }

  async resetPassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new AppError('User not found', 404);
    if (!(await user.comparePassword(currentPassword))) {
      throw new AppError('Current password is incorrect', 401);
    }
    if (currentPassword === newPassword) {
      throw new AppError('New password must be different from current password', 400);
    }
    user.password    = newPassword;
    user.isFirstLogin = false;
    await user.save();
    const token = generateToken(user._id);
    return { token };
  }

  async getMe(userId) {
    const user = await User.findById(userId).lean();
    if (!user) throw new AppError('User not found', 404);
    return user;
  }
}

module.exports = new AuthService();
