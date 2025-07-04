// services/sms.service.js
const axios = require('axios');

class SMSService {
    constructor() {
        this.apiUrl = 'https://messaging-service.co.tz/api/sms/v1/text/single';
        this.username = process.env.NEXTSMS_USERNAME; // Your NextSMS username
        this.password = process.env.NEXTSMS_PASSWORD; // Your NextSMS password
        this.from = process.env.NEXTSMS_FROM || 'DALADASMART'; // Your sender name
    }

    /**
     * Send SMS using NextSMS API
     * @param {Object} params
     * @param {string} params.phone - Phone number (format: 255xxxxxxxxx)
     * @param {string} params.message - SMS message content
     * @returns {Promise<Object>} SMS sending result
     */
    async sendSMS({ phone, message }) {
        try {
            // Format phone number for NextSMS (remove + and ensure 255 prefix)
            const formattedPhone = this.formatPhoneNumber(phone);

            const requestData = {
                from: this.from,
                to: formattedPhone,
                text: message
            };

            console.log('Sending SMS:', {
                to: formattedPhone,
                from: this.from,
                message: message.substring(0, 50) + '...'
            });

            const response = await axios.post(this.apiUrl, requestData, {
                auth: {
                    username: this.username,
                    password: this.password
                },
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            });

            if (response.data && response.data.messages) {
                const messageResult = response.data.messages[0];

                if (messageResult.status === 'PENDING' || messageResult.status === 'SENT') {
                    console.log('SMS sent successfully:', {
                        messageId: messageResult.messageId,
                        status: messageResult.status,
                        to: formattedPhone
                    });

                    return {
                        success: true,
                        messageId: messageResult.messageId,
                        status: messageResult.status,
                        phone: formattedPhone
                    };
                } else {
                    throw new Error(`SMS failed with status: ${messageResult.status}`);
                }
            } else {
                throw new Error('Invalid response from SMS service');
            }

        } catch (error) {
            console.error('SMS sending error:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Return error details for debugging
            return {
                success: false,
                error: error.message,
                details: error.response?.data
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
     * Send verification code SMS
     * @param {string} phone - Phone number
     * @param {string} code - Verification code
     * @returns {Promise<Object>} SMS result
     */
    async sendVerificationCode(phone, code) {
        const message = `Your Daladala Smart verification code is: ${code}. Valid for 10 minutes. Do not share this code with anyone.`;

        return await this.sendSMS({ phone, message });
    }

    /**
     * Send trip booking confirmation SMS
     * @param {Object} params
     * @param {string} params.phone - Phone number
     * @param {string} params.tripDetails - Trip details
     * @param {string} params.bookingId - Booking ID
     * @returns {Promise<Object>} SMS result
     */
    async sendBookingConfirmation({ phone, tripDetails, bookingId }) {
        const message = `Booking Confirmed! 
Trip: ${tripDetails}
Booking ID: ${bookingId}
Download Daladala Smart app for trip updates.`;

        return await this.sendSMS({ phone, message });
    }

    /**
     * Send trip reminder SMS
     * @param {Object} params
     * @param {string} params.phone - Phone number
     * @param {string} params.tripTime - Trip departure time
     * @param {string} params.pickupLocation - Pickup location
     * @returns {Promise<Object>} SMS result
     */
    async sendTripReminder({ phone, tripTime, pickupLocation }) {
        const message = `Trip Reminder: Your daladala departs at ${tripTime} from ${pickupLocation}. Be at the stop 5 minutes early. Safe travels!`;

        return await this.sendSMS({ phone, message });
    }

    /**
     * Check SMS delivery status
     * @param {string} messageId - Message ID from NextSMS
     * @returns {Promise<Object>} Delivery status
     */
    async checkDeliveryStatus(messageId) {
        try {
            const response = await axios.get(
                `https://messaging-service.co.tz/api/sms/v1/reports/${messageId}`,
                {
                    auth: {
                        username: this.username,
                        password: this.password
                    },
                    headers: {
                        'Accept': 'application/json'
                    }
                }
            );

            return {
                success: true,
                status: response.data.status,
                deliveryTime: response.data.deliveryTime
            };

        } catch (error) {
            console.error('SMS status check error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Export singleton instance
const smsService = new SMSService();

module.exports = {
    sendSMS: (params) => smsService.sendSMS(params),
    sendVerificationCode: (phone, code) => smsService.sendVerificationCode(phone, code),
    sendBookingConfirmation: (params) => smsService.sendBookingConfirmation(params),
    sendTripReminder: (params) => smsService.sendTripReminder(params),
    checkDeliveryStatus: (messageId) => smsService.checkDeliveryStatus(messageId)
};