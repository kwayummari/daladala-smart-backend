const db = require('../models');
const { Wallet, WalletTransaction, Payment, Booking, User, Notification } = db;
const zenoPayService = require('../services/zenoPayService');
const { Op } = require('sequelize');

// Get wallet balance
exports.getWalletBalance = async (req, res) => {
    try {
        let wallet = await Wallet.findOne({
            where: { user_id: req.userId }
        });

        if (!wallet) {
            wallet = await Wallet.create({
                user_id: req.userId,
                balance: 0.00,
                currency: 'TZS',
                status: 'active'
            });
        }

        // 🔥 FIX: Ensure proper response format
        res.status(200).json({
            status: 'success',
            data: {
                wallet_id: wallet.wallet_id,
                user_id: wallet.user_id,
                balance: parseFloat(wallet.balance) || 0.0,  // ✅ Ensure number format
                currency: wallet.currency || 'TZS',
                status: wallet.status,
                daily_limit: parseFloat(wallet.daily_limit) || 1000000.0,
                monthly_limit: parseFloat(wallet.monthly_limit) || 5000000.0,
                created_at: wallet.created_at,
                updated_at: wallet.updated_at,
                last_activity: wallet.last_activity
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch wallet balance'
        });
    }
};
  

// Top up wallet
exports.topUpWallet = async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const { amount, phone_number } = req.body;

        // Validate input
        if (!amount || !phone_number) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Amount and phone number are required'
            });
        }

        // Validate amount
        if (amount < 1000) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Minimum top-up amount is 1,000 TZS'
            });
        }

        if (amount > 5000000) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Maximum top-up amount is 5,000,000 TZS'
            });
        }

        // Validate phone number format
        const phoneRegex = /^(0|255)7\d{8}$/;
        if (!phoneRegex.test(phone_number.replace(/[\s\-\+]/g, ''))) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Invalid Tanzanian phone number. Use format: 0744963858'
            });
        }

        // Get or create wallet
        let wallet = await Wallet.findOne({
            where: { user_id: req.userId },
            transaction
        });

        if (!wallet) {
            wallet = await Wallet.create({
                user_id: req.userId,
                balance: 0.00,
                currency: 'TZS',
                daily_limit: 1000000.00,
                monthly_limit: 10000000.00,
                is_active: true
            }, { transaction });
        }

        // Check daily limit
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dailyTopups = await WalletTransaction.sum('amount', {
            where: {
                user_id: req.userId,
                type: 'topup',
                status: 'completed',
                created_at: {
                    [Op.gte]: today
                }
            },
            transaction
        });

        if ((dailyTopups || 0) + amount > wallet.daily_limit) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: `Daily top-up limit exceeded. Remaining: ${wallet.daily_limit - (dailyTopups || 0)} TZS`
            });
        }

        // Get user details for payment
        const user = await User.findByPk(req.userId);
        if (!user) {
            await transaction.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        const balanceBefore = parseFloat(wallet.balance);

        // Process mobile money payment via ZenoPay
        const zenoPaymentData = {
            bookingId: `TOPUP_${Date.now()}_${req.userId}`,
            userEmail: user.email,
            userName: `${user.first_name} ${user.last_name}`,
            userPhone: phone_number,
            amount: amount
        };

        const paymentResult = await zenoPayService.processMobileMoneyPayment(zenoPaymentData);

        if (!paymentResult.success) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Failed to initiate mobile money payment',
                details: paymentResult.error
            });
        }

        // Create pending wallet transaction
        const topupTransaction = await WalletTransaction.create({
            wallet_id: wallet.wallet_id,
            user_id: req.userId,
            type: 'topup',
            amount: amount,
            balance_before: balanceBefore,
            balance_after: balanceBefore, // Will be updated when webhook confirms
            reference_type: 'topup',
            external_reference: paymentResult.data.orderId,
            description: `Wallet top-up via mobile money`,
            metadata: {
                zenopay_data: paymentResult.data,
                phone_number: phone_number,
                zenopay_order_id: paymentResult.data.zenoOrderId
            },
            status: 'pending'
        }, { transaction });

        await transaction.commit();

        res.status(200).json({
            status: 'success',
            message: 'Top-up initiated. Please complete payment on your phone.',
            data: {
                transaction_id: topupTransaction.transaction_id,
                amount: amount,
                status: 'pending',
                zenopay: {
                    order_id: paymentResult.data.orderId,
                    reference: paymentResult.data.reference,
                    message: paymentResult.data.message,
                    instructions: 'Please complete the payment on your mobile phone using the USSD prompt sent to your phone.'
                }
            }
        });

    } catch (error) {
        await transaction.rollback();
        res.status(500).json({
            status: 'error',
            message: 'Failed to process wallet top-up'
        });
    }
};

