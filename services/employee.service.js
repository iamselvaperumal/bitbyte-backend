const EmployeeProfile = require("../models/EmployeeProfile.model");
const Document = require("../models/Document.model");
const VerificationLog = require("../models/VerificationLog.model");
const AppError = require("../utils/AppError");

const assertSectionEditable = (profile, section) => {
  const status = profile.verificationStatus[section]?.status;
  if (status === "approved") {
    throw new AppError(
      `${section} section is already approved and cannot be edited.`,
      403,
    );
  }
};

const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "object") return Object.values(value).some(hasValue);
  return true;
};

const getPathValue = (source, path) =>
  path.split(".").reduce((current, key) => current?.[key], source);

const mergeSectionData = (saved = {}, draft = {}) => ({
  ...(saved?.toObject?.() || saved || {}),
  ...(draft || {}),
});

const requiredSectionPaths = {
  personal: [
    "firstName",
    "lastName",
    "dateOfBirth",
    "gender",
    "bloodGroup",
    "mobile",
    "aadhaarNumber",
    "panNumber",
    "address.houseNo",
    "address.street",
    "address.city",
    "address.state",
    "address.pincode",
    "emergencyContact.name",
    "emergencyContact.relationship",
    "emergencyContact.mobile",
  ],
  // Education is an array — we check length > 0 separately
  bank: [
    "accountHolderName",
    "accountNumber",
    "ifscCode",
    "bankName",
    "branchName",
  ],
};

const assertSectionDetailsComplete = (section, data) => {
  if (section === "education") {
    // Education must have at least 1 entry
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new AppError(
        "Education details are incomplete. At least one education entry is required.",
        400,
      );
    }
    return;
  }

  if (section === "career") {
    if (!data || !data.type) {
      throw new AppError(
        "Career details are incomplete. Career type (fresher/experienced) is required.",
        400,
      );
    }
    if (!data.expectedCTC && data.expectedCTC !== 0) {
      throw new AppError(
        "Career details are incomplete. Expected CTC is required.",
        400,
      );
    }
    if (data.type === "experienced") {
      const missing = ["companyName", "position"].filter((f) => !hasValue(data[f]));
      if (missing.length) {
        throw new AppError(
          `Career details are incomplete. Missing: ${missing.join(", ")}.`,
          400,
        );
      }
    }
    return;
  }

  const paths = requiredSectionPaths[section];
  if (!paths) return;

  const missing = paths.filter((path) => !hasValue(getPathValue(data, path)));
  if (missing.length) {
    throw new AppError(
      `${section} details are incomplete. Save all required fields before submitting.`,
      400,
    );
  }
};

class EmployeeProfileService {
  // ── Get full profile ──────────────────────────────────────────────────
  async getProfile(userId) {
    const profile = await EmployeeProfile.findOne({ userId })
      .populate("userId", "email firstName lastName role")
      .lean();
    if (!profile) throw new AppError("Profile not found", 404);

    const documents = await Document.findOne({ userId }).lean();
    return { profile, documents };
  }

  async getOnboardingStatus(userId) {
    const profile = await EmployeeProfile.findOne({ userId })
      .select(
        "overallStatus onboardingStatus verificationStatus employeeId isDraft",
      )
      .lean();
    if (!profile) throw new AppError("Profile not found", 404);
    return profile;
  }

  // ── Draft save (partial — no validation enforcement) ──────────────────
  async saveDraft(userId, section, data) {
    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);

