// services/email.service.js
const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: 'smtp.titan.email', 
            port: 465,
            secure: true, // SSL encryption
            auth: {
                user: 'noreply@digitalawards.co.tz',
                pass: '36W/P&jM*L+9R27'
            }
        });

        this.verifyConnection();
    }

    async verifyConnection() {
        try {
            await this.transporter.verify();
            console.log('✅ Email server connection verified');
        } catch (error) {
            console.error('❌ Email server connection failed:', error.message);
        }
    }

    /**
     * Send email
     * @param {Object} params
     * @param {string} params.to - Recipient email
     * @param {string} params.subject - Email subject
     * @param {string} params.html - HTML content
     * @param {string} params.text - Plain text content (optional)
     * @returns {Promise<Object>} Email sending result
     */
    async sendEmail({ to, subject, html, text }) {
        try {
            const mailOptions = {
                from: {
                    name: 'Daladala Smart',
                    address: 'noreply@digitalawards.co.tz'
                },
                to: to,
                subject: subject,
                html: html,
                text: text || this.stripHtml(html)
            };

            console.log('Sending email:', {
                to: to,
                subject: subject
            });

            const result = await this.transporter.sendMail(mailOptions);

            console.log('✅ Email sent successfully:', {
                messageId: result.messageId,
                to: to
            });

            return {
                success: true,
                messageId: result.messageId,
                to: to
            };

        } catch (error) {
            console.error('❌ Email sending error:', {
                message: error.message,
                to: to,
                subject: subject
            });

            return {
                success: false,
                error: error.message,
                to: to
            };
        }
    }

    /**
     * Send verification code email
     * @param {string} email - Recipient email
     * @param {string} code - Verification code
     * @returns {Promise<Object>} Email result
     */
    async sendVerificationCode(email, code) {
        const subject = 'Verify Your Daladala Smart Account';
        const html = this.getVerificationEmailTemplate(code);

        return await this.sendEmail({ to: email, subject, html });
    }

    /**
     * Send welcome email after successful verification
     * @param {Object} params
     * @param {string} params.email - User email
     * @param {string} params.phone - User phone
     * @returns {Promise<Object>} Email result
     */
    async sendWelcomeEmail({ email, phone }) {
        const subject = 'Welcome to Daladala Smart! 🚐';
        const html = this.getWelcomeEmailTemplate({ email, phone });

        return await this.sendEmail({ to: email, subject, html });
    }

    /**
     * Send booking confirmation email
     * @param {Object} params
     * @param {string} params.email - User email
     * @param {Object} params.booking - Booking details
     * @returns {Promise<Object>} Email result
     */
    async sendBookingConfirmation({ email, booking }) {
        const subject = `Booking Confirmed - ${booking.route}`;
        const html = this.getBookingConfirmationTemplate(booking);

        return await this.sendEmail({ to: email, subject, html });
    }

    /**
     * Send password reset email
     * @param {string} email - User email
     * @param {string} resetToken - Password reset token
     * @returns {Promise<Object>} Email result
     */
    async sendPasswordReset(email, resetToken) {
        const subject = 'Reset Your Daladala Smart Password';
        const html = this.getPasswordResetTemplate(resetToken);

        return await this.sendEmail({ to: email, subject, html });
    }

    /**
     * Verification email template
     */
    getVerificationEmailTemplate(code) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Account</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background-color: #2c5530; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🚐 Daladala Smart</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.9;">Smart Public Transportation</p>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #2c5530; margin: 0 0 20px 0;">Verify Your Account</h2>
            <p style="color: #333333; line-height: 1.6; margin: 0 0 30px 0;">
              Thank you for registering with Daladala Smart! Please verify your email address by entering the code below in the app.
            </p>
            
            <!-- Verification Code -->
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <p style="color: #2c5530; margin: 0 0 10px 0; font-weight: bold;">Your Verification Code</p>
              <div style="background-color: #ffffff; padding: 20px; border-radius: 6px; border: 2px dashed #2c5530;">
                <span style="color: #2c5530; font-size: 36px; font-weight: bold; letter-spacing: 8px;">${code}</span>
              </div>
              <p style="color: #666666; margin: 15px 0 0 0; font-size: 14px;">This code expires in 10 minutes</p>
            </div>
            
            <p style="color: #333333; line-height: 1.6; margin: 30px 0 0 0;">
              If you didn't create this account, please ignore this email and the account will not be activated.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #dee2e6;">
            <p style="color: #666666; margin: 0; font-size: 12px; text-align: center;">
              This is an automated message from Daladala Smart. Please do not reply to this email.<br>
              © 2024 Daladala Smart. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Welcome email template
     */
    getWelcomeEmailTemplate({ email, phone }) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Daladala Smart</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background-color: #2c5530; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 Welcome to Daladala Smart!</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #2c5530; margin: 0 0 20px 0;">Your account is now active!</h2>
            <p style="color: #333333; line-height: 1.6; margin: 0 0 20px 0;">
              Congratulations! Your Daladala Smart account has been successfully verified and is now ready to use.
            </p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2c5530; margin: 0 0 15px 0;">What you can do now:</h3>
              <ul style="color: #333333; line-height: 1.8; margin: 0; padding-left: 20px;">
                <li>🗺️ Search for daladala routes and schedules</li>
                <li>🎫 Book your trips in advance</li>
                <li>💰 Make secure payments via mobile money</li>
                <li>📍 Track your daladala in real-time</li>
                <li>⭐ Rate and review your trips</li>
              </ul>
            </div>
            
            <p style="color: #333333; line-height: 1.6; margin: 20px 0;">
              <strong>Account Details:</strong><br>
              📧 Email: ${email}<br>
              📱 Phone: ${phone}
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="#" style="background-color: #2c5530; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Start Using Daladala Smart
              </a>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #dee2e6;">
            <p style="color: #666666; margin: 0; font-size: 12px; text-align: center;">
              Need help? Contact us at support@digitalawards.co.tz<br>
              © 2024 Daladala Smart. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Booking confirmation email template
     */
    getBookingConfirmationTemplate(booking) {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Booking Confirmation</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background-color: #2c5530; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🎫 Booking Confirmed!</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #2c5530; margin: 0 0 20px 0;">Your trip is booked</h2>
            <p style="color: #333333; line-height: 1.6; margin: 0 0 30px 0;">
              Great! Your daladala trip has been successfully booked. Here are your trip details:
            </p>
            
            <!-- Booking Details -->
            <div style="background-color: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #2c5530;">
              <h3 style="color: #2c5530; margin: 0 0 15px 0;">Trip Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: bold;">Booking ID:</td>
                  <td style="padding: 8px 0; color: #333333;">${booking.id}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: bold;">Route:</td>
                  <td style="padding: 8px 0; color: #333333;">${booking.route}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: bold;">Date & Time:</td>
                  <td style="padding: 8px 0; color: #333333;">${booking.datetime}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: bold;">Pickup:</td>
                  <td style="padding: 8px 0; color: #333333;">${booking.pickup}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: bold;">Destination:</td>
                  <td style="padding: 8px 0; color: #333333;">${booking.destination}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666666; font-weight: bold;">Fare:</td>
                  <td style="padding: 8px 0; color: #333333; font-weight: bold;">TZS ${booking.fare}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p style="color: #856404; margin: 0; font-weight: bold;">⏰ Important Reminder</p>
              <p style="color: #856404; margin: 10px 0 0 0;">Please arrive at the pickup point at least 5 minutes before departure time.</p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #dee2e6;">
            <p style="color: #666666; margin: 0; font-size: 12px; text-align: center;">
              Track your trip in real-time using the Daladala Smart app<br>
              © 2024 Daladala Smart. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Password reset email template
     */
    getPasswordResetTemplate(resetToken) {
        const resetUrl = `${process.env.FRONTEND_URL || 'https://app.daladala-smart.co.tz'}/reset-password?token=${resetToken}`;

        return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background-color: #2c5530; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">🔑 Password Reset</h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 40px 30px;">
            <h2 style="color: #2c5530; margin: 0 0 20px 0;">Reset Your Password</h2>
            <p style="color: #333333; line-height: 1.6; margin: 0 0 30px 0;">
              You requested to reset your password for your Daladala Smart account. Click the button below to create a new password.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #dc3545; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #333333; line-height: 1.6; margin: 30px 0;">
              Or copy and paste this link in your browser:<br>
              <a href="${resetUrl}" style="color: #2c5530; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
              <p style="color: #721c24; margin: 0; font-weight: bold;">⚠️ Security Notice</p>
              <p style="color: #721c24; margin: 10px 0 0 0;">This link expires in 1 hour. If you didn't request this password reset, please ignore this email.</p>
            </div>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8f9fa; padding: 20px 30px; border-top: 1px solid #dee2e6;">
            <p style="color: #666666; margin: 0; font-size: 12px; text-align: center;">
              If you need help, contact us at support@digitalawards.co.tz<br>
              © 2024 Daladala Smart. All rights reserved.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
    }

    /**
     * Strip HTML tags from text
     */
    stripHtml(html) {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
}

// Export singleton instance
const emailService = new EmailService();

module.exports = {
    sendEmail: (params) => emailService.sendEmail(params),
    sendVerificationCode: (email, code) => emailService.sendVerificationCode(email, code),
    sendWelcomeEmail: (params) => emailService.sendWelcomeEmail(params),
    sendBookingConfirmation: (params) => emailService.sendBookingConfirmation(params),
    sendPasswordReset: (email, resetToken) => emailService.sendPasswordReset(email, resetToken)
};