// Process wallet payment for booking
exports.processWalletPayment = async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const { booking_id } = req.body;

        if (!booking_id) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Booking ID is required'
            });
        }

        // Get booking details
        const booking = await Booking.findOne({
            where: {
                booking_id,
                user_id: req.userId
            },
            transaction
        });

        if (!booking) {
            await transaction.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        if (booking.payment_status === 'paid') {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Booking is already paid'
            });
        }

        // Get wallet
        const wallet = await Wallet.findOne({
            where: { user_id: req.userId },
            transaction
        });

        if (!wallet) {
            await transaction.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'Wallet not found'
            });
        }

        // Check balance
        if (parseFloat(wallet.balance) < parseFloat(booking.fare_amount)) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: `Insufficient wallet balance. Required: ${booking.fare_amount} TZS, Available: ${wallet.balance} TZS`
            });
        }

        const balanceBefore = parseFloat(wallet.balance);
        const balanceAfter = balanceBefore - parseFloat(booking.fare_amount);

        // Update wallet balance
        await wallet.update({
            balance: balanceAfter,
            last_activity: new Date()
        }, { transaction });

        // Create wallet transaction
        const walletTransaction = await WalletTransaction.create({
            wallet_id: wallet.wallet_id,
            user_id: req.userId,
            type: 'payment',
            amount: parseFloat(booking.fare_amount),
            balance_before: balanceBefore,
            balance_after: balanceAfter,
            reference_type: 'booking',
            reference_id: booking_id,
            description: `Payment for booking #${booking_id}`,
            status: 'completed'
        }, { transaction });

        // Create payment record
        const payment = await Payment.create({
            booking_id,
            user_id: req.userId,
            amount: booking.fare_amount,
            currency: wallet.currency,
            payment_method: 'wallet',
            transaction_id: `WALLET_${walletTransaction.transaction_id}`,
            payment_time: new Date(),
            status: 'completed',
            payment_details: {
                wallet_transaction_id: walletTransaction.transaction_id,
                balance_before: balanceBefore,
                balance_after: balanceAfter
            }
        }, { transaction });

        // Update booking
        await booking.update({
            payment_status: 'paid',
            status: 'confirmed'
        }, { transaction });

        await transaction.commit();

        // Create notification
        await Notification.create({
            user_id: req.userId,
            title: 'Payment Successful',
            message: `Your booking #${booking_id} has been paid using wallet. Amount: ${booking.fare_amount} ${wallet.currency}`,
            type: 'success',
            related_entity: 'payment',
            related_id: payment.payment_id
        });

        res.status(200).json({
            status: 'success',
            message: 'Payment completed successfully',
            data: {
                payment_id: payment.payment_id,
                booking_id: booking_id,
                amount: booking.fare_amount,
                wallet_balance: balanceAfter,
                transaction_id: payment.transaction_id,
                status: 'completed'
            }
        });

    } catch (error) {
        await transaction.rollback();
        res.status(500).json({
            status: 'error',
            message: 'Failed to process wallet payment'
        });
    }
};

// Get wallet transactions
exports.getWalletTransactions = async (req, res) => {
    try {
        const wallet = await Wallet.findOne({
            where: { user_id: req.userId }
        });

        if (!wallet) {
            return res.status(404).json({
                status: 'error',
                message: 'Wallet not found'
            });
        }

        const transactions = await WalletTransaction.findAll({
            where: { wallet_id: wallet.wallet_id },
            order: [['created_at', 'DESC']],
            limit: 50 // Limit to recent 50 transactions
        });

        // 🔥 FIX: Format transaction response properly
        const formattedTransactions = transactions.map(transaction => ({
            transaction_id: transaction.transaction_id,
            wallet_id: transaction.wallet_id,
            user_id: transaction.user_id,
            type: transaction.type,
            amount: parseFloat(transaction.amount) || 0.0,
            balance_before: parseFloat(transaction.balance_before) || 0.0,
            balance_after: parseFloat(transaction.balance_after) || 0.0,
            reference_type: transaction.reference_type,
            reference_id: transaction.reference_id,
            description: transaction.description,
            status: transaction.status,
            created_at: transaction.created_at,
            updated_at: transaction.updated_at
        }));

        res.status(200).json({
            status: 'success',
            data: {
                wallet: {
                    wallet_id: wallet.wallet_id,
                    balance: parseFloat(wallet.balance) || 0.0,
                    currency: wallet.currency
                },
                transactions: formattedTransactions
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch wallet transactions'
        });
    }
  };
