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

        // Create wallet if it doesn't exist
        if (!wallet) {
            wallet = await Wallet.create({
                user_id: req.userId,
                balance: 0.00
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                balance: parseFloat(wallet.balance),
                currency: wallet.currency,
                status: wallet.status,
                daily_limit: parseFloat(wallet.daily_limit),
                monthly_limit: parseFloat(wallet.monthly_limit)
            }
        });
    } catch (error) {
        console.error('Get wallet balance error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get wallet balance'
        });
    }
};

// Top up wallet
exports.topUpWallet = async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const { amount, payment_method, phone_number } = req.body;

        // Validate amount
        if (!amount || amount <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid amount'
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
                balance: 0.00
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
                message: `Daily top-up limit exceeded. Remaining: ${wallet.daily_limit - (dailyTopups || 0)} ${wallet.currency}`
            });
        }

        const balanceBefore = parseFloat(wallet.balance);
        let topupTransaction;
        let paymentResult;

        if (payment_method === 'mobile_money') {
            // Process mobile money payment via ZenoPay
            const user = await User.findByPk(req.userId);

            const zenoPaymentData = {
                bookingId: `TOPUP_${Date.now()}`,
                userEmail: user.email,
                userName: `${user.first_name} ${user.last_name}`,
                userPhone: phone_number,
                amount: amount
            };

            paymentResult = await zenoPayService.processMobileMoneyPayment(zenoPaymentData);

            if (!paymentResult.success) {
                await transaction.rollback();
                return res.status(400).json({
                    status: 'error',
                    message: 'Failed to initiate mobile money payment',
                    details: paymentResult.error
                });
            }

            // Create pending wallet transaction
            topupTransaction = await WalletTransaction.create({
                wallet_id: wallet.wallet_id,
                user_id: req.userId,
                type: 'topup',
                amount: amount,
                balance_before: balanceBefore,
                balance_after: balanceBefore,
                reference_type: 'topup',
                external_reference: paymentResult.data.orderId,
                description: `Wallet top-up via ${payment_method}`,
                metadata: {
                    zenopay_data: paymentResult.data,
                    phone_number
                },
                status: 'pending'
            }, { transaction });

            await transaction.commit();

            res.status(200).json({
                status: 'success',
                message: 'Top-up initiated. Complete payment on your phone.',
                data: {
                    transaction_id: topupTransaction.transaction_id,
                    amount: amount,
                    status: 'pending',
                    zenopay: {
                        order_id: paymentResult.data.orderId,
                        reference: paymentResult.data.reference,
                        message: paymentResult.data.message,
                        instructions: 'Please complete the payment on your mobile phone using the USSD prompt.'
                    }
                }
            });

        } else {
            // For instant methods like card/bank
            const balanceAfter = balanceBefore + amount;

            await wallet.update({
                balance: balanceAfter,
                last_activity: new Date()
            }, { transaction });

            topupTransaction = await WalletTransaction.create({
                wallet_id: wallet.wallet_id,
                user_id: req.userId,
                type: 'topup',
                amount: amount,
                balance_before: balanceBefore,
                balance_after: balanceAfter,
                reference_type: 'topup',
                description: `Wallet top-up via ${payment_method}`,
                status: 'completed'
            }, { transaction });

            await transaction.commit();

            // Create notification
            await Notification.create({
                user_id: req.userId,
                title: 'Wallet Top-up Successful',
                message: `Your wallet has been topped up with ${amount} ${wallet.currency}. New balance: ${balanceAfter} ${wallet.currency}`,
                type: 'success',
                related_entity: 'wallet',
                related_id: topupTransaction.transaction_id
            });

            res.status(200).json({
                status: 'success',
                message: 'Wallet topped up successfully',
                data: {
                    transaction_id: topupTransaction.transaction_id,
                    amount: amount,
                    balance: balanceAfter,
                    status: 'completed'
                }
            });
        }

    } catch (error) {
        await transaction.rollback();
        console.error('Wallet top-up error:', error);
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
                message: 'Insufficient wallet balance'
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
        console.error('Wallet payment error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to process wallet payment'
        });
    }
};

// Get wallet transactions
exports.getWalletTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 20, type } = req.query;
        const offset = (page - 1) * limit;

        const whereClause = { user_id: req.userId };
        if (type) {
            whereClause.type = type;
        }

        const transactions = await WalletTransaction.findAndCountAll({
            where: whereClause,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [
                {
                    model: Wallet,
                    attributes: ['currency']
                }
            ]
        });

        res.status(200).json({
            status: 'success',
            data: {
                transactions: transactions.rows,
                pagination: {
                    total: transactions.count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(transactions.count / limit)
                }
            }
        });

    } catch (error) {
        console.error('Get wallet transactions error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get wallet transactions'
        });
    }
};