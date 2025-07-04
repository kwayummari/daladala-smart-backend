// services/sms.service.js - Updated to match working implementation
const axios = require('axios');
require('dotenv').config();

class SMSService {
    constructor() {
        // Use environment variables like your working file
        this.apiUrl = process.env.NEXT_SMS_API_URL;
        this.authorization = process.env.NEXT_SMS_AUTHORIZATION;
        this.senderId = process.env.NEXT_SMS_SENDER_ID;

        console.log('🔧 SMS Service initialized with:', {
            apiUrl: this.apiUrl,
            senderId: this.senderId,
            hasAuth: !!this.authorization
        });
    }

    /**
     * Send SMS using NextSMS API (matching your working implementation)
     * @param {Object} params
     * @param {string} params.phone - Phone number
     * @param {string} params.message - SMS message content
     * @param {string} params.reference - Optional reference
     * @returns {Promise<Object>} SMS sending result
     */
    async sendSMS({ phone, message, reference }) {
        try {
            // Format phone number
            const formattedPhone = this.formatPhoneNumber(phone);

            // Use reference or generate one
            const smsReference = reference || `DALA_${Date.now()}`;

            const data = JSON.stringify({
                from: this.senderId,
                to: [formattedPhone], // Array format like your working file
                text: message,
                reference: smsReference,
            });

            const config = {
                method: "post",
                url: this.apiUrl,
                headers: {
                    Authorization: this.authorization, // Use env variable
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                data: data,
            };

            console.log('🚀 Sending SMS:', {
                to: formattedPhone,
                from: this.senderId,
                message: message.substring(0, 50) + '...',
                reference: smsReference
            });

            // Send the request to NextSMS API
            const response = await axios(config);

            if (response.status === 200) {
                console.log("✅ SMS sent successfully:", response.data);
                return {
                    success: true,
                    data: response.data,
                    phone: formattedPhone,
                    reference: smsReference
                };
            } else {
                console.log("❌ Failed to send SMS:", response.status, response.data);
                throw new Error(`Failed to send SMS: ${response.status}`);
            }

        } catch (error) {
            console.error('❌ SMS sending error:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            return {
                success: false,
                error: error.message,
                details: error.response?.data,
                statusCode: error.response?.status
            };
        }
    }

    /**
     * Format phone number for NextSMS
     * @param {string} phone - Input phone number
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phone) {
        // Remove any spaces, dashes, or plus signs
        let cleaned = phone.replace(/[\s\-\+]/g, '');

        // If starts with 0, replace with 255
        if (cleaned.startsWith('0')) {
            cleaned = '255' + cleaned.substring(1);
        }

        // If doesn't start with 255, add it
        if (!cleaned.startsWith('255')) {
            cleaned = '255' + cleaned;
        }

        return cleaned;
    }

    /**
     * Generate numeric OTP (like your working file)
     * @param {number} length - OTP length
     * @returns {string} Numeric OTP
     */
    generateNumericOTP(length = 6) {
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += Math.floor(Math.random() * 10); // Random digit between 0 and 9
        }
        return otp;
    }

    /**
     * Send verification code SMS (matching your working pattern)
     * @param {string} phone - Phone number
     * @param {string} code - Verification code
     * @returns {Promise<Object>} SMS result
     */
    async sendVerificationCode(phone, code) {
        const message = `${code} is your Daladala Smart verification code. Please enter it to verify your phone number.`;

        return await this.sendSMS({
            phone,
            message,
            reference: code // Use code as reference like your working file
        });
    }

    /**
     * Send OTP and return the code (like your working sendOtp function)
     * @param {string} phone - Phone number
     * @returns {Promise<string>} OTP code if successful
     */
    async sendOtp(phone) {
        try {
            // Generate OTP (6-digit numeric)
            const otpCode = this.generateNumericOTP(6);
            console.log("Generated OTP:", otpCode);

            // Send OTP via NextSMS
            const message = `${otpCode} is your Daladala Smart verification code. Please enter it to verify your phone number.`;

            const result = await this.sendSMS({
                phone,
                message,
                reference: otpCode
            });

            if (result.success) {
                console.log("OTP sent successfully.");
                return otpCode; // Return the OTP code if sent successfully
            } else {
                throw new Error("Failed to send OTP.");
            }
        } catch (error) {
            console.error("Error sending OTP:", error);
            throw new Error("Error sending OTP.");
        }
    }
}

// Export singleton instance
const smsService = new SMSService();

module.exports = {
    sendSMS: (params) => smsService.sendSMS(params),
    sendVerificationCode: (phone, code) => smsService.sendVerificationCode(phone, code),
    sendOtp: (phone) => smsService.sendOtp(phone), // Like your working file
    generateNumericOTP: (length) => smsService.generateNumericOTP(length)
};