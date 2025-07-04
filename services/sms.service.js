// services/sms.service.js
const axios = require('axios');

class SMSService {
    constructor() {
        this.apiUrl = 'https://messaging-service.co.tz/api/sms/v1/text/single';
        this.username = process.env.NEXTSMS_USERNAME; // Your NextSMS username
        this.password = process.env.NEXTSMS_PASSWORD; // Your NextSMS password
        this.from = process.env.NEXTSMS_FROM || 'DALADALA SMART';
        this.authHeader = 'Basic TmplbHUwMTpOamVsdUAyMDIw'; 
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
                text: message,
                reference: this.generateReference() // Add reference like in curl
            };

            console.log('🚀 Sending SMS:', {
                to: formattedPhone,
                from: this.from,
                message: message.substring(0, 50) + '...',
                url: this.apiUrl
            });

            const response = await axios.post(this.apiUrl, requestData, {
                headers: {
                    'Authorization': this.authHeader, // Use the same auth as curl
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            });

            console.log('📱 SMS API Response:', response.data);

            if (response.data && response.status === 200) {
                console.log('✅ SMS sent successfully:', response,{
                    response: response.data,
                    to: formattedPhone
                });

                return {
                    success: true,
                    data: response.data,
                    phone: formattedPhone
                };
            } else {
                throw new Error(`SMS failed with response: ${JSON.stringify(response.data)}`);
            }

        } catch (error) {
            console.error('❌ SMS sending error:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Return error details for debugging
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
     * Generate a unique reference for SMS tracking
     * @returns {string} Unique reference
     */
    generateReference() {
        return `DALA_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    /**
     * Send verification code SMS
     * @param {string} phone - Phone number
     * @param {string} code - Verification code
     * @returns {Promise<Object>} SMS result
     */
    async sendVerificationCode(phone, code) {
        const message = `${code} is your Daladala Smart verification code. Valid for 10 minutes. Do not share this code with anyone.`;

        return await this.sendSMS({ phone, message });
    }

    /**
     * Test SMS sending with your exact curl parameters
     */
    async testSMS() {
        const testData = {
            from: "N-SMS",
            to: "255716718040", // Your test number
            text: "Test message from Daladala Smart API",
            reference: "test_" + Date.now()
        };

        try {
            console.log('🧪 Testing SMS with curl parameters...');

            const response = await axios.post(this.apiUrl, testData, {
                headers: {
                    'Authorization': this.authHeader,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('✅ Test SMS Response:', response.data);
            return response.data;

        } catch (error) {
            console.error('❌ Test SMS Failed:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            return null;
        }
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
    checkDeliveryStatus: (messageId) => smsService.checkDeliveryStatus(messageId),
    testSMS: () => smsService.testSMS()
};