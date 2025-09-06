import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
import { IUser, IConsultation, IAppointment, ITransaction } from '../types';
import { EMAIL_TEMPLATES } from '../utils/constants';
import { logError, logInfo, formatDate } from '../utils/helpers';

// Email configuration interface
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

// Email template data interfaces
interface WelcomeEmailData {
  user: IUser;
  loginUrl: string;
}

interface AppointmentEmailData {
  patient: IUser;
  doctor: IUser;
  appointment: IAppointment;
  appointmentUrl: string;
}

interface ConsultationEmailData {
  patient: IUser;
  doctor?: IUser;
  consultation: IConsultation;
  consultationUrl: string;
}

interface PaymentEmailData {
  user: IUser;
  transaction: ITransaction;
  receiptUrl: string;
}

interface DoctorVerificationEmailData {
  doctor: IUser;
  verificationStatus: 'approved' | 'rejected';
  reason?: string;
  dashboardUrl: string;
}

export class EmailService {
  private transporter: Transporter;
  private isConfigured: boolean = false;

  constructor() {
    this.setupTransporter();
  }

  /**
   * Initialize email transporter
   */
  private setupTransporter(): void {
    try {
      const emailConfig: EmailConfig = {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER!,
          pass: process.env.EMAIL_PASS!
        }
      };

      if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        logError('Email service not configured - missing credentials');
        return;
      }

      this.transporter = nodemailer.createTransporter(emailConfig);
      this.isConfigured = true;

      // Verify connection configuration
      this.verifyConnection();

