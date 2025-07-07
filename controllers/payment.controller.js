// controllers/payment.controller.js - COMPLETE VERSION
const db = require('../models');
const Payment = db.Payment;
const Booking = db.Booking;
const User = db.User;
const Wallet = db.Wallet;
const WalletTransaction = db.WalletTransaction;
const Notification = db.Notification;
const zenoPayService = require('../services/zenoPayService');
const notificationService = require('../services/notificationService');

// Helper function to get wallet balance
async function getWalletBalance(userId) {
  const wallet = await Wallet.findOne({ where: { user_id: userId } });
  return wallet ? parseFloat(wallet.balance) : 0;
}

// Helper function to deduct from wallet
async function deductFromWallet(userId, amount, bookingId) {
  const transaction = await db.sequelize.transaction();
  try {
    const wallet = await Wallet.findOne({
      where: { user_id: userId }
    }, { transaction });

    if (!wallet || parseFloat(wallet.balance) < amount) {
      await transaction.rollback();
      return false;
    }

    const balanceBefore = parseFloat(wallet.balance);
    const balanceAfter = balanceBefore - amount;

    // Update wallet balance
    await wallet.update({
      balance: balanceAfter,
      last_activity: new Date()
    }, { transaction });

    // Create wallet transaction record
    await WalletTransaction.create({
      wallet_id: wallet.wallet_id,
      user_id: userId,
      type: 'payment',
      amount: amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      reference_type: 'booking',
      reference_id: bookingId,
      description: `Payment for booking #${bookingId}`,
      status: 'completed'
    }, { transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// Process payment
exports.processPayment = async (req, res) => {
  try {
    const { booking_id, payment_method, phone_number } = req.body;

    // Validate required fields
    if (!booking_id || !payment_method) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking ID and payment method are required',
        received: { booking_id, payment_method }
      });
    }

    // Convert booking_id to proper format if needed
    const bookingIdToSearch = parseInt(booking_id);

    // Check if booking exists and belongs to user
    const booking = await Booking.findOne({
      where: {
        booking_id: bookingIdToSearch,
        user_id: req.userId
      },
      include: [{
        model: db.Trip,
        include: [{
          model: db.Route,
          attributes: ['route_name', 'start_point', 'end_point']
        }]
      }]
    });

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found or does not belong to you'
      });
    }

    console.log('💳 Processing payment for booking:');
    console.log('   Booking ID:', booking.booking_id);
    console.log('   Fare Amount:', booking.fare_amount);
    console.log('   Payment Method:', payment_method);

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      where: { booking_id: booking.booking_id }
    });

    if (existingPayment && existingPayment.status === 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment already completed for this booking'
      });
    }

    let responseData = {};
    const amount = parseFloat(booking.fare_amount);

    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid booking amount',
        debug: {
          fare_amount: booking.fare_amount,
          parsed_amount: amount
        }
      });
    }

    if (payment_method === 'wallet') {
      // Handle wallet payment
      const success = await deductFromWallet(req.userId, amount, booking.booking_id);

      if (!success) {
        return res.status(400).json({
          status: 'error',
          message: 'Insufficient wallet balance'
        });
      }

      // Create payment record
      const payment = await Payment.create({
        booking_id: booking.booking_id,
        user_id: req.userId,
        amount: amount,
        payment_method: 'wallet',
        status: 'completed',
        payment_time: new Date()
      });

      // Update booking status
      await booking.update({
        status: 'confirmed',
        payment_status: 'paid'
      });

      // Send beautiful notifications
      await notificationService.sendPaymentConfirmation({
        payment,
        user: await User.findByPk(req.userId),
        booking,
        trip: booking.Trip,
        route: booking.Trip?.Route
      });

      responseData = {
        payment_id: payment.payment_id,
        amount: amount,
        payment_method: 'wallet',
        status: 'completed'
      };

    } else if (payment_method === 'mobile_money') {
      if (!phone_number) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is required for mobile money payment'
        });
      }

      // Get user details
      const user = await User.findByPk(req.userId);

      // 🔥 GENERATE ORDER ID FIRST - before creating payment
      const orderId = `DLS_${booking.booking_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log('📝 Generated Order ID:', orderId);

      // Create payment record with the order ID we'll send to ZenoPay
      const payment = await Payment.create({
        booking_id: booking.booking_id,
        user_id: req.userId,
        amount: amount,
        payment_method: 'mobile_money',
        payment_provider: 'zenopay',
        status: 'pending',
        external_reference: orderId, // 🔥 SET THIS BEFORE CALLING ZENOPAY
        initiated_time: new Date()
      });

      console.log('💳 Payment record created:', {
        payment_id: payment.payment_id,
        external_reference: orderId,
        booking_id: booking.booking_id
      });

      // Process with ZenoPay using OUR generated order ID
      const zenoResult = await zenoPayService.processMobileMoneyPaymentWithOrderId({
        orderId: orderId,
        userEmail: user.email,
        userName: `${user.first_name} ${user.last_name}`,
        userPhone: phone_number,
        amount: amount
      });

      if (zenoResult.success) {
        // Update payment with ZenoPay response data
        await payment.update({
          external_transaction_id: zenoResult.data.reference,
          metadata: {
            zenopay_response: zenoResult.data,
            initiated_at: new Date().toISOString()
          }
        });

        console.log('✅ ZenoPay request successful:', {
          our_order_id: orderId,
          payment_id: payment.payment_id,
          zenopay_reference: zenoResult.data.reference
        });

        responseData = {
          payment_id: payment.payment_id,
          amount: amount,
          payment_method: 'mobile_money',
          status: 'pending',
          external_reference: orderId,
          message: zenoResult.data.message,
          instructions: 'Please complete the payment on your mobile phone'
        };
      } else {
        await payment.update({
          status: 'failed',
          failure_reason: zenoResult.message || 'ZenoPay request failed'
        });

        return res.status(400).json({
          status: 'error',
          message: zenoResult.message || 'Payment initiation failed'
        });
      }
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payment method'
      });
    }

    res.status(200).json({
      status: 'success',
      message: payment_method === 'mobile_money'
        ? 'Mobile money payment initiated. Please complete on your phone.'
        : 'Payment processed successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error while processing payment',
      error: error.message
    });
  }
};

// Check payment status
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findOne({
      where: {
        payment_id: id,
        user_id: req.userId
      },
      include: [{
        model: Booking,
        attributes: ['booking_id', 'status', 'total_amount']
      }]
    });

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        payment_id: payment.payment_id,
        booking_id: payment.booking_id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        status: payment.status,
        payment_time: payment.payment_time,
        created_at: payment.created_at
      }
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to check payment status'
    });
  }
};

// Get payment history
exports.getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const payments = await Payment.findAndCountAll({
      where: { user_id: req.userId },
      include: [{
        model: Booking,
        include: [{
          model: db.Trip,
          include: [{
            model: db.Route,
            attributes: ['route_name', 'start_point', 'end_point']
          }]
        }]
      }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.status(200).json({
      status: 'success',
      data: {
        payments: payments.rows,
        pagination: {
          total: payments.count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(payments.count / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment history'
    });
  }
};

// Get payment details
exports.getPaymentDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findOne({
      where: {
        payment_id: id,
        user_id: req.userId
      },
      include: [{
        model: Booking,
        include: [
          {
            model: db.Trip,
            include: [{
              model: db.Route,
              attributes: ['route_id', 'route_name', 'start_point', 'end_point']
            }]
          },
          {
            model: db.Stop,
            as: 'pickupStop',
            attributes: ['stop_id', 'stop_name']
          },
          {
            model: db.Stop,
            as: 'dropoffStop',
            attributes: ['stop_id', 'stop_name']
          }
        ]
      }]
    });

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: payment
    });

  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment details'
    });
  }
};

// ZenoPay webhook handler - SIMPLIFIED VERSION
exports.handleZenoPayWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    console.log('🔍 WEBHOOK RECEIVED:');
    console.log('   Data:', JSON.stringify(webhookData, null, 2));

    const { order_id, payment_status, reference, buyer_phone, metadata } = webhookData;

    // Basic validation
    if (!order_id || !payment_status) {
      console.log('❌ Missing required webhook fields');
      return res.status(400).json({ message: 'Missing required fields: order_id and payment_status' });
    }

    console.log('✅ Processing webhook for order:', order_id);

    const newStatus = zenoPayService.mapPaymentStatus(payment_status);

    // Check if this is a wallet top-up (contains DLS_TOPUP_)
    if (order_id.includes('DLS_TOPUP_')) {
      console.log('💰 Processing wallet top-up');
      await handleWalletTopup(order_id, newStatus, webhookData);
    } else {
      console.log('🎫 Processing booking payment');
      await handleBookingPayment(order_id, newStatus, webhookData, reference);
    }

    console.log('✅ Webhook processed successfully');

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

// Handle wallet top-up webhook
async function handleWalletTopup(orderId, status, webhookData) {
  console.log('💰 Starting wallet top-up handler');
  console.log('   Order ID:', orderId);
  console.log('   Status:', status);

  const transaction = await db.sequelize.transaction();

  try {
    // Find the pending wallet transaction
    const walletTransaction = await db.WalletTransaction.findOne({
      where: {
        external_reference: orderId,
        status: 'pending'
      },
      transaction
    });

    if (!walletTransaction) {
      console.log('⚠️  No pending wallet transaction found for order:', orderId);
      await transaction.rollback();
      return;
    }

    console.log('✅ Found wallet transaction:', walletTransaction.transaction_id);

    if (status === 'completed') {
      // Update wallet balance
      const wallet = await db.Wallet.findByPk(walletTransaction.wallet_id, { transaction });

      if (!wallet) {
        console.log('❌ Wallet not found for ID:', walletTransaction.wallet_id);
        await transaction.rollback();
        return;
      }

      const currentBalance = parseFloat(wallet.balance);
      const topupAmount = parseFloat(walletTransaction.amount);
      const newBalance = currentBalance + topupAmount;

      console.log('💰 Updating wallet balance:');
      console.log('   Current Balance:', currentBalance);
      console.log('   Top-up Amount:', topupAmount);
      console.log('   New Balance:', newBalance);

      await wallet.update({
        balance: newBalance,
        last_activity: new Date()
      }, { transaction });

      // Update wallet transaction
      await walletTransaction.update({
        balance_after: newBalance,
        status: 'completed',
        metadata: {
          ...walletTransaction.metadata,
          webhook_data: webhookData,
          completed_at: new Date().toISOString()
        }
      }, { transaction });

      await transaction.commit();

      console.log('✅ Wallet top-up completed successfully');

      // Send beautiful notifications
      await notificationService.sendWalletTopupConfirmation({
        user: await db.User.findByPk(walletTransaction.user_id),
        transaction: walletTransaction,
        wallet,
        amount: topupAmount
      });

      // Create success notification
      try {
        await db.Notification.create({
          user_id: walletTransaction.user_id,
          title: 'Wallet Top-up Successful',
          message: `Your wallet has been topped up with ${topupAmount.toLocaleString()} TZS. New balance: ${newBalance.toLocaleString()} TZS.`,
          type: 'payment_success',
          data: {
            transaction_id: walletTransaction.transaction_id,
            amount: topupAmount,
            new_balance: newBalance
          }
        });
        console.log('✅ Success notification created');
      } catch (notificationError) {
        console.log('⚠️  Failed to create notification:', notificationError.message);
      }

    } else if (status === 'failed') {
      // Update transaction as failed
      await walletTransaction.update({
        status: 'failed',
        metadata: {
          ...walletTransaction.metadata,
          webhook_data: webhookData,
          failed_at: new Date().toISOString()
        }
      }, { transaction });

      await transaction.commit();

      console.log('❌ Wallet top-up marked as failed');
    }

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error in handleWalletTopup:', error);
    throw error;
  }
}

// Handle booking payment webhook
async function handleBookingPayment(orderId, status, webhookData, reference) {
  console.log('🎫 Starting booking payment handler');
  console.log('   Order ID:', orderId);
  console.log('   Status:', status);
  console.log('   Reference:', reference);

  const transaction = await db.sequelize.transaction();

  try {
    // Find the pending payment
    const payment = await db.Payment.findOne({
      where: {
        external_reference: orderId,
        status: 'pending'
      },
      transaction
    });

    if (!payment) {
      console.log('⚠️  No pending payment found for order:', orderId);
      await transaction.rollback();
      return;
    }

    console.log('✅ Found payment:', payment.payment_id);

    if (status === 'completed') {
      // Update payment status
      await payment.update({
        status: 'completed',
        payment_time: new Date(),
        external_transaction_id: reference,
        metadata: {
          ...payment.metadata,
          webhook_data: webhookData
        }
      }, { transaction });

      // Update booking status
      const booking = await db.Booking.findByPk(payment.booking_id, { transaction });
      if (booking && booking.status === 'pending_payment') {
        await booking.update({
          status: 'confirmed',
          payment_status: 'paid'
        }, { transaction });
        console.log('✅ Booking status updated to confirmed');
      }

      await transaction.commit();
      console.log('✅ Booking payment completed successfully');

      // Send beautiful payment confirmation notifications
      try {
        const paymentWithBooking = await db.Payment.findByPk(payment.payment_id, {
          include: [{
            model: db.Booking,
            include: [{
              model: db.Trip,
              include: [{
                model: db.Route,
                attributes: ['route_name', 'start_point', 'end_point']
              }]
            }]
          }]
        });

        const user = await db.User.findByPk(payment.user_id);

        await notificationService.sendPaymentConfirmation({
          payment: paymentWithBooking,
          user,
          booking: paymentWithBooking.Booking,
          trip: paymentWithBooking.Booking.Trip,
          route: paymentWithBooking.Booking.Trip?.Route
        });
      } catch (notifError) {
        console.log('⚠️  Failed to send payment confirmation notifications:', notifError.message);
      }

    } else if (status === 'failed') {
      await payment.update({
        status: 'failed',
        failure_reason: 'Payment failed via webhook',
        metadata: {
          ...payment.metadata,
          webhook_data: webhookData
        }
      }, { transaction });

      await transaction.commit();
      console.log('❌ Booking payment marked as failed');

      // Send failure notifications
      try {
        const paymentWithBooking = await db.Payment.findByPk(payment.payment_id, {
          include: [{
            model: db.Booking,
            include: [{
              model: db.Trip,
              include: [{
                model: db.Route,
                attributes: ['route_name', 'start_point', 'end_point']
              }]
            }]
          }]
        });

        const user = await db.User.findByPk(payment.user_id);

        await notificationService.sendPaymentFailure({
          payment: paymentWithBooking,
          user,
          booking: paymentWithBooking.Booking,
          trip: paymentWithBooking.Booking.Trip,
          route: paymentWithBooking.Booking.Trip?.Route
        });
      } catch (notifError) {
        console.log('⚠️  Failed to send payment failure notifications:', notifError.message);
      }
    }

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error in handleBookingPayment:', error);
    throw error;
  }
}