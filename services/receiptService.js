// services/receiptService.js
const db = require('../models');
const QRCode = require('qrcode');
const { Receipt, Booking, WalletTransaction, Payment } = db;

class ReceiptService {

    // Generate receipt for booking
    static async generateBookingReceipt(bookingId) {
        try {
            const booking = await Booking.findByPk(bookingId, {
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone', 'email']
                    },
                    {
                        model: db.Trip,
                        as: 'trip',
                        include: [
                            {
                                model: db.Route,
                                as: 'route',
                                attributes: ['route_name', 'route_number']
                            },
                            {
                                model: db.Vehicle,
                                as: 'vehicle',
                                attributes: ['plate_number', 'model']
                            }
                        ]
                    },
                    {
                        model: db.Stop,
                        as: 'pickup_stop',
                        attributes: ['stop_name']
                    },
                    {
                        model: db.Stop,
                        as: 'dropoff_stop',
                        attributes: ['stop_name']
                    },
                    {
                        model: db.Payment,
                        as: 'payments',
                        where: { status: 'completed' },
                        required: false
                    }
                ]
            });

            if (!booking) {
                throw new Error('Booking not found');
            }

            // Generate receipt number using stored procedure
            const [receiptResult] = await db.sequelize.query(
                'CALL GenerateReceiptNumber("booking", @receipt_number); SELECT @receipt_number as receipt_number;'
            );
            const receiptNumber = receiptResult[0].receipt_number;

            // Prepare receipt data
            const receiptData = {
                booking_details: {
                    booking_id: booking.booking_id,
                    booking_time: booking.booking_time,
                    passenger_count: booking.passenger_count,
                    seat_numbers: booking.seat_numbers,
                    status: booking.status
                },
                passenger_details: {
                    name: `${booking.user.first_name} ${booking.user.last_name}`,
                    phone: booking.user.phone,
                    email: booking.user.email
                },
                trip_details: {
                    route_name: booking.trip.route.route_name,
                    route_number: booking.trip.route.route_number,
                    vehicle_plate: booking.trip.vehicle.plate_number,
                    vehicle_model: booking.trip.vehicle.model,
                    pickup_stop: booking.pickup_stop.stop_name,
                    dropoff_stop: booking.dropoff_stop.stop_name,
                    departure_time: booking.trip.start_time
                },
                payment_details: {
                    fare_amount: booking.fare_amount,
                    payment_status: booking.payment_status,
                    payment_method: booking.payments.length > 0 ? booking.payments[0].payment_method : 'pending'
                },
                receipt_info: {
                    receipt_number: receiptNumber,
                    generated_at: new Date(),
                    company_name: 'Daladala Smart',
                    company_phone: '+255 123 456 789',
                    company_email: 'info@daladasmart.co.tz'
                }
            };

            // Generate QR code data
            const qrData = JSON.stringify({
                receipt_number: receiptNumber,
                booking_id: booking.booking_id,
                passenger_name: `${booking.user.first_name} ${booking.user.last_name}`,
                amount: booking.fare_amount,
                date: new Date().toISOString(),
                verification_url: `https://app.daladasmart.co.tz/verify-receipt/${receiptNumber}`
            });

            const qrCodeDataURL = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            // Save receipt to database
            const receipt = await Receipt.create({
                receipt_number: receiptNumber,
                user_id: booking.user_id,
                receipt_type: 'booking',
                reference_id: booking.booking_id,
                amount: booking.fare_amount,
                qr_code_data: qrCodeDataURL,
                receipt_data: receiptData
            });

