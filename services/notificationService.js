// services/notificationService.js - Enhanced with beautiful templates
const nodemailer = require('nodemailer');
const axios = require('axios');
const db = require('../models');
const Notification = db.Notification;

class NotificationService {
    constructor() {
        // Email transporter configuration using your env vars
        this.emailTransporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // SMS configuration
        this.smsConfig = {
            apiUrl: process.env.NEXT_SMS_API_URL,
            authorization: process.env.NEXT_SMS_AUTHORIZATION,
            senderId: process.env.NEXT_SMS_SENDER_ID
        };

        console.log('NotificationService initialized with:', {
            emailHost: process.env.EMAIL_HOST,
            smsEnabled: !!this.smsConfig.apiUrl
        });
    }

    /**
     * Create in-app notification
     */
    async createNotification(notificationData) {
        try {
            const notification = await Notification.create(notificationData);
            console.log('✅ In-app notification created:', notification.notification_id);
            return notification;
        } catch (error) {
            console.error('❌ Failed to create notification:', error);
            throw error;
        }
    }

    /**
     * Send beautiful email
     */
    async sendEmail(to, subject, html) {
        try {
            if (!process.env.EMAIL_USER) {
                console.log('⚠️  Email not configured, skipping email notification');
                return;
            }

            const mailOptions = {
                from: {
                    name: process.env.EMAIL_FROM_NAME || 'Daladala Smart',
                    address: process.env.EMAIL_USER
                },
                to,
                subject,
                html
            };

            const result = await this.emailTransporter.sendMail(mailOptions);
            console.log('✅ Email sent successfully:', {
                messageId: result.messageId,
                to: to
            });
            return result;
        } catch (error) {
            console.error('❌ Failed to send email:', error);
        }
    }

    /**
     * Send SMS using your existing SMS service
     */
    async sendSMS(phoneNumber, message) {
        try {
            if (!this.smsConfig.apiUrl) {
                console.log('⚠️  SMS not configured, skipping SMS notification');
                return;
            }

            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            const reference = `DALA_${Date.now()}`;

            const data = JSON.stringify({
                from: this.smsConfig.senderId,
                to: [formattedPhone],
                text: message,
                reference: reference,
            });

            const config = {
                method: "post",
                url: this.smsConfig.apiUrl,
                headers: {
                    Authorization: this.smsConfig.authorization,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                data: data,
            };

            const response = await axios(config);
            console.log('✅ SMS sent successfully:', {
                to: formattedPhone,
                reference: reference
            });
            return response.data;
        } catch (error) {
            console.error('❌ Failed to send SMS:', error);
        }
    }

    /**
     * Format phone number for SMS
     */
    formatPhoneNumber(phone) {
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.startsWith('255')) {
            return cleanPhone;
        } else if (cleanPhone.startsWith('07')) {
            return '255' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('7')) {
            return '255' + cleanPhone;
        }

        return cleanPhone;
    }

    /**
     * Send payment confirmation notifications
     */
    async sendPaymentConfirmation(paymentData) {
        const { payment, user, booking, trip, route } = paymentData;

        try {
            console.log('📧 Sending payment confirmation notifications...');

            // 1. Create in-app notification
            await this.createNotification({
                user_id: user.user_id,
                title: '💰 Payment Successful!',
                message: `Your payment of ${payment.amount.toLocaleString()} TZS for trip booking has been confirmed. Have a safe journey!`,
                type: 'payment_success',
                data: {
                    payment_id: payment.payment_id,
                    booking_id: booking.booking_id,
                    amount: payment.amount
                }
            });

            // 2. Send beautiful email
            const emailHtml = this.generatePaymentSuccessEmail({
                user, payment, booking, trip, route
            });

            await this.sendEmail(
                user.email,
                '🎉 Payment Confirmed - Your Trip is Booked!',
                emailHtml
            );

            // 3. Send SMS
            const smsMessage = this.generatePaymentSuccessSMS({
                user, payment, booking, trip, route
            });

            await this.sendSMS(user.phone_number, smsMessage);

            console.log('✅ All payment confirmation notifications sent successfully');

        } catch (error) {
            console.error('❌ Failed to send payment confirmation:', error);
        }
    }

