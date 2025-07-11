// services/sms.service.js
const axios = require('axios');

class SMSService {

    constructor() {
        this.apiUrl = process.env.NEXT_SMS_API_URL;
        this.authorization = process.env.NEXT_SMS_AUTHORIZATION;
        this.senderId = process.env.NEXT_SMS_SENDER_ID;
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
                   to: [formattedPhone],
                   text: message,
                   reference: smsReference,
               });
   
               const config = {
                   method: "post",
                   url: this.apiUrl,
                   headers: {
                       Authorization: this.authorization,
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
                   console.log("SMS sent successfully:", response.data);
                   return {
                       success: true,
                       data: response.data,
                       phone: formattedPhone,
                       reference: smsReference
                   };
               } else {
                   console.log("Failed to send SMS:", response.status, response.data);
                   throw new Error(`Failed to send SMS: ${response.status}`);
               }
   
           } catch (error) {
               console.error('SMS sending error:', {
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

        return await this.sendSMS({
            phone,
            message,
            reference: code
        });
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

            console.log('Test SMS Response:', response.data);
            return response.data;

        } catch (error) {
            console.error('Test SMS Failed:', {
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