const Attendance = require('../models/Attendance.model');
const EmployeeProfile = require('../models/EmployeeProfile.model');
const AppError = require('../utils/AppError');

const getToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatEmployeeName = (user = {}) =>
  `${user.firstName || ''} ${user.lastName || ''}`.trim();

class AttendanceService {
  async getEmployeeProfile(employeeId) {
    const profile = await EmployeeProfile.findOne({
      _id: employeeId,
      isDeleted: false,
      overallStatus: 'approved',
    }).populate('userId', 'firstName lastName email');

    if (!profile) {
      throw new AppError('Approved employee profile not found.', 404);
    }

    return profile;
  }

  async checkIn(employeeId, markedBy) {
    await this.getEmployeeProfile(employeeId);
    const today = getToday();

    const existing = await Attendance.findOne({ employeeId, date: today });
    if (existing) {
      throw new AppError('Attendance already recorded for this employee today.', 400);
    }

    return Attendance.create({
      employeeId,
      date: today,
      checkInTime: new Date(),
      status: 'present',
      markedBy,
    });
  }

  async checkOut(employeeId, markedBy) {
    await this.getEmployeeProfile(employeeId);
    const today = getToday();

    const attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance || !attendance.checkInTime) {
      throw new AppError('Cannot check out before check-in.', 400);
    }
    if (attendance.status === 'completed') {
      throw new AppError('Check-out has already been completed for today.', 400);
    }
    if (attendance.status === 'absent') {
      throw new AppError('Cannot check out an employee marked absent.', 400);
    }

    attendance.checkOutTime = new Date();
    attendance.status = 'completed';
    attendance.markedBy = markedBy;
    await attendance.save();
    return attendance;
  }

  async markAbsent(employeeId, markedBy) {
    await this.getEmployeeProfile(employeeId);
    const today = getToday();

    const existing = await Attendance.findOne({ employeeId, date: today });
    if (existing) {
      throw new AppError('Attendance already recorded for this employee today.', 400);
    }

    return Attendance.create({
      employeeId,
      date: today,
      status: 'absent',
      markedBy,
    });
  }

  async getTodayAttendance() {
    const today = getToday();

    const [employees, attendanceRecords] = await Promise.all([
      EmployeeProfile.find({ overallStatus: 'approved', isDeleted: false })
        .populate('userId', 'firstName lastName email')
        .sort({ employeeId: 1, updatedAt: -1 })
        .lean(),
      Attendance.find({ date: today }).lean(),
    ]);

    const attendanceByEmployee = new Map(
      attendanceRecords.map((record) => [String(record.employeeId), record])
    );

    return {
      date: today,
      employees: employees.map((profile) => {
        const attendance = attendanceByEmployee.get(String(profile._id));
        return {
          profileId: profile._id,
          employeeId: profile.employeeId,
          employeeName: formatEmployeeName(profile.userId),
          email: profile.userId?.email,
          department: profile.department,
          position: profile.position,
          appliedPosition: profile.appliedPosition,
          attendance,
          status: attendance?.status || 'not_marked',
          checkInTime: attendance?.checkInTime,
          checkOutTime: attendance?.checkOutTime,
        };
      }),
    };
  }
}

module.exports = new AttendanceService();
