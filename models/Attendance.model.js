const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeProfile",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    // Simple check-in/check-out (legacy)
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    status: {
      type: String,
      enum: [
        "present",
        "absent",
        "completed",
        "Present",
        "Absent",
        "Half Day",
        "On Duty",
      ],
      required: true,
      index: true,
    },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Shift-based data (Google Sheets integration)
    shift1CheckIn: { type: String },
    shift1CheckOut: { type: String },
    shift1DurationMinutes: { type: Number },
    shift1WorkedHours: { type: String },
    shift1Result: {
      type: String,
      enum: ["P", "A", "OD", null],
    },

    shift2CheckIn: { type: String },
    shift2CheckOut: { type: String },
    shift2DurationMinutes: { type: Number },
    shift2WorkedHours: { type: String },
    shift2Result: {
      type: String,
      enum: ["P", "A", "OD", null],
    },

    // On Duty flag
    onDutyStatus: { type: String },

    // Overall status (computed from shift results)
    overallStatus: {
      type: String,
      enum: ["Present", "Absent", "Half Day", "On Duty"],
    },

    // Source tracking
    source: {
      type: String,
      enum: ["manual", "google_sheets", "system"],
      default: "system",
    },
  },
  { timestamps: true },
);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