    profile.draftData = { ...profile.draftData, [section]: data };
    profile.isDraft = true;
    if (profile.overallStatus === "registered") {
      profile.overallStatus = "form_in_progress";
    }
    await profile.save();
    return profile;
  }

  // ── Get draft ─────────────────────────────────────────────────────────
  async getDraft(userId) {
    const profile = await EmployeeProfile.findOne({ userId })
      .select(
        "draftData isDraft personalDetails educationDetails careerDetails bankDetails verificationStatus overallStatus",
      )
      .lean();
    if (!profile) throw new AppError("Profile not found", 404);
    return profile;
  }

  // ── Save Personal Details ─────────────────────────────────────────────
  async savePersonalDetails(userId, data) {
    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);
    assertSectionEditable(profile, "personal");

    // Uppercase PAN before storing
    if (data.panNumber) data.panNumber = data.panNumber.toUpperCase();

    profile.personalDetails = {
      ...(profile.personalDetails.toObject?.() || profile.personalDetails),
      ...data,
    };
    if (profile.overallStatus === "registered")
      profile.overallStatus = "form_in_progress";
    profile.isDraft = false;
    await profile.save();
    return profile;
  }

  // ── Save Education Details (array) ────────────────────────────────────
  async saveEducationDetails(userId, data) {
    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);
    assertSectionEditable(profile, "education");

    // data.education is an array of education entries
    const educationArray = Array.isArray(data.education)
      ? data.education
      : Array.isArray(data)
        ? data
        : [];

    profile.educationDetails = educationArray;
    await profile.save();
    return profile;
  }

  // ── Save Career Details ───────────────────────────────────────────────
  async saveCareerDetails(userId, data) {
    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);

    // If fresher, strip experience fields to prevent data injection
    if (data.type === "fresher") {
      delete data.companyName;
      delete data.position;
      delete data.previousCTC;
    }

    profile.careerDetails = {
      ...(profile.careerDetails?.toObject?.() || profile.careerDetails || {}),
      ...data,
    };
    await profile.save();
    return profile;
  }

  // ── Save Bank Details ─────────────────────────────────────────────────
  async saveBankDetails(userId, data) {
    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);
    assertSectionEditable(profile, "bank");

    // Uppercase IFSC before storing
    if (data.ifscCode) data.ifscCode = data.ifscCode.toUpperCase();

    profile.bankDetails = {
      ...(profile.bankDetails.toObject?.() || profile.bankDetails),
      ...data,
    };
    await profile.save();
    return profile;
  }

  // ── Upload Documents ──────────────────────────────────────────────────
  async uploadDocuments(userId, files) {
    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);
    assertSectionEditable(profile, "documents");

    let docRecord = await Document.findOne({ userId });
    if (!docRecord) {
      docRecord = await Document.create({
        userId,
        employeeProfileId: profile._id,
      });
    }

    const fieldMap = {
      aadhaar: files.aadhaar?.[0],
      pan: files.pan?.[0],
      passbook: files.passbook?.[0],
      passport: files.passport?.[0],
    };

    for (const [field, file] of Object.entries(fieldMap)) {
      if (!file) continue;
      docRecord[field] = {
        originalName: file.originalname,
        fileName: file.filename,
        fileUrl: file.path,
        publicId: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedAt: new Date(),
      };
      const statusKey = `${field}Status`;
      if (docRecord[statusKey]) {
        docRecord[statusKey].status = "pending";
      }
    }

    await docRecord.save();
    return { profile, documents: docRecord };
  }

  // ── Submit a section ──────────────────────────────────────────────────
  async submitSection(userId, section) {
    const validSections = ["personal", "education", "career", "bank", "documents"];
    if (!validSections.includes(section)) {
      throw new AppError(`Invalid section: ${section}`, 400);
    }

    const profile = await EmployeeProfile.findOne({ userId });
    if (!profile) throw new AppError("Profile not found", 404);

    if (profile.overallStatus === "approved") {
      throw new AppError(
        "Onboarding is already completed. No changes allowed.",
        403,
      );
    }

    if (section === "documents") {
      const docs = await Document.findOne({ userId });

      const missingDocs = [
        ["aadhaar", "Aadhaar"],
        ["pan", "PAN"],
        ["passbook", "Passbook"],
      ].filter(([field]) => !docs?.[field]?.fileUrl);

      if (!docs || missingDocs.length) {
        throw new AppError(
          `${missingDocs.map(([, label]) => label).join(", ")} ${
            missingDocs.length === 1 ? "is" : "are"
          } required before submitting.`,
          400,
        );
      }

      docs.submittedAt = new Date();
      await docs.save();
    }

    if (section !== "documents") {
      let sectionData;

      if (section === "education") {
        // education is an array
        const saved = profile.educationDetails || [];
        const draft = profile.draftData?.education;
        sectionData = (saved.length > 0 ? saved : draft) || [];
        assertSectionDetailsComplete(section, sectionData);
        profile.educationDetails = sectionData;
      } else if (section === "career") {
        const saved = profile.careerDetails || {};
        const draft = profile.draftData?.career || {};
        sectionData = { ...(saved.toObject?.() || saved), ...draft };
        assertSectionDetailsComplete(section, sectionData);
        profile.careerDetails = sectionData;
      } else {
        const detailsKey = `${section}Details`;
        sectionData = mergeSectionData(
          profile[detailsKey],
          profile.draftData?.[section],
        );
        assertSectionDetailsComplete(section, sectionData);
        profile[detailsKey] = sectionData;
      }
    }

    // Map career -> education slot in verificationStatus (career shares 'education' section)
    const vsSection = section === 'career' ? 'education' : section;

    const currentStatus = profile.verificationStatus[vsSection]?.status;
    if (!currentStatus || !["pending", "rejected"].includes(currentStatus)) {
      throw new AppError(`Section is already ${currentStatus || 'unknown'}.`, 400);
    }

    const previousStatus = currentStatus;
    profile.verificationStatus[vsSection].status = "submitted";
    profile.verificationStatus[vsSection].submittedAt = new Date();

    const allSubmitted = ["personal", "education", "bank", "documents"].every(
      (s) =>
        ["submitted", "under_review", "approved"].includes(
          profile.verificationStatus[s].status,
        ),
    );
    if (allSubmitted) {
      profile.overallStatus = "form_submitted";
      profile.onboardingStatus = "completed";
    }

    await profile.save();

    await VerificationLog.create({
      employeeId: userId,
      employeeProfileId: profile._id,
      section: vsSection,
      action: previousStatus === "rejected" ? "resubmitted" : "submitted",
      previousStatus,
      newStatus: "submitted",
      verifiedBy: userId,
      verifierRole: "employee",
    });

    return profile;
  }

  async getAuditTrail(userId) {
    return VerificationLog.getAuditTrail(userId);
  }
}

module.exports = new EmployeeProfileService();