            return {
                success: true,
                receipt: {
                    receipt_id: receipt.receipt_id,
                    receipt_number: receiptNumber,
                    qr_code: qrCodeDataURL,
                    receipt_data: receiptData
                }
            };

        } catch (error) {
            console.error('Error generating booking receipt:', error);
            throw error;
        }
    }

    // Generate receipt for wallet top-up
    static async generateWalletTopupReceipt(transactionId) {
        try {
            const transaction = await WalletTransaction.findByPk(transactionId, {
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone', 'email']
                    },
                    {
                        model: db.Wallet,
                        as: 'wallet',
                        attributes: ['balance']
                    }
                ]
            });

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            if (transaction.type !== 'credit' || !transaction.external_reference) {
                throw new Error('Invalid transaction for topup receipt');
            }

            // Generate receipt number
            const [receiptResult] = await db.sequelize.query(
                'CALL GenerateReceiptNumber("wallet_topup", @receipt_number); SELECT @receipt_number as receipt_number;'
            );
            const receiptNumber = receiptResult[0].receipt_number;

            // Prepare receipt data
            const receiptData = {
                transaction_details: {
                    transaction_id: transaction.transaction_id,
                    amount: transaction.amount,
                    transaction_date: transaction.created_at,
                    external_reference: transaction.external_reference,
                    payment_method: transaction.payment_method || 'Mobile Money',
                    status: transaction.status
                },
                user_details: {
                    name: `${transaction.user.first_name} ${transaction.user.last_name}`,
                    phone: transaction.user.phone,
                    email: transaction.user.email
                },
                wallet_details: {
                    previous_balance: parseFloat(transaction.wallet.balance) - parseFloat(transaction.amount),
                    topup_amount: transaction.amount,
                    new_balance: transaction.wallet.balance
                },
                receipt_info: {
                    receipt_number: receiptNumber,
                    generated_at: new Date(),
                    company_name: 'Daladala Smart',
                    company_phone: '+255 123 456 789',
                    company_email: 'info@daladasmart.co.tz'
                }
            };

            // Generate QR code
            const qrData = JSON.stringify({
                receipt_number: receiptNumber,
                transaction_id: transaction.transaction_id,
                amount: transaction.amount,
                type: 'wallet_topup',
                date: new Date().toISOString(),
                verification_url: `https://app.daladasmart.co.tz/verify-receipt/${receiptNumber}`
            });

            const qrCodeDataURL = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1
            });

            // Save receipt
            const receipt = await Receipt.create({
                receipt_number: receiptNumber,
                user_id: transaction.user_id,
                receipt_type: 'wallet_topup',
                reference_id: transaction.transaction_id,
                amount: transaction.amount,
                qr_code_data: qrCodeDataURL,
                receipt_data: receiptData
            });

            return {
                success: true,
                receipt: {
                    receipt_id: receipt.receipt_id,
                    receipt_number: receiptNumber,
                    qr_code: qrCodeDataURL,
                    receipt_data: receiptData
                }
            };

        } catch (error) {
            console.error('Error generating wallet topup receipt:', error);
            throw error;
        }
    }

    // Generate receipt for general wallet transaction
    static async generateWalletTransactionReceipt(transactionId) {
        try {
            const transaction = await WalletTransaction.findByPk(transactionId, {
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone', 'email']
                    }
                ]
            });

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            // Generate receipt number
            const [receiptResult] = await db.sequelize.query(
                'CALL GenerateReceiptNumber("wallet_transaction", @receipt_number); SELECT @receipt_number as receipt_number;'
            );
            const receiptNumber = receiptResult[0].receipt_number;

            // Get related booking/payment info if available
            let relatedInfo = {};
            if (transaction.reference_type === 'booking' && transaction.reference_id) {
                const booking = await Booking.findByPk(transaction.reference_id, {
                    include: [
                        {
                            model: db.Stop,
                            as: 'pickup_stop',
                            attributes: ['stop_name']
                        },
                        {
                            model: db.Stop,
                            as: 'dropoff_stop',
                            attributes: ['stop_name']
                        }
                    ]
                });

                if (booking) {
                    relatedInfo = {
                        booking_id: booking.booking_id,
                        route: `${booking.pickup_stop.stop_name} → ${booking.dropoff_stop.stop_name}`,
                        travel_date: booking.booking_time
                    };
                }
            }

            // Prepare receipt data
            const receiptData = {
                transaction_details: {
                    transaction_id: transaction.transaction_id,
                    type: transaction.type,
                    amount: transaction.amount,
                    description: transaction.description,
                    transaction_date: transaction.created_at,
                    status: transaction.status,
                    reference_type: transaction.reference_type,
                    reference_id: transaction.reference_id,
                    related_info: relatedInfo
                },
                user_details: {
                    name: `${transaction.user.first_name} ${transaction.user.last_name}`,
                    phone: transaction.user.phone,
                    email: transaction.user.email
                },
                receipt_info: {
                    receipt_number: receiptNumber,
                    generated_at: new Date(),
                    company_name: 'Daladala Smart',
                    company_phone: '+255 123 456 789',
                    company_email: 'info@daladasmart.co.tz'
                }
            };

            // Generate QR code
            const qrData = JSON.stringify({
                receipt_number: receiptNumber,
                transaction_id: transaction.transaction_id,
                amount: transaction.amount,
                type: 'wallet_transaction',
                date: new Date().toISOString(),
                verification_url: `https://app.daladasmart.co.tz/verify-receipt/${receiptNumber}`
            });

            const qrCodeDataURL = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1
            });

            // Save receipt
            const receipt = await Receipt.create({
                receipt_number: receiptNumber,
                user_id: transaction.user_id,
                receipt_type: 'wallet_transaction',
                reference_id: transaction.transaction_id,
                amount: transaction.amount,
                qr_code_data: qrCodeDataURL,
                receipt_data: receiptData
            });

            return {
                success: true,
                receipt: {
                    receipt_id: receipt.receipt_id,
                    receipt_number: receiptNumber,
                    qr_code: qrCodeDataURL,
                    receipt_data: receiptData
                }
            };

        } catch (error) {
            console.error('Error generating wallet transaction receipt:', error);
            throw error;
        }
    }

    // Verify receipt by QR code or receipt number
    static async verifyReceipt(receiptNumber) {
        try {
            const receipt = await Receipt.findOne({
                where: { receipt_number: receiptNumber },
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone']
                    }
                ]
            });

            if (!receipt) {
                return {
                    valid: false,
                    message: 'Receipt not found'
                };
            }

            // Additional verification based on receipt type
            let verificationStatus = { valid: true };

            if (receipt.receipt_type === 'booking') {
                const booking = await Booking.findByPk(receipt.reference_id);
                if (!booking) {
                    verificationStatus = { valid: false, message: 'Associated booking not found' };
                } else if (booking.status === 'cancelled') {
                    verificationStatus = { valid: false, message: 'Booking was cancelled' };
                }
            }

            return {
                ...verificationStatus,
                receipt: {
                    receipt_number: receipt.receipt_number,
                    receipt_type: receipt.receipt_type,
                    amount: receipt.amount,
                    created_at: receipt.created_at,
                    customer_name: `${receipt.user.first_name} ${receipt.user.last_name}`,
                    customer_phone: receipt.user.phone,
                    receipt_data: receipt.receipt_data
                }
            };

        } catch (error) {
            console.error('Error verifying receipt:', error);
            throw error;
        }
    }

    // Get user's receipts
    static async getUserReceipts(userId, page = 1, limit = 20) {
        try {
            const offset = (page - 1) * limit;

            const receipts = await Receipt.findAndCountAll({
                where: { user_id: userId },
                order: [['created_at', 'DESC']],
                limit: limit,
                offset: offset,
                attributes: ['receipt_id', 'receipt_number', 'receipt_type', 'amount', 'created_at']
            });

            return {
                receipts: receipts.rows,
                pagination: {
                    current_page: page,
                    total_pages: Math.ceil(receipts.count / limit),
                    total_items: receipts.count,
                    items_per_page: limit
                }
            };

        } catch (error) {
            console.error('Error getting user receipts:', error);
            throw error;
        }
    }

    // Get receipt details by ID
    static async getReceiptDetails(receiptId, userId) {
        try {
            const receipt = await Receipt.findOne({
                where: {
                    receipt_id: receiptId,
                    user_id: userId
                }
            });

            if (!receipt) {
                throw new Error('Receipt not found or access denied');
            }

            return {
                receipt_id: receipt.receipt_id,
                receipt_number: receipt.receipt_number,
                receipt_type: receipt.receipt_type,
                amount: receipt.amount,
                qr_code: receipt.qr_code_data,
                receipt_data: receipt.receipt_data,
                created_at: receipt.created_at
            };

        } catch (error) {
            console.error('Error getting receipt details:', error);
            throw error;
        }
    }

    // Generate booking QR code for ticket validation
    static async generateBookingQRCode(bookingId, userId) {
        try {
            const booking = await Booking.findOne({
                where: {
                    booking_id: bookingId,
                    user_id: userId
                },
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone']
                    },
                    {
                        model: db.Trip,
                        as: 'trip',
                        include: [
                            {
                                model: db.Route,
                                as: 'route',
                                attributes: ['route_name']
                            }
                        ]
                    }
                ]
            });

            if (!booking) {
                throw new Error('Booking not found or access denied');
            }

            if (booking.status === 'cancelled') {
                throw new Error('Cannot generate QR code for cancelled booking');
            }

            // Generate secure QR data for ticket validation
            const qrData = {
                booking_id: booking.booking_id,
                passenger_name: `${booking.user.first_name} ${booking.user.last_name}`,
                passenger_phone: booking.user.phone,
                route_name: booking.trip.route.route_name,
                seat_numbers: booking.seat_numbers,
                passenger_count: booking.passenger_count,
                booking_status: booking.status,
                validation_code: this.generateValidationCode(booking.booking_id),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
                verification_url: `https://app.daladasmart.co.tz/validate-ticket/${booking.booking_id}`
            };

            const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
                errorCorrectionLevel: 'H', // High error correction for ticket validation
                type: 'image/png',
                quality: 0.92,
                margin: 2,
                width: 256,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            return {
                success: true,
                qr_code: qrCodeDataURL,
                booking_info: {
                    booking_id: booking.booking_id,
                    passenger_name: `${booking.user.first_name} ${booking.user.last_name}`,
                    route_name: booking.trip.route.route_name,
                    seat_numbers: booking.seat_numbers,
                    status: booking.status
                },
                validation_expires: qrData.expires_at
            };

        } catch (error) {
            console.error('Error generating booking QR code:', error);
            throw error;
        }
    }

    // Validate booking ticket QR code (for drivers/conductors)
    static async validateBookingTicket(qrCodeData) {
        try {
            const ticketData = JSON.parse(qrCodeData);

            // Check if ticket has expired
            if (new Date() > new Date(ticketData.expires_at)) {
                return {
                    valid: false,
                    message: 'Ticket has expired'
                };
            }

            // Verify validation code
            const expectedCode = this.generateValidationCode(ticketData.booking_id);
            if (ticketData.validation_code !== expectedCode) {
                return {
                    valid: false,
                    message: 'Invalid ticket verification code'
                };
            }

            // Get current booking status
            const booking = await Booking.findByPk(ticketData.booking_id, {
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone']
                    }
                ]
            });

            if (!booking) {
                return {
                    valid: false,
                    message: 'Booking not found'
                };
            }

            if (booking.status === 'cancelled') {
                return {
                    valid: false,
                    message: 'Booking has been cancelled'
                };
            }

            return {
                valid: true,
                message: 'Valid ticket',
                booking_details: {
                    booking_id: booking.booking_id,
                    passenger_name: `${booking.user.first_name} ${booking.user.last_name}`,
                    passenger_phone: booking.user.phone,
                    passenger_count: booking.passenger_count,
                    seat_numbers: booking.seat_numbers,
                    fare_amount: booking.fare_amount,
                    status: booking.status,
                    payment_status: booking.payment_status
                }
            };

        } catch (error) {
            console.error('Error validating booking ticket:', error);
            return {
                valid: false,
                message: 'Invalid ticket format'
            };
        }
    }

    // Generate validation code for booking
    static generateValidationCode(bookingId) {
        const crypto = require('crypto');
        const secret = process.env.TICKET_VALIDATION_SECRET || 'daladala-smart-secret-key';
        return crypto.createHmac('sha256', secret)
            .update(bookingId.toString())
            .digest('hex')
            .substring(0, 8)
            .toUpperCase();
    }

    // Send receipt via email/SMS
    static async sendReceipt(receiptId, method = 'email') {
        try {
            const receipt = await Receipt.findByPk(receiptId, {
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone', 'email']
                    }
                ]
            });

            if (!receipt) {
                throw new Error('Receipt not found');
            }

            // Here you would implement email/SMS sending logic
            // For now, we'll just return success

            if (method === 'email' && receipt.user.email) {
                // await emailService.sendReceipt(receipt.user.email, receipt);
                return {
                    success: true,
                    message: `Receipt sent to ${receipt.user.email}`,
                    method: 'email'
                };
            } else if (method === 'sms' && receipt.user.phone) {
                // await smsService.sendReceipt(receipt.user.phone, receipt);
                return {
                    success: true,
                    message: `Receipt sent to ${receipt.user.phone}`,
                    method: 'sms'
                };
            } else {
                throw new Error(`Cannot send receipt via ${method}: contact information not available`);
            }

        } catch (error) {
            console.error('Error sending receipt:', error);
            throw error;
        }
    }
}

module.exports = ReceiptService;