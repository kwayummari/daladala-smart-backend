// services/notificationService.js
const nodemailer = require('nodemailer');
const db = require('../models');
const Notification = db.Notification;

class NotificationService {
  constructor() {
    // Email transporter configuration
    this.emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  /**
   * Create in-app notification
   * @param {Object} notificationData - Notification data
   */
  async createNotification(notificationData) {
    try {
      const notification = await Notification.create(notificationData);
      console.log('Notification created:', notification.notification_id);
      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Send email notification
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   */
  async sendEmail(to, subject, html) {
    try {
      if (!process.env.SMTP_USER) {
        console.log('Email not configured, skipping email notification');
        return;
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        html
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      console.log('Email sent:', result.messageId);
      return result;
    } catch (error) {
      console.error('Failed to send email:', error);
      // Don't throw error, just log it
    }
  }

  /**
   * Send SMS notification (implement with your preferred SMS provider)
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - SMS message
   */
  async sendSMS(phoneNumber, message) {
    try {
      // Implement SMS sending with your preferred provider
      // For now, just log the message
      console.log(`SMS to ${phoneNumber}: ${message}`);

      // Example with a generic SMS API
      /*
      const response = await axios.post('https://your-sms-api.com/send', {
        to: phoneNumber,
        message: message,
        api_key: process.env.SMS_API_KEY,
        sender_id: process.env.SMS_SENDER_ID
      });
      */

      return { success: true };
    } catch (error) {
      console.error('Failed to send SMS:', error);
      // Don't throw error, just log it
    }
  }

  /**
   * Send payment confirmation notification
   * @param {Object} payment - Payment object
   * @param {Object} user - User object
   * @param {Object} booking - Booking object
   */
  async sendPaymentConfirmation(payment, user, booking) {
    try {
      // Create in-app notification
      await this.createNotification({
        user_id: user.user_id,
        title: 'Payment Successful',
        message: `Your payment of ${payment.amount} ${payment.currency} for booking #${booking.booking_id} has been completed successfully.`,
        type: 'success',
        related_entity: 'payment',
        related_id: payment.payment_id
      });

      // Send email confirmation
      const emailSubject = 'Payment Confirmation - Daladala Smart';
      const emailHtml = this.generatePaymentConfirmationEmail(payment, user, booking);
      await this.sendEmail(user.email, emailSubject, emailHtml);

      // Send SMS confirmation
      const smsMessage = `Payment confirmed! ${payment.amount} TZS paid for booking #${booking.booking_id}. Your trip is confirmed. - Daladala Smart`;
      await this.sendSMS(user.phone_number, smsMessage);

    } catch (error) {
      console.error('Failed to send payment confirmation:', error);
    }
  }

  /**
   * Send payment failure notification
   * @param {Object} payment - Payment object
   * @param {Object} user - User object
   * @param {Object} booking - Booking object
   */
  async sendPaymentFailure(payment, user, booking) {
    try {
      // Create in-app notification
      await this.createNotification({
        user_id: user.user_id,
        title: 'Payment Failed',
        message: `Your payment for booking #${booking.booking_id} has failed. Please try again or use a different payment method.`,
        type: 'error',
        related_entity: 'payment',
        related_id: payment.payment_id
      });

      // Send email notification
      const emailSubject = 'Payment Failed - Daladala Smart';
      const emailHtml = this.generatePaymentFailureEmail(payment, user, booking);
      await this.sendEmail(user.email, emailSubject, emailHtml);

      // Send SMS notification
      const smsMessage = `Payment failed for booking #${booking.booking_id}. Please try again. - Daladala Smart`;
      await this.sendSMS(user.phone_number, smsMessage);

    } catch (error) {
      console.error('Failed to send payment failure notification:', error);
    }
  }

  /**
   * Generate payment confirmation email HTML
   */
  generatePaymentConfirmationEmail(payment, user, booking) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Confirmation</title>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #FF6B00; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .details { background-color: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
              .footer { text-align: center; padding: 20px; color: #666; }
              .success { color: #28a745; font-weight: bold; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Payment Confirmation</h1>
              </div>
              <div class="content">
                  <p>Dear ${user.first_name} ${user.last_name},</p>
                  <p class="success">Your payment has been successfully processed!</p>
                  
                  <div class="details">
                      <h3>Payment Details</h3>
                      <p><strong>Amount:</strong> ${payment.amount} ${payment.currency}</p>
                      <p><strong>Payment Method:</strong> ${payment.payment_method}</p>
                      <p><strong>Transaction ID:</strong> ${payment.transaction_id}</p>
                      <p><strong>Date:</strong> ${new Date(payment.payment_time).toLocaleString()}</p>
                  </div>
                  
                  <div class="details">
                      <h3>Booking Details</h3>
                      <p><strong>Booking ID:</strong> #${booking.booking_id}</p>
                      <p><strong>Status:</strong> Confirmed</p>
                  </div>
                  
                  <p>Your trip is now confirmed. Please arrive at the pickup point on time.</p>
                  <p>Thank you for choosing Daladala Smart!</p>
              </div>
              <div class="footer">
                  <p>Daladala Smart - Making public transport easier</p>
              </div>
          </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate payment failure email HTML
   */
  generatePaymentFailureEmail(payment, user, booking) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Payment Failed</title>
          <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
              .content { padding: 20px; background-color: #f9f9f9; }
              .details { background-color: white; padding: 15px; margin: 10px 0; border-radius: 5px; }
              .footer { text-align: center; padding: 20px; color: #666; }
              .error { color: #dc3545; font-weight: bold; }
              .retry-button { background-color: #FF6B00; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>Payment Failed</h1>
              </div>
              <div class="content">
                  <p>Dear ${user.first_name} ${user.last_name},</p>
                  <p class="error">We were unable to process your payment.</p>
                  
                  <div class="details">
                      <h3>Payment Details</h3>
                      <p><strong>Amount:</strong> ${payment.amount} ${payment.currency}</p>
                      <p><strong>Payment Method:</strong> ${payment.payment_method}</p>
                      <p><strong>Booking ID:</strong> #${booking.booking_id}</p>
                      <p><strong>Failure Reason:</strong> ${payment.failure_reason || 'Payment could not be processed'}</p>
                  </div>
                  
                  <p>Please try again with the same or different payment method. Your booking is still reserved for a limited time.</p>
                  
                  <a href="${process.env.APP_URL}/bookings/${booking.booking_id}/payment" class="retry-button">Retry Payment</a>
                  
                  <p>If you continue to experience issues, please contact our support team.</p>
              </div>
              <div class="footer">
                  <p>Daladala Smart - Making public transport easier</p>
              </div>
          </div>
      </body>
      </html>
    `;
  }
}

module.exports = new NotificationService();