    /**
     * Send payment failure notifications
     */
    async sendPaymentFailure(paymentData) {
        const { payment, user, booking, trip, route } = paymentData;

        try {
            console.log('📧 Sending payment failure notifications...');

            // 1. Create in-app notification
            await this.createNotification({
                user_id: user.user_id,
                title: '❌ Payment Failed',
                message: `Your payment for trip booking failed. Please try again or contact support.`,
                type: 'payment_failed',
                data: {
                    payment_id: payment.payment_id,
                    booking_id: booking.booking_id,
                    amount: payment.amount
                }
            });

            // 2. Send email
            const emailHtml = this.generatePaymentFailureEmail({
                user, payment, booking, trip, route
            });

            await this.sendEmail(
                user.email,
                '❌ Payment Failed - Please Try Again',
                emailHtml
            );

            // 3. Send SMS
            const smsMessage = `Payment failed for your Daladala Smart booking. Please try again or use a different payment method. Reference: ${payment.payment_id}`;

            await this.sendSMS(user.phone_number, smsMessage);

            console.log('✅ All payment failure notifications sent successfully');

        } catch (error) {
            console.error('❌ Failed to send payment failure notifications:', error);
        }
    }

    /**
     * Send wallet top-up confirmation
     */
    async sendWalletTopupConfirmation(walletData) {
        const { user, transaction, wallet, amount } = walletData;

        try {
            console.log('📧 Sending wallet top-up confirmation...');

            // 1. Create in-app notification
            await this.createNotification({
                user_id: user.user_id,
                title: '💳 Wallet Topped Up!',
                message: `Your wallet has been topped up with ${amount.toLocaleString()} TZS. New balance: ${wallet.balance.toLocaleString()} TZS`,
                type: 'wallet_topup',
                data: {
                    transaction_id: transaction.transaction_id,
                    amount: amount,
                    new_balance: wallet.balance
                }
            });

            // 2. Send email
            const emailHtml = this.generateWalletTopupEmail({
                user, transaction, wallet, amount
            });

            await this.sendEmail(
                user.email,
                '💳 Wallet Top-up Successful!',
                emailHtml
            );

            // 3. Send SMS
            const smsMessage = `Wallet topped up! +${amount.toLocaleString()} TZS. New balance: ${wallet.balance.toLocaleString()} TZS. Thank you for using Daladala Smart!`;

            await this.sendSMS(user.phone_number, smsMessage);

            console.log('✅ All wallet top-up notifications sent successfully');

        } catch (error) {
            console.error('❌ Failed to send wallet top-up notifications:', error);
        }
    }

