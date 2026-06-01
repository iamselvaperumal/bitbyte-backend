const Attendance = require("../models/Attendance.model");
const EmployeeProfile = require("../models/EmployeeProfile.model");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

const getToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatEmployeeName = (user = {}) =>
  `${user.firstName || ""} ${user.lastName || ""}`.trim();

class AttendanceService {
  async getEmployeeProfile(employeeId) {
    const profile = await EmployeeProfile.findOne({
      _id: employeeId,
      isDeleted: false,
      overallStatus: "approved",
    }).populate("userId", "firstName lastName email");

    if (!profile) {
      throw new AppError("Approved employee profile not found.", 404);
    }

    return profile;
  }

  async checkIn(employeeId, markedBy) {
    await this.getEmployeeProfile(employeeId);
    const today = getToday();

    const existing = await Attendance.findOne({ employeeId, date: today });
    if (existing) {
      throw new AppError(
        "Attendance already recorded for this employee today.",
        400,
      );
    }

    return Attendance.create({
      employeeId,
      date: today,
      checkInTime: new Date(),
      status: "present",
      markedBy,
    });
  }

  async checkOut(employeeId, markedBy) {
    await this.getEmployeeProfile(employeeId);
    const today = getToday();

    const attendance = await Attendance.findOne({ employeeId, date: today });
    if (!attendance || !attendance.checkInTime) {
      throw new AppError("Cannot check out before check-in.", 400);
    }
    if (attendance.status === "completed") {
      throw new AppError(
        "Check-out has already been completed for today.",
        400,
      );
    }
    if (attendance.status === "absent") {
      throw new AppError("Cannot check out an employee marked absent.", 400);
    }

    attendance.checkOutTime = new Date();
    attendance.status = "completed";
    attendance.markedBy = markedBy;
    await attendance.save();
    return attendance;
  }

  async markAbsent(employeeId, markedBy) {
    await this.getEmployeeProfile(employeeId);
    const today = getToday();

    const existing = await Attendance.findOne({ employeeId, date: today });
    if (existing) {
      throw new AppError(
        "Attendance already recorded for this employee today.",
        400,
      );
    }

    return Attendance.create({
      employeeId,
      date: today,
      status: "absent",
      markedBy,
    });
  }

  async getTodayAttendance() {
    const today = getToday();

    const [employees, attendanceRecords] = await Promise.all([
      EmployeeProfile.find({ overallStatus: "approved", isDeleted: false })
        .populate("userId", "firstName lastName email")
        .sort({ employeeId: 1, updatedAt: -1 })
        .lean(),
      Attendance.find({ date: today }).lean(),
    ]);

    const attendanceByEmployee = new Map(
      attendanceRecords.map((record) => [String(record.employeeId), record]),
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
          status: attendance?.status || "not_marked",
          checkInTime: attendance?.checkInTime,
          checkOutTime: attendance?.checkOutTime,
        };
      }),
    };
  }

  /**
   * Save shift-based attendance data from Google Sheets to database
   * @param {Object} data - Attendance data with shift information
   * @param {string} data.employeeId - Employee ID from Google Sheets
   * @param {string} data.date - Attendance date (YYYY-MM-DD format)
   * @param {string} data.shift1CheckIn - Shift 1 check-in time
   * @param {string} data.shift1CheckOut - Shift 1 check-out time
   * @param {number} data.shift1DurationMinutes - Shift 1 duration in minutes
   * @param {string} data.shift1WorkedHours - Shift 1 worked hours formatted
   * @param {string} data.shift1Result - Shift 1 result (P/A/OD)
   * @param {string} data.shift2CheckIn - Shift 2 check-in time
   * @param {string} data.shift2CheckOut - Shift 2 check-out time
   * @param {number} data.shift2DurationMinutes - Shift 2 duration in minutes
   * @param {string} data.shift2WorkedHours - Shift 2 worked hours formatted
   * @param {string} data.shift2Result - Shift 2 result (P/A/OD)
   * @param {string} data.onDutyStatus - On duty status flag
   * @param {string} data.overallStatus - Overall attendance status
   * @returns {Promise<Object>} Saved attendance document
   */
  async saveShiftBasedAttendance(data) {
    try {
      // Parse date if it's a string
      let attendanceDate = data.date;
      if (typeof attendanceDate === "string") {
        // Handle DD-MM-YYYY format from Google Sheets
        const dateMatch = attendanceDate.match(
          /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/,
        );
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          attendanceDate = new Date(year, parseInt(month) - 1, parseInt(day));
        } else {
          attendanceDate = new Date(attendanceDate);
        }
      }
      attendanceDate.setHours(0, 0, 0, 0);

      // Find employee profile by employeeId field
      const profile = await EmployeeProfile.findOne({
        employeeId: data.employeeId,
        isDeleted: false,
        overallStatus: "approved",
      });

      if (!profile) {
        logger.warn(`[Attendance] Employee not found: ${data.employeeId}`);
        return null;
      }

      // Upsert attendance record
      const attendance = await Attendance.findOneAndUpdate(
        { employeeId: profile._id, date: attendanceDate },
        {
          employeeId: profile._id,
          date: attendanceDate,
          shift1CheckIn: data.shift1CheckIn || "",
          shift1CheckOut: data.shift1CheckOut || "",
          shift1DurationMinutes: data.shift1DurationMinutes,
          shift1WorkedHours: data.shift1WorkedHours || "",
          shift1Result: data.shift1Result || "A",
          shift2CheckIn: data.shift2CheckIn || "",
          shift2CheckOut: data.shift2CheckOut || "",
          shift2DurationMinutes: data.shift2DurationMinutes,
          shift2WorkedHours: data.shift2WorkedHours || "",
          shift2Result: data.shift2Result || "A",
          onDutyStatus: data.onDutyStatus || "",
          status: data.overallStatus || "Absent",
          overallStatus: data.overallStatus || "Absent",
          source: "google_sheets",
        },
        { upsert: true, new: true },
      );

      logger.debug(
        `[Attendance] Saved shift data for ${data.employeeId} on ${attendanceDate.toISOString()}`,
        {
          shift1Result: data.shift1Result,
          shift2Result: data.shift2Result,
          overallStatus: data.overallStatus,
        },
      );

      return attendance;
    } catch (error) {
      logger.error(
        `[Attendance] Error saving shift-based attendance: ${error.message}`,
        {
          data,
          error: error.toString(),
        },
      );
      throw error;
    }
  }

  /**
   * Bulk save attendance records from Google Sheets
   * @param {Array} records - Array of attendance records
   * @returns {Promise<Object>} Summary of saved records
   */
  async bulkSaveShiftAttendance(records) {
    let saved = 0;
    let failed = 0;
    const errors = [];

    for (const record of records) {
      try {
        await this.saveShiftBasedAttendance(record);
        saved += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          employeeId: record.employeeId,
          date: record.date,
          error: error.message,
        });
      }
    }

    logger.info(
      `[Attendance] Bulk save completed: ${saved} saved, ${failed} failed`,
    );

    return {
      saved,
      failed,
      errors,
      total: records.length,
    };
  }
}

module.exports = new AttendanceService();
