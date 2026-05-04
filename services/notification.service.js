const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const logger = require('../utils/logger');

class NotificationService {
  /**
   * Create an in-app notification record
   */
  async createNotification({ recipientId, type, subject, body, metadata = {} }) {
    try {
      const notification = await Notification.create({
        recipientId,
        type,
        channel: 'in_app',
        subject,
        body,
        metadata,
        status: 'pending',
      });
      return notification;
    } catch (err) {
      logger.error(`Failed to create in-app notification: ${err.message}`);
      return null;
    }
  }

  /**
   * Notify all Admins and Super Admins about a new registration
   */
  async notifyAdminNewRegistration(newUser) {
    const admins = await User.find({ 
      role: { $in: ['admin', 'super_admin'] },
      status: 'active',
      isDeleted: false 
    });

    const subject = 'New User Registered';
    const body = `A new ${newUser.role}, ${newUser.firstName} ${newUser.lastName} (${newUser.email}), has registered and is awaiting onboarding.`;

    const promises = admins.map(admin => 
      this.createNotification({
        recipientId: admin._id,
        type: 'new_registration',
        subject,
        body,
        metadata: { userId: newUser._id, email: newUser.email }
      })
    );

    await Promise.all(promises);
  }

  /**
   * Notify an employee about a section status update (Approved/Rejected)
   */
  async notifyEmployeeSectionUpdate(employeeId, section, status, comments) {
    const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
    const statusLabel = status === 'approved' ? 'Approved' : 'Rejected';
    const icon = status === 'approved' ? '✅' : '❌';

    await this.createNotification({
      recipientId: employeeId,
      type: 'section_update',
      subject: `${sectionLabel} Section ${statusLabel}`,
      body: `${icon} Your ${sectionLabel} section has been ${status.toLowerCase()}.${comments ? ` Feedback: ${comments}` : ''}`,
      metadata: { section, status, comments }
    });
  }

  /**
   * Notify an employee that their profile has been forwarded to Super Admin
   */
  async notifyEmployeeForwarded(employeeId) {
    await this.createNotification({
      recipientId: employeeId,
      type: 'profile_forwarded',
      subject: 'Profile Forwarded for Final Review',
      body: '🚀 Your onboarding profile has been verified by Admin and forwarded to HR Head for final approval.',
    });
  }

  /**
   * Notify an employee of the final decision (Approved/Rejected)
   */
  async notifyEmployeeFinalDecision(employeeId, status, comments, employeeIdStr = null) {
    const subject = status === 'approved' ? '🎉 Onboarding Approved!' : '❌ Onboarding Application Update';
    const body = status === 'approved' 
      ? `Congratulations! Your onboarding is complete. Your Employee ID is ${employeeIdStr}.`
      : `Your onboarding application has been rejected.${comments ? ` Reason: ${comments}` : ''}`;

    await this.createNotification({
      recipientId: employeeId,
      type: 'final_decision',
      subject,
      body,
      metadata: { status, comments, employeeId: employeeIdStr }
    });
  }

  /**
   * Notify Super Admins when a profile is forwarded to them
   */
  async notifySuperAdminNewForward(employeeProfile, adminUser) {
    const superAdmins = await User.find({ 
      role: 'super_admin',
      status: 'active',
      isDeleted: false 
    });

    const subject = 'New Profile for Final Review';
    const body = `Admin ${adminUser.firstName} has forwarded the profile of ${employeeProfile.userId.firstName} ${employeeProfile.userId.lastName} for your final approval.`;

    const promises = superAdmins.map(sa => 
      this.createNotification({
        recipientId: sa._id,
        type: 'new_forward',
        subject,
        body,
        metadata: { profileId: employeeProfile._id, adminId: adminUser._id }
      })
    );

    await Promise.all(promises);
  }

  /**
   * Notify admins when an employee submits a section
   */
  async notifyAdminSectionSubmission(employeeUser, section) {
    const admins = await User.find({ 
      role: { $in: ['admin', 'super_admin'] },
      status: 'active',
      isDeleted: false 
    });

    const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);
    const subject = `New Section Submission: ${sectionLabel}`;
    const body = `${employeeUser.firstName} ${employeeUser.lastName} has submitted the ${sectionLabel} section for review.`;

    const promises = admins.map(admin => 
      this.createNotification({
        recipientId: admin._id,
        type: 'section_submission',
        subject,
        body,
        metadata: { userId: employeeUser._id, section }
      })
    );

    await Promise.all(promises);
  }

  /**
   * Notify admins when an employee completes the entire onboarding form
   */
  async notifyAdminProfileCompletion(employeeUser) {
    const admins = await User.find({ 
      role: { $in: ['admin', 'super_admin'] },
      status: 'active',
      isDeleted: false 
    });

    const subject = 'Onboarding Form Completed';
    const body = `Employee ${employeeUser.firstName} ${employeeUser.lastName} has completed all sections and submitted their profile for final verification.`;

    const promises = admins.map(admin => 
      this.createNotification({
        recipientId: admin._id,
        type: 'profile_completion',
        subject,
        body,
        metadata: { userId: employeeUser._id }
      })
    );

    await Promise.all(promises);
  }
}

module.exports = new NotificationService();