    /**
     * Generate beautiful payment success email
     */
    generatePaymentSuccessEmail({ user, payment, booking, trip, route }) {
        const userName = `${user.first_name} ${user.last_name}`;
        const paymentDate = new Date(payment.payment_time || payment.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Confirmation</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .success-icon { font-size: 48px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .trip-card { background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0; border-left: 4px solid #28a745; }
        .amount { font-size: 36px; font-weight: bold; color: #28a745; text-align: center; margin: 20px 0; }
        .details { background: #ffffff; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #f1f3f4; }
        .detail-label { font-weight: 600; color: #495057; }
        .detail-value { color: #212529; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .btn { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        @media (max-width: 600px) {
          .container { margin: 0; }
          .content { padding: 20px; }
          .detail-row { flex-direction: column; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="success-icon">🎉</div>
          <h1>Payment Successful!</h1>
          <p>Your trip has been confirmed</p>
        </div>
        
        <div class="content">
          <p>Dear ${userName},</p>
          <p>Great news! Your payment has been successfully processed and your trip is now confirmed.</p>
          
          <div class="amount">TZS ${payment.amount.toLocaleString()}</div>
          
          <div class="trip-card">
            <h3 style="margin-top: 0; color: #28a745;">🚌 Trip Details</h3>
            <p><strong>Route:</strong> ${route?.route_name || 'Route Information'}</p>
            <p><strong>From:</strong> ${route?.start_point || 'Pickup Location'}</p>
            <p><strong>To:</strong> ${route?.end_point || 'Drop-off Location'}</p>
            <p><strong>Passengers:</strong> ${booking.passenger_count}</p>
          </div>
          
          <div class="details">
            <h3 style="margin-top: 0;">📋 Payment Details</h3>
            <div class="detail-row">
              <span class="detail-label">Booking Reference</span>
              <span class="detail-value">#${booking.booking_id}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Payment Method</span>
              <span class="detail-value">${payment.payment_method.replace('_', ' ').toUpperCase()}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Payment Date</span>
              <span class="detail-value">${paymentDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Status</span>
              <span class="detail-value" style="color: #28a745; font-weight: bold;">✅ CONFIRMED</span>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/bookings/${booking.booking_id}" class="btn">View Booking Details</a>
          </div>
          
          <div style="background: #e7f3ff; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #0066cc;">📱 What's Next?</h4>
            <ul style="margin: 0; padding-left: 20px;">
              <li>Keep this confirmation for your records</li>
              <li>Arrive at the pickup point 5-10 minutes early</li>
              <li>Show your booking reference to the driver</li>
              <li>Have a safe and pleasant journey!</li>
            </ul>
          </div>
        </div>
        
        <div class="footer">
          <p>Thank you for choosing Daladala Smart!</p>
          <p>Safe travels and see you again soon.</p>
          <p style="margin-top: 20px; color: #adb5bd; font-size: 12px;">
            This is an automated message. Please do not reply to this email.<br>
            For support, contact us at support@daladalasmart.com
          </p>
        </div>
      </div>
    </body>
    </html>
    `;
    }

    /**
     * Generate payment failure email
     */
    generatePaymentFailureEmail({ user, payment, booking, trip, route }) {
        const userName = `${user.first_name} ${user.last_name}`;

        return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Failed</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .error-icon { font-size: 48px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .retry-btn { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .support-box { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="error-icon">❌</div>
          <h1>Payment Failed</h1>
          <p>We couldn't process your payment</p>
        </div>
        
        <div class="content">
          <p>Dear ${userName},</p>
          <p>We're sorry, but we couldn't process your payment for booking #${booking.booking_id}.</p>
          
          <div class="support-box">
            <h3 style="margin-top: 0;">💡 What you can do:</h3>
            <ul>
              <li>Check your payment method and try again</li>
              <li>Ensure you have sufficient funds</li>
              <li>Try a different payment method</li>
              <li>Contact your bank if the issue persists</li>
            </ul>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/bookings/${booking.booking_id}/retry-payment" class="retry-btn">Try Payment Again</a>
          </div>
          
          <p>If you continue to experience issues, please don't hesitate to contact our support team.</p>
        </div>
        
        <div class="footer">
          <p>Need help? Contact support@daladalasmart.com</p>
          <p>We're here to help you complete your booking!</p>
        </div>
      </div>
    </body>
    </html>
    `;
    }

    /**
     * Generate wallet top-up email
     */
    generateWalletTopupEmail({ user, transaction, wallet, amount }) {
        const userName = `${user.first_name} ${user.last_name}`;
        const topupDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Wallet Top-up Successful</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; padding: 30px; text-align: center; }
        .wallet-icon { font-size: 48px; margin-bottom: 10px; }
        .content { padding: 30px; }
        .balance-card { background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%); color: white; border-radius: 12px; padding: 25px; text-align: center; margin: 20px 0; }
        .new-balance { font-size: 36px; font-weight: bold; margin: 10px 0; }
        .topup-amount { background: #d1f2eb; color: #00695c; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="wallet-icon">💳</div>
          <h1>Wallet Top-up Successful!</h1>
          <p>Your funds have been added</p>
        </div>
        
        <div class="content">
          <p>Dear ${userName},</p>
          <p>Great news! Your wallet has been successfully topped up.</p>
          
          <div class="topup-amount">
            <h3 style="margin: 0; color: #00695c;">💰 Amount Added</h3>
            <div style="font-size: 24px; font-weight: bold; margin-top: 10px;">
              +TZS ${amount.toLocaleString()}
            </div>
          </div>
          
          <div class="balance-card">
            <h3 style="margin: 0; opacity: 0.9;">Your New Wallet Balance</h3>
            <div class="new-balance">TZS ${parseFloat(wallet.balance).toLocaleString()}</div>
            <p style="margin: 0; opacity: 0.8;">Ready for your next trip!</p>
          </div>
          
          <div style="background: #e8f5e8; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <h4 style="margin-top: 0; color: #2e7d32;">✨ You're all set!</h4>
            <p style="margin-bottom: 0;">You can now use your wallet balance to pay for trips instantly. No need to wait for payment processing!</p>
          </div>
        </div>
        
        <div class="footer">
          <p>Thank you for using Daladala Smart Wallet!</p>
          <p>Transaction Date: ${topupDate}</p>
        </div>
      </div>
    </body>
    </html>
    `;
    }

    /**
     * Generate payment success SMS
     */
    generatePaymentSuccessSMS({ user, payment, booking, trip, route }) {
        return `🎉 Payment Success! TZS ${payment.amount.toLocaleString()} paid for booking #${booking.booking_id}. Your ${route?.route_name || 'trip'} is confirmed! Show this SMS to the driver. Safe travels! - Daladala Smart`;
    }
}

module.exports = new NotificationService();