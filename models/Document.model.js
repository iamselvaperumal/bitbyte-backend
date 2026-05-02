const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    originalName: { type: String },
    fileName: { type: String },
    fileUrl: { type: String },
    publicId: { type: String },
    mimeType: { type: String },
    sizeBytes: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// FIX: Per-document verification status sub-schema
const docVerificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    comments: { type: String, trim: true },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    viewedAt: { type: Date }, // FIX: track when admin first viewed the doc
  },
  { _id: false },
);

const documentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    employeeProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeProfile",
      index: true,
    },

    // ── Document files ────────────────────────────────────────────────────
    aadhaar: { type: fileSchema, default: null },
    pan: { type: fileSchema, default: null },
    passbook: { type: fileSchema, default: null },
    passport: { type: fileSchema, default: null },
    resume: { type: fileSchema, default: null },

    // FIX: Per-document verification status — initialize with pending status
    aadhaarStatus: { type: docVerificationSchema, default: () => ({ status: "pending" }) },
    panStatus: { type: docVerificationSchema, default: () => ({ status: "pending" }) },
    passbookStatus: { type: docVerificationSchema, default: () => ({ status: "pending" }) },
    passportStatus: { type: docVerificationSchema, default: () => ({ status: "pending" }) },
    resumeStatus: { type: docVerificationSchema, default: () => ({ status: "pending" }) },

    submittedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// FIX: Mandatory completeness checks all 3 required docs
// Inside Document.model.js
documentSchema.virtual("isMandatoryComplete").get(function () {
  return !!(
    this.aadhaar?.fileUrl &&
    this.pan?.fileUrl &&
    this.passbook?.fileUrl &&
    this.resume?.fileUrl
  );
});

// FIX: All required docs admin-approved
documentSchema.virtual("allRequiredApproved").get(function () {
  return (
    this.aadhaarStatus?.status === "approved" &&
    this.panStatus?.status === "approved" &&
    this.passbookStatus?.status === "approved" &&
    this.resumeStatus?.status === "approved"
  );
});

documentSchema.methods.getUploadedDocs = function () {
  const docs = {};
  if (this.aadhaar) docs.aadhaar = this.aadhaar;
  if (this.pan) docs.pan = this.pan;
  if (this.passbook) docs.passbook = this.passbook;
  if (this.passport) docs.passport = this.passport;
  if (this.resume) docs.resume = this.resume;
  return docs;
};

module.exports = mongoose.model("Document", documentSchema);