      logInfo('Email service initialized successfully');
    } catch (error) {
      logError('Failed to initialize email service:', error);
    }
  }

  /**
   * Verify email service connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logInfo('Email service connection verified');
    } catch (error) {
      logError('Email service connection verification failed:', error);
      this.isConfigured = false;
    }
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    try {
      const { user, loginUrl } = data;
      
      const subject = `Welcome to HealthFriend, ${user.firstName}!`;
      const html = this.generateWelcomeEmailHTML(data);
      const text = this.generateWelcomeEmailText(data);

      await this.sendEmail({
        to: user.email,
        subject,
        html,
        text
      });

      logInfo('Welcome email sent successfully', { userId: user._id, email: user.email });
      return true;
    } catch (error) {
      logError('Failed to send welcome email:', error);
      return false;
    }
  }

  /**
   * Send appointment confirmation email
   */
  async sendAppointmentConfirmation(data: AppointmentEmailData): Promise<boolean> {
    try {
      const { patient, doctor, appointment, appointmentUrl } = data;
      
      const subject = `Appointment Confirmed - ${formatDate(appointment.scheduledDateTime, 'long')}`;
      const html = this.generateAppointmentConfirmationHTML(data);
      const text = this.generateAppointmentConfirmationText(data);

      // Send to patient
      await this.sendEmail({
        to: patient.email,
        subject,
        html,
        text
      });

      // Send to doctor
      if (doctor) {
        const doctorSubject = `New Appointment Scheduled - ${patient.firstName} ${patient.lastName}`;
        const doctorHtml = this.generateDoctorAppointmentHTML(data);
        
        await this.sendEmail({
          to: doctor.email,
          subject: doctorSubject,
          html: doctorHtml,
          text: this.generateDoctorAppointmentText(data)
        });
      }

      logInfo('Appointment confirmation emails sent', { 
        appointmentId: appointment.appointmentId,
        patientEmail: patient.email,
        doctorEmail: doctor?.email 
      });
      return true;
    } catch (error) {
      logError('Failed to send appointment confirmation:', error);
      return false;
    }
  }

  /**
   * Send appointment reminder email
   */
  async sendAppointmentReminder(data: AppointmentEmailData): Promise<boolean> {
    try {
      const { patient, doctor, appointment, appointmentUrl } = data;
      const timeUntil = this.getTimeUntilAppointment(appointment.scheduledDateTime);
      
      const subject = `Appointment Reminder - ${timeUntil}`;
      const html = this.generateAppointmentReminderHTML(data, timeUntil);
      const text = this.generateAppointmentReminderText(data, timeUntil);

      await this.sendEmail({
        to: patient.email,
        subject,
        html,
        text
      });

      logInfo('Appointment reminder sent', { 
        appointmentId: appointment.appointmentId,
        patientEmail: patient.email 
      });
      return true;
    } catch (error) {
      logError('Failed to send appointment reminder:', error);
      return false;
    }
  }

  /**
   * Send consultation completion email
   */
  async sendConsultationCompleted(data: ConsultationEmailData): Promise<boolean> {
    try {
      const { patient, doctor, consultation, consultationUrl } = data;
      
      const subject = 'Your HealthFriend Consultation is Complete';
      const html = this.generateConsultationCompletedHTML(data);
      const text = this.generateConsultationCompletedText(data);

      await this.sendEmail({
        to: patient.email,
        subject,
        html,
        text
      });

      logInfo('Consultation completion email sent', { 
        consultationId: consultation.consultationId,
        patientEmail: patient.email 
      });
      return true;
    } catch (error) {
      logError('Failed to send consultation completion email:', error);
      return false;
    }
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(data: PaymentEmailData): Promise<boolean> {
    try {
      const { user, transaction, receiptUrl } = data;
      
      const subject = `Payment Confirmation - ${transaction.transactionId}`;
      const html = this.generatePaymentConfirmationHTML(data);
      const text = this.generatePaymentConfirmationText(data);

      await this.sendEmail({
        to: user.email,
        subject,
        html,
        text
      });

      logInfo('Payment confirmation email sent', { 
        transactionId: transaction.transactionId,
        userEmail: user.email 
      });
      return true;
    } catch (error) {
      logError('Failed to send payment confirmation:', error);
      return false;
    }
  }

  /**
   * Send doctor verification status email
   */
  async sendDoctorVerificationStatus(data: DoctorVerificationEmailData): Promise<boolean> {
    try {
      const { doctor, verificationStatus, reason, dashboardUrl } = data;
      
      const subject = verificationStatus === 'approved' 
        ? 'HealthFriend Doctor Verification Approved!' 
        : 'HealthFriend Doctor Verification Update';
      
      const html = this.generateDoctorVerificationHTML(data);
      const text = this.generateDoctorVerificationText(data);

      await this.sendEmail({
        to: doctor.email,
        subject,
        html,
        text
      });

      logInfo('Doctor verification email sent', { 
        doctorId: doctor._id,
        status: verificationStatus,
        email: doctor.email 
      });
      return true;
    } catch (error) {
      logError('Failed to send doctor verification email:', error);
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, resetToken: string, resetUrl: string): Promise<boolean> {
    try {
      const subject = 'HealthFriend Password Reset Request';
      const html = this.generatePasswordResetHTML(resetToken, resetUrl);
      const text = this.generatePasswordResetText(resetToken, resetUrl);

      await this.sendEmail({
        to: email,
        subject,
        html,
        text
      });

      logInfo('Password reset email sent', { email });
      return true;
    } catch (error) {
      logError('Failed to send password reset email:', error);
      return false;
    }
  }

  /**
   * Send bulk notification email
   */
  async sendBulkNotification(
    recipients: string[],
    subject: string,
    htmlContent: string,
    textContent: string
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    // Send emails in batches to avoid rate limiting
    const batchSize = 10;
    const batches = this.createBatches(recipients, batchSize);

    for (const batch of batches) {
      const promises = batch.map(async (email) => {
        try {
          await this.sendEmail({
            to: email,
            subject,
            html: htmlContent,
            text: textContent
          });
          sent++;
        } catch (error) {
          logError(`Failed to send bulk email to ${email}:`, error);
          failed++;
        }
      });

      await Promise.all(promises);
      
      // Add delay between batches to respect rate limits
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(1000); // 1 second delay
      }
    }

    logInfo('Bulk email notification completed', { sent, failed, total: recipients.length });
    return { sent, failed };
  }

  /**
   * Send custom email with template
   */
  async sendCustomEmail(
    to: string,
    subject: string,
    templateData: any,
    templateType: 'html' | 'text' = 'html'
  ): Promise<boolean> {
    try {
      const mailOptions: SendMailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject
      };

      if (templateType === 'html') {
        mailOptions.html = templateData;
      } else {
        mailOptions.text = templateData;
      }

      await this.sendEmail(mailOptions);
      logInfo('Custom email sent successfully', { to, subject });
      return true;
    } catch (error) {
      logError('Failed to send custom email:', error);
      return false;
    }
  }

  // Private helper methods

  private async sendEmail(options: SendMailOptions): Promise<void> {
    if (!this.isConfigured) {
      throw new Error('Email service is not properly configured');
    }

    const mailOptions: SendMailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      ...options
    };

    await this.transporter.sendMail(mailOptions);
  }

  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getTimeUntilAppointment(appointmentTime: Date): string {
    const now = new Date();
    const timeDiff = appointmentTime.getTime() - now.getTime();
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    
    if (hours < 1) {
      const minutes = Math.floor(timeDiff / (1000 * 60));
      return `in ${minutes} minutes`;
    } else if (hours < 24) {
      return `in ${hours} hours`;
    } else {
      const days = Math.floor(hours / 24);
      return `in ${days} days`;
    }
  }

  // HTML Email Templates

  private generateWelcomeEmailHTML(data: WelcomeEmailData): string {
    const { user, loginUrl } = data;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to HealthFriend</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to HealthFriend! 🏥</h1>
          </div>
          <div class="content">
            <h2>Hello ${user.firstName}!</h2>
            <p>Welcome to HealthFriend, the future of healthcare. We're excited to have you join our community of patients and healthcare providers.</p>
            
            <p>With HealthFriend, you can:</p>
            <ul>
              <li>🤖 Get instant AI-powered health consultations</li>
              <li>📹 Book video calls with verified doctors</li>
              <li>🏠 Schedule home visits from healthcare providers</li>
              <li>💊 Receive digital prescriptions and medical advice</li>
              <li>🔗 Make secure payments using blockchain technology</li>
            </ul>
            
            <p>Your account has been successfully created. Click the button below to access your dashboard and start your health journey:</p>
            
            <a href="${loginUrl}" class="button">Access Your Dashboard</a>
            
            <p>If you have any questions, our support team is here to help 24/7.</p>
            
            <p>Stay healthy!<br>The HealthFriend Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Decentralized Healthcare for Everyone</p>
            <p>This email was sent to ${user.email}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateAppointmentConfirmationHTML(data: AppointmentEmailData): string {
    const { patient, doctor, appointment, appointmentUrl } = data;
    const appointmentDate = formatDate(appointment.scheduledDateTime, 'long');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Appointment Confirmed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .appointment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Appointment Confirmed ✅</h1>
          </div>
          <div class="content">
            <h2>Hello ${patient.firstName}!</h2>
            <p>Your appointment has been successfully confirmed. Here are the details:</p>
            
            <div class="appointment-details">
              <h3>Appointment Details</h3>
              <p><strong>Doctor:</strong> Dr. ${doctor?.firstName} ${doctor?.lastName}</p>
              <p><strong>Specialization:</strong> ${doctor?.doctorProfile?.specialization?.join(', ')}</p>
              <p><strong>Date & Time:</strong> ${appointmentDate}</p>
              <p><strong>Type:</strong> ${appointment.type === 'video_call' ? 'Video Consultation' : 'Home Visit'}</p>
              <p><strong>Duration:</strong> ${appointment.duration} minutes</p>
              <p><strong>Appointment ID:</strong> ${appointment.appointmentId}</p>
            </div>
            
            <p>You will receive a reminder email 24 hours before your appointment.</p>
            
            <a href="${appointmentUrl}" class="button">View Appointment Details</a>
            
            <p>If you need to reschedule or cancel, please do so at least 2 hours before your appointment time.</p>
            
            <p>Best regards,<br>The HealthFriend Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Your Health, Our Priority</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateConsultationCompletedHTML(data: ConsultationEmailData): string {
    const { patient, doctor, consultation, consultationUrl } = data;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Consultation Complete</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .consultation-summary { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Consultation Complete 📋</h1>
          </div>
          <div class="content">
            <h2>Hello ${patient.firstName}!</h2>
            <p>Your consultation has been completed. Here's a summary:</p>
            
            <div class="consultation-summary">
              <h3>Consultation Summary</h3>
              ${doctor ? `<p><strong>Doctor:</strong> Dr. ${doctor.firstName} ${doctor.lastName}</p>` : ''}
              <p><strong>Type:</strong> ${consultation.type === 'ai_chat' ? 'AI Consultation' : consultation.type === 'video_call' ? 'Video Consultation' : 'Home Visit'}</p>
              <p><strong>Date:</strong> ${formatDate(consultation.createdAt, 'long')}</p>
              <p><strong>Consultation ID:</strong> ${consultation.consultationId}</p>
              
              ${consultation.diagnosis ? `<p><strong>Diagnosis:</strong> ${consultation.diagnosis}</p>` : ''}
              ${consultation.prescription && consultation.prescription.length > 0 ? `
                <p><strong>Prescriptions:</strong></p>
                <ul>
                  ${consultation.prescription.map(med => `<li>${med.medication} - ${med.dosage}</li>`).join('')}
                </ul>
              ` : ''}
            </div>
            
            <p>Your consultation notes and any prescriptions are available in your patient portal.</p>
            
            <a href="${consultationUrl}" class="button">View Full Consultation</a>
            
            <p>If you have any follow-up questions, please don't hesitate to book another consultation.</p>
            
            <p>Take care,<br>The HealthFriend Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Comprehensive Healthcare Solutions</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generatePaymentConfirmationHTML(data: PaymentEmailData): string {
    const { user, transaction, receiptUrl } = data;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Payment Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .payment-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #059669; }
          .button { background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Confirmed 💳</h1>
          </div>
          <div class="content">
            <h2>Hello ${user.firstName}!</h2>
            <p>Your payment has been successfully processed. Here are the transaction details:</p>
            
            <div class="payment-details">
              <h3>Transaction Details</h3>
              <p><strong>Transaction ID:</strong> ${transaction.transactionId}</p>
              <p><strong>Amount:</strong> ${transaction.amount} ${transaction.currency}</p>
              <p><strong>Service:</strong> ${this.getServiceName(transaction.type)}</p>
              <p><strong>Date:</strong> ${formatDate(transaction.createdAt, 'long')}</p>
              <p><strong>Network:</strong> ${transaction.blockchainNetwork}</p>
              ${transaction.transactionHash ? `<p><strong>Hash:</strong> ${transaction.transactionHash}</p>` : ''}
            </div>
            
            <p>Your payment has been recorded on the blockchain for security and transparency.</p>
            
            <a href="${receiptUrl}" class="button">Download Receipt</a>
            
            <p>Thank you for choosing HealthFriend for your healthcare needs!</p>
            
            <p>Best regards,<br>The HealthFriend Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Secure Blockchain Healthcare Payments</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateDoctorVerificationHTML(data: DoctorVerificationEmailData): string {
    const { doctor, verificationStatus, reason, dashboardUrl } = data;
    const isApproved = verificationStatus === 'approved';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Doctor Verification ${isApproved ? 'Approved' : 'Update'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${isApproved ? '#10b981' : '#f59e0b'}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .verification-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { background: ${isApproved ? '#10b981' : '#f59e0b'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Doctor Verification ${isApproved ? 'Approved! ✅' : 'Update 📋'}</h1>
          </div>
          <div class="content">
            <h2>Hello Dr. ${doctor.firstName}!</h2>
            
            ${isApproved ? `
              <p>Congratulations! Your doctor verification has been approved. You can now start accepting patients on HealthFriend.</p>
              
              <div class="verification-details">
                <h3>What's Next?</h3>
                <ul>
                  <li>✅ Complete your profile and set your availability</li>
                  <li>✅ Set your consultation fees</li>
                  <li>✅ Start accepting patient appointments</li>
                  <li>✅ Begin earning through telemedicine consultations</li>
                </ul>
              </div>
            ` : `
              <p>Thank you for submitting your verification documents. We've reviewed your application and need additional information before we can approve your account.</p>
              
              <div class="verification-details">
                <h3>Required Action</h3>
                <p><strong>Reason:</strong> ${reason || 'Additional documentation required'}</p>
                <p>Please log in to your dashboard to upload the required documents or make the necessary corrections.</p>
              </div>
            `}
            
            <a href="${dashboardUrl}" class="button">Access Your Dashboard</a>
            
            <p>If you have any questions about the verification process, our support team is here to help.</p>
            
            <p>Best regards,<br>The HealthFriend Verification Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Connecting Verified Healthcare Providers</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generatePasswordResetHTML(resetToken: string, resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset Request</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .reset-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626; }
          .button { background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .warning { background: #fef3c7; padding: 15px; border-radius: 5px; border-left: 4px solid #f59e0b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request 🔐</h1>
          </div>
          <div class="content">
            <p>You have requested to reset your HealthFriend account password.</p>
            
            <div class="reset-details">
              <h3>Reset Your Password</h3>
              <p>Click the button below to create a new password for your account:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
            </div>
            
            <div class="warning">
              <strong>Security Notice:</strong> If you did not request this password reset, please ignore this email or contact our support team immediately.
            </div>
            
            <p>For your security, never share this email or the reset link with anyone.</p>
            
            <p>Best regards,<br>The HealthFriend Security Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Secure Healthcare Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Text Email Templates (fallbacks)

  private generateWelcomeEmailText(data: WelcomeEmailData): string {
    const { user, loginUrl } = data;
    return `
Welcome to HealthFriend, ${user.firstName}!

Thank you for joining HealthFriend, the future of healthcare. 

With HealthFriend, you can:
- Get instant AI-powered health consultations
- Book video calls with verified doctors  
- Schedule home visits from healthcare providers
- Receive digital prescriptions and medical advice
- Make secure payments using blockchain technology

Access your dashboard: ${loginUrl}

If you have any questions, our support team is here to help 24/7.

Stay healthy!
The HealthFriend Team

This email was sent to ${user.email}
    `;
  }

  private generateAppointmentConfirmationText(data: AppointmentEmailData): string {
    const { patient, doctor, appointment } = data;
    const appointmentDate = formatDate(appointment.scheduledDateTime, 'long');
    
    return `
Appointment Confirmed

Hello ${patient.firstName}!

Your appointment has been successfully confirmed.

Appointment Details:
- Doctor: Dr. ${doctor?.firstName} ${doctor?.lastName}
- Date & Time: ${appointmentDate}
- Type: ${appointment.type === 'video_call' ? 'Video Consultation' : 'Home Visit'}
- Duration: ${appointment.duration} minutes
- Appointment ID: ${appointment.appointmentId}

You will receive a reminder email 24 hours before your appointment.

Best regards,
The HealthFriend Team
    `;
  }

  private generateAppointmentReminderHTML(data: AppointmentEmailData, timeUntil: string): string {
    // Similar to confirmation but with reminder-specific content
    return this.generateAppointmentConfirmationHTML(data).replace(
      'Appointment Confirmed ✅',
      `Appointment Reminder ⏰ - ${timeUntil}`
    );
  }

  private generateAppointmentReminderText(data: AppointmentEmailData, timeUntil: string): string {
    return this.generateAppointmentConfirmationText(data).replace(
      'Appointment Confirmed',
      `Appointment Reminder - ${timeUntil}`
    );
  }

  private generateConsultationCompletedText(data: ConsultationEmailData): string {
    const { patient, doctor, consultation } = data;
    
    return `
Consultation Complete

Hello ${patient.firstName}!

Your consultation has been completed.

Consultation Summary:
${doctor ? `- Doctor: Dr. ${doctor.firstName} ${doctor.lastName}` : ''}
- Type: ${consultation.type === 'ai_chat' ? 'AI Consultation' : consultation.type === 'video_call' ? 'Video Consultation' : 'Home Visit'}
- Date: ${formatDate(consultation.createdAt, 'long')}
- Consultation ID: ${consultation.consultationId}

Your consultation notes and any prescriptions are available in your patient portal.

Take care,
The HealthFriend Team
    `;
  }

  private generatePaymentConfirmationText(data: PaymentEmailData): string {
    const { user, transaction } = data;
    
    return `
Payment Confirmed

Hello ${user.firstName}!

Your payment has been successfully processed.

Transaction Details:
- Transaction ID: ${transaction.transactionId}
- Amount: ${transaction.amount} ${transaction.currency}
- Service: ${this.getServiceName(transaction.type)}
- Date: ${formatDate(transaction.createdAt, 'long')}

Thank you for choosing HealthFriend!

Best regards,
The HealthFriend Team
    `;
  }

  private generateDoctorVerificationText(data: DoctorVerificationEmailData): string {
    const { doctor, verificationStatus, reason } = data;
    const isApproved = verificationStatus === 'approved';
    
    return `
Doctor Verification ${isApproved ? 'Approved' : 'Update'}

Hello Dr. ${doctor.firstName}!

${isApproved 
  ? 'Congratulations! Your doctor verification has been approved. You can now start accepting patients on HealthFriend.'
  : `We've reviewed your application and need additional information: ${reason || 'Additional documentation required'}`
}

Please log in to your dashboard to ${isApproved ? 'complete your profile' : 'upload required documents'}.

Best regards,
The HealthFriend Verification Team
    `;
  }

  private generatePasswordResetText(resetToken: string, resetUrl: string): string {
    return `
Password Reset Request

You have requested to reset your HealthFriend account password.

Reset your password: ${resetUrl}

This link will expire in 1 hour for security reasons.

If you did not request this password reset, please ignore this email.

Best regards,
The HealthFriend Security Team
    `;
  }

  private generateDoctorAppointmentHTML(data: AppointmentEmailData): string {
    const { patient, doctor, appointment } = data;
    const appointmentDate = formatDate(appointment.scheduledDateTime, 'long');
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Appointment Scheduled</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .patient-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Appointment Scheduled 📅</h1>
          </div>
          <div class="content">
            <h2>Hello Dr. ${doctor?.firstName}!</h2>
            <p>You have a new appointment scheduled with a patient.</p>
            
            <div class="patient-details">
              <h3>Appointment Details</h3>
              <p><strong>Patient:</strong> ${patient.firstName} ${patient.lastName}</p>
              <p><strong>Date & Time:</strong> ${appointmentDate}</p>
              <p><strong>Type:</strong> ${appointment.type === 'video_call' ? 'Video Consultation' : 'Home Visit'}</p>
              <p><strong>Duration:</strong> ${appointment.duration} minutes</p>
              <p><strong>Appointment ID:</strong> ${appointment.appointmentId}</p>
            </div>
            
            <p>Please prepare for the consultation and ensure you're available at the scheduled time.</p>
            
            <p>Best regards,<br>The HealthFriend Team</p>
          </div>
          <div class="footer">
            <p>HealthFriend - Professional Healthcare Platform</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateDoctorAppointmentText(data: AppointmentEmailData): string {
    const { patient, appointment } = data;
    const appointmentDate = formatDate(appointment.scheduledDateTime, 'long');
    
    return `
New Appointment Scheduled

Hello Dr. ${data.doctor?.firstName}!

You have a new appointment scheduled:

Patient: ${patient.firstName} ${patient.lastName}
Date & Time: ${appointmentDate}
Type: ${appointment.type === 'video_call' ? 'Video Consultation' : 'Home Visit'}
Duration: ${appointment.duration} minutes
Appointment ID: ${appointment.appointmentId}

Please prepare for the consultation and ensure you're available at the scheduled time.

Best regards,
The HealthFriend Team
    `;
  }

  private getServiceName(transactionType: string): string {
    switch (transactionType) {
      case 'ai_consultation':
        return 'AI Health Consultation';
      case 'video_consultation':
        return 'Video Doctor Consultation';
      case 'home_visit':
        return 'Home Visit';
      case 'doctor_withdrawal':
        return 'Doctor Earnings Withdrawal';
      default:
        return 'HealthFriend Service';
    }
  }

  /**
   * Health check for email service
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      if (!this.isConfigured) {
        return {
          status: 'unhealthy',
          details: { error: 'Email service not configured' }
        };
      }

      await this.verifyConnection();
      
      return {
        status: 'healthy',
        details: {
          configured: true,
          host: process.env.EMAIL_HOST,
          user: process.env.EMAIL_USER
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
  }
}

// Export singleton instance
export default new EmailService();