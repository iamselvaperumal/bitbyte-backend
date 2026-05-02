const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logger.error('Email configuration missing: SMTP_USER or SMTP_PASS not set in environment variables');
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      connectionTimeout: 15000, // 15 seconds
      greetingTimeout: 15000,
      socketTimeout: 15000,
    });

    // Verify connection on startup
    this.transporter.verify((error, success) => {
      if (error) {
        logger.error(`SMTP Connection Error: ${error.message}`);
      } else {
        logger.info('SMTP Server is ready to take our messages');
      }
    });
  }

  async send({ to, subject, html }) {
    try {
      await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html,
      });
      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      logger.error(`Email failed to ${to}: ${err.message}`);
      throw err;
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────

  async sendRegistrationCredentials({ to, firstName, email, tempPassword }) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="background:#1d4ed8;padding:20px;border-radius:6px 6px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">${process.env.COMPANY_NAME}</h1>
          <p style="color:#bfdbfe;margin:4px 0 0">HR Onboarding System</p>
        </div>
        <div style="padding:28px 24px">
          <h2 style="color:#1e293b;margin-top:0">Welcome, ${firstName}!</h2>
          <p style="color:#475569">Your employee account has been created. Use the credentials below to log in and complete your onboarding.</p>
          <div style="background:#f1f5f9;border-radius:6px;padding:16px;margin:20px 0">
            <p style="margin:0 0 8px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:.05em">Login Credentials</p>
            <p style="margin:4px 0;color:#1e293b"><strong>Email:</strong> ${email}</p>
            <p style="margin:4px 0;color:#1e293b"><strong>Temporary Password:</strong> <code style="background:#e2e8f0;padding:2px 6px;border-radius:4px;font-size:14px">${tempPassword}</code></p>
          </div>
          <p style="color:#ef4444;font-size:13px">⚠️ You will be required to reset your password on first login.</p>
          <a href="${process.env.FRONTEND_URL}/login" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:8px">Login Now</a>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding:16px 24px;text-align:center">
          <p style="color:#94a3b8;font-size:12px;margin:0">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `;
    return this.send({ to, subject: `Welcome to ${process.env.COMPANY_NAME} — Your Login Credentials`, html });
  }

  async sendSectionStatus({ to, firstName, section, status, comments }) {
    const statusColor = status === 'approved' ? '#10b981' : '#ef4444';
    const statusLabel = status === 'approved' ? '✅ Approved' : '❌ Rejected';
    const sectionLabel = section.charAt(0).toUpperCase() + section.slice(1);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="background:#1d4ed8;padding:20px;border-radius:6px 6px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">${process.env.COMPANY_NAME}</h1>
        </div>
        <div style="padding:28px 24px">
          <h2 style="color:#1e293b">Hi ${firstName},</h2>
          <p style="color:#475569">Your <strong>${sectionLabel} Details</strong> section has been reviewed.</p>
          <div style="border-left:4px solid ${statusColor};padding:12px 16px;background:#f8fafc;border-radius:0 6px 6px 0;margin:20px 0">
            <p style="margin:0;font-size:18px;font-weight:600;color:${statusColor}">${statusLabel}</p>
            ${comments ? `<p style="margin:8px 0 0;color:#475569;font-size:14px"><strong>Feedback:</strong> ${comments}</p>` : ''}
          </div>
          ${status === 'rejected' ? `
            <p style="color:#475569">Please log in to update the rejected section and resubmit.</p>
            <a href="${process.env.FRONTEND_URL}/employee/onboarding" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Update & Resubmit</a>
          ` : '<p style="color:#475569">Our team will continue reviewing your remaining sections.</p>'}
        </div>
      </div>
    `;
    return this.send({ to, subject: `Onboarding Update — ${sectionLabel} ${statusLabel}`, html });
  }

  async sendFinalApproval({ to, firstName, employeeId }) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="background:#059669;padding:20px;border-radius:6px 6px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">🎉 Onboarding Complete!</h1>
        </div>
        <div style="padding:28px 24px">
          <h2 style="color:#1e293b">Congratulations, ${firstName}!</h2>
          <p style="color:#475569">Your onboarding has been fully approved. You are now an official employee of <strong>${process.env.COMPANY_NAME}</strong>.</p>
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
            <p style="margin:0 0 4px;color:#065f46;font-size:13px;text-transform:uppercase;letter-spacing:.08em">Your Employee ID</p>
            <p style="margin:0;font-size:28px;font-weight:700;color:#047857;letter-spacing:.1em">${employeeId}</p>
          </div>
          <p style="color:#475569">Please save this ID — you will need it for all official communications.</p>
          <a href="${process.env.FRONTEND_URL}/employee/dashboard" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">View Dashboard</a>
        </div>
      </div>
    `;
    return this.send({ to, subject: `Welcome Aboard! Your Employee ID: ${employeeId}`, html });
  }

  async sendFinalRejection({ to, firstName, comments }) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="background:#dc2626;padding:20px;border-radius:6px 6px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Onboarding Update</h1>
        </div>
        <div style="padding:28px 24px">
          <h2 style="color:#1e293b">Hi ${firstName},</h2>
          <p style="color:#475569">After final review, your onboarding application requires further action.</p>
          <div style="border-left:4px solid #dc2626;padding:12px 16px;background:#fef2f2;border-radius:0 6px 6px 0;margin:20px 0">
            <p style="margin:0;color:#991b1b;font-weight:600">Feedback from HR:</p>
            <p style="margin:8px 0 0;color:#475569">${comments}</p>
          </div>
          <p style="color:#475569">Please contact HR for further guidance.</p>
        </div>
      </div>
    `;
    return this.send({ to, subject: 'Onboarding Application — Action Required', html });
  }

  async sendForwardedNotification({ to, firstName }) {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px">
        <div style="background:#7c3aed;padding:20px;border-radius:6px 6px 0 0;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Final Review in Progress</h1>
        </div>
        <div style="padding:28px 24px">
          <h2 style="color:#1e293b">Hi ${firstName},</h2>
          <p style="color:#475569">Great news! Your onboarding profile has been verified by our Admin team and has been forwarded to the HR Head for final approval.</p>
          <p style="color:#475569">You will be notified once the final decision is made. This typically takes 1–2 business days.</p>
        </div>
      </div>
    `;
    return this.send({ to, subject: 'Your Profile is Under Final Review', html });
  }
}

module.exports = new EmailService();
