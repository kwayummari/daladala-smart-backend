// services/zenoPayService.js
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class ZenoPayService {
    constructor() {
        this.apiUrl = 'https://zenoapi.com/api/payments';
        this.apiKey = process.env.ZENOPAY_API_KEY ?? 'XB928pO2vf1logEwEaJSTsYeBr4LhuX9HxffvoUZA64umcHZljS3iRNARKSbPkpLVk4WjNlx9GGy8mgT4TjabQ';
        this.webhookUrl = process.env.ZENOPAY_WEBHOOK_URL || `${process.env.APP_URL}/api/payments/webhook/zenopay`;
    }

    /**
     * Process mobile money payment via ZenoPay
     * @param {Object} paymentData - Payment information
     * @returns {Promise<Object>} Payment response
     */
    async processMobileMoneyPayment(paymentData) {
        try {
            const { bookingId, userEmail, userName, userPhone, amount } = paymentData;

            // Generate unique order ID
            const orderId = `DLS_${bookingId}_${uuidv4()}`;

            const requestPayload = {
                order_id: orderId,
                buyer_email: userEmail,
                buyer_name: userName,
                buyer_phone: this.formatPhoneNumber(userPhone),
                amount: Math.round(amount), // ZenoPay expects integer amount
                webhook_url: this.webhookUrl
            };

            const response = await axios.post(
                `${this.apiUrl}/mobile_money_tanzania`,
                requestPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey
                    },
                    timeout: 30000 // 30 seconds timeout
                }
            );

            return {
                success: true,
                data: {
                    orderId,
                    zenoOrderId: response.data.data?.order_id,
                    reference: response.data.reference,
                    status: response.data.result,
                    message: response.data.message,
                    transactionId: response.data.data?.transid,
                    channel: response.data.data?.channel,
                    msisdn: response.data.data?.msisdn
                }
            };

        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.response?.data?.message || error.message,
                    code: error.response?.status || 500,
                    details: error.response?.data
                }
            };
        }
    }

    async processMobileMoneyPaymentWithOrderId(paymentData) {
        try {
            const { orderId, userEmail, userName, userPhone, amount } = paymentData;

            const requestPayload = {
                order_id: orderId, // Use provided order ID
                buyer_email: userEmail,
                buyer_name: userName,
                buyer_phone: this.formatPhoneNumber(userPhone),
                amount: Math.round(amount),
                webhook_url: this.webhookUrl
            };

            const response = await axios.post(
                `${this.apiUrl}/mobile_money_tanzania`,
                requestPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey
                    },
                    timeout: 30000
                }
            );

            return {
                success: true,
                data: {
                    orderId,
                    zenoOrderId: response.data.data?.order_id,
                    reference: response.data.reference,
                    status: response.data.result,
                    message: response.data.message,
                    transactionId: response.data.data?.transid,
                    channel: response.data.data?.channel,
                    msisdn: response.data.data?.msisdn
                }
            };

        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.response?.data?.message || error.message,
                    code: error.response?.status || 500,
                    details: error.response?.data
                }
            };
        }
    }

    /**
     * Check payment status
     * @param {string} orderId - ZenoPay order ID
     * @returns {Promise<Object>} Payment status
     */
    async checkPaymentStatus(orderId) {
        try {
            const response = await axios.get(
                `${this.apiUrl}/order-status`,
                {
                    params: { order_id: orderId },
                    headers: {
                        'x-api-key': this.apiKey
                    },
                    timeout: 10000
                }
            );

            return {
                success: true,
                data: {
                    orderId: response.data.data[0]?.order_id,
                    status: response.data.data[0]?.payment_status,
                    amount: response.data.data[0]?.amount,
                    transactionId: response.data.data[0]?.transid,
                    channel: response.data.data[0]?.channel,
                    reference: response.data.data[0]?.reference,
                    msisdn: response.data.data[0]?.msisdn,
                    creationDate: response.data.data[0]?.creation_date
                }
            };

        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.response?.data?.message || error.message,
                    code: error.response?.status || 500
                }
            };
        }
    }

    /**
     * Verify webhook signature (if ZenoPay implements this)
     * @param {Object} payload - Webhook payload
     * @param {string} signature - Webhook signature
     * @returns {boolean} Verification result
     */
    verifyWebhookSignature(payload, signature) {
        // ZenoPay sends x-api-key in webhook headers for verification
        return signature === this.apiKey;
    }

    /**
     * Format phone number to ZenoPay expected format
     * @param {string} phone - Phone number
     * @returns {string} Formatted phone number
     */
    formatPhoneNumber(phone) {
        // Remove all non-digit characters
        const cleanPhone = phone.replace(/\D/g, '');

        // Convert to 07XXXXXXXX format
        if (cleanPhone.startsWith('255')) {
            return '0' + cleanPhone.substring(3);
        } else if (cleanPhone.startsWith('07')) {
            return cleanPhone;
        } else if (cleanPhone.startsWith('7')) {
            return '0' + cleanPhone;
        }

        return cleanPhone;
    }

    /**
     * Map ZenoPay status to internal status
     * @param {string} zenoStatus - ZenoPay status
     * @returns {string} Internal status
     */
    mapPaymentStatus(zenoStatus) {
        const statusMap = {
            'COMPLETED': 'completed',
            'PENDING': 'pending',
            'FAILED': 'failed',
            'SUCCESS': 'completed',
            'CANCELED': 'failed',
            'EXPIRED': 'failed'
        };

        return statusMap[zenoStatus?.toUpperCase()] || 'pending';
    }
}

module.exports = new ZenoPayService();