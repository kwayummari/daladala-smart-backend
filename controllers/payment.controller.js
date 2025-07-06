// controllers/payment.controller.js
const db = require('../models');
const Payment = db.Payment;
const Booking = db.Booking;
const User = db.User;
const Notification = db.Notification;
const zenoPayService = require('../services/zenoPayService');

// Process payment
exports.processPayment = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const { booking_id, payment_method, phone_number } = req.body;
    const amount = req.body.payment_details?.amount; // Use optional chaining

    // Validate required fields
    if (!booking_id || !payment_method) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking ID and payment method are required',
        received: { booking_id, payment_method } // Debug info
      });
    }

    // Convert booking_id to proper format if needed
    const bookingIdToSearch = parseInt(booking_id); // Ensure it's a number

    console.log('Searching for booking with ID:', bookingIdToSearch);

    // Check if booking exists and belongs to user
    const booking = await Booking.findOne({
      where: {
        booking_id: bookingIdToSearch, // Use converted ID
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

    console.log('Found booking:', booking ? 'Yes' : 'No');

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found',
        debug: {
          searched_booking_id: bookingIdToSearch,
          user_id: req.userId
        }
      });
    }

    // Check if booking is already paid
    if (booking.payment_status === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Booking is already paid'
      });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      where: { booking_id: bookingIdToSearch }
    });

    if (existingPayment && existingPayment.status === 'completed') {
      return res.status(400).json({
        status: 'error',
        message: 'Payment already completed for this booking'
      });
    }

    // Get user details
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    let paymentResult;
    let paymentData = {
      booking_id: bookingIdToSearch,
      user_id: req.userId,
      amount: booking.fare_amount,
      currency: 'TZS',
      payment_method,
      status: 'pending'
    };

    if (payment_method === 'mobile_money') {
      // Validate phone number for mobile money
      if (!phone_number) {
        return res.status(400).json({
          status: 'error',
          message: 'Phone number is required for mobile money payment'
        });
      }

      // Process mobile money payment via ZenoPay
      const zenoPaymentData = {
        bookingId: bookingIdToSearch,
        userEmail: user.email,
        userName: `${user.first_name} ${user.last_name}`,
        userPhone: phone_number,
        amount: booking.fare_amount
      };

      console.log('Processing ZenoPay payment:', zenoPaymentData);

      paymentResult = await zenoPayService.processMobileMoneyPayment(zenoPaymentData);

      if (!paymentResult.success) {
        return res.status(400).json({
          status: 'error',
          message: 'Failed to initiate mobile money payment',
          details: paymentResult.error
        });
      }

      // Update payment data with ZenoPay details
      paymentData.transaction_id = paymentResult.data.orderId;
      paymentData.payment_details = {
        zenopay_order_id: paymentResult.data.zenoOrderId,
        reference: paymentResult.data.reference,
        channel: paymentResult.data.channel,
        msisdn: paymentResult.data.msisdn,
        phone_number
      };
      paymentData.status = 'pending'; // Payment initiated, waiting for completion

    } else {
      // For other payment methods (cash, card, wallet)
      paymentData.status = payment_method === 'cash' ? 'completed' : 'pending';
      paymentData.payment_time = new Date();
    }

    // Create or update payment record
    let payment;
    if (existingPayment) {
      payment = await existingPayment.update(paymentData);
    } else {
      payment = await Payment.create(paymentData);
    }

    // Update booking status for completed payments
    if (paymentData.status === 'completed') {
      await booking.update({
        payment_status: 'paid',
        status: 'confirmed'
      });

      // Create notification for user
      await Notification.create({
        user_id: req.userId,
        title: 'Payment Confirmation',
        message: `Your payment of ${booking.fare_amount} TZS for booking #${bookingIdToSearch} has been confirmed.`,
        type: 'success',
        related_entity: 'payment',
        related_id: payment.payment_id
      });
    }

    // Prepare response
    const responseData = {
      payment_id: payment.payment_id,
      booking_id: payment.booking_id,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      status: payment.status,
      payment_time: payment.payment_time
    };

    // Add ZenoPay specific data for mobile money
    if (payment_method === 'mobile_money' && paymentResult) {
      responseData.zenopay = {
        order_id: paymentResult.data.orderId,
        reference: paymentResult.data.reference,
        message: paymentResult.data.message,
        instructions: 'Please complete the payment on your mobile phone using the USSD prompt or mobile app.'
      };
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
      error: error.message // Add error details for debugging
    });
  }
};

// ZenoPay webhook handler
// controllers/payment.controller.js - Enhanced but clean webhook handler

exports.handleZenoPayWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    const apiKey = req.headers['x-api-key'];

    // Verify webhook authenticity
    if (!zenoPayService.verifyWebhookSignature(webhookData, apiKey)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ message: 'Unauthorized' });
    }

    console.log('ZenoPay Webhook received:', webhookData);

    const { order_id, payment_status, reference } = webhookData;
    const newStatus = zenoPayService.mapPaymentStatus(payment_status);

    // Check if this is a wallet top-up (starts with TOPUP_)
    if (order_id.startsWith('TOPUP_')) {
      await handleWalletTopup(order_id, newStatus, webhookData);
    } else {
      // Handle regular booking payment
      await handleBookingPayment(order_id, newStatus, webhookData, reference);
    }

    res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Webhook processing failed'
    });
  }
};

// Handle wallet top-up webhook
async function handleWalletTopup(orderId, status, webhookData) {
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
      console.error('Wallet transaction not found for order_id:', orderId);
      return;
    }

    if (status === 'completed') {
      // Update wallet balance
      const wallet = await db.Wallet.findByPk(walletTransaction.wallet_id, { transaction });
      const newBalance = parseFloat(wallet.balance) + parseFloat(walletTransaction.amount);

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
          webhook_data: webhookData
        }
      }, { transaction });

      await transaction.commit();

      // Create success notification
      await db.Notification.create({
        user_id: walletTransaction.user_id,
        title: 'Wallet Top-up Successful',
        message: `Your wallet has been topped up with ${walletTransaction.amount} TZS. New balance: ${newBalance} TZS`,
        type: 'success',
        related_entity: 'wallet',
        related_id: walletTransaction.transaction_id
      });

    } else if (status === 'failed') {
      // Mark transaction as failed
      await walletTransaction.update({
        status: 'failed',
        metadata: {
          ...walletTransaction.metadata,
          webhook_data: webhookData
        }
      }, { transaction });

      await transaction.commit();

      // Create failure notification
      await db.Notification.create({
        user_id: walletTransaction.user_id,
        title: 'Wallet Top-up Failed',
        message: `Your wallet top-up of ${walletTransaction.amount} TZS has failed. Please try again.`,
        type: 'error',
        related_entity: 'wallet',
        related_id: walletTransaction.transaction_id
      });
    }

  } catch (error) {
    await transaction.rollback();
    console.error('Wallet top-up webhook error:', error);
    throw error;
  }
}

// Handle booking payment webhook (your original logic)
async function handleBookingPayment(orderId, newStatus, webhookData, reference) {
  // Find payment by transaction_id (which stores our order_id)
  const payment = await db.Payment.findOne({
    where: { transaction_id: orderId },
    include: [{
      model: db.Booking,
      include: [{
        model: db.User,
        attributes: ['user_id', 'first_name', 'last_name', 'email']
      }]
    }]
  });

  if (!payment) {
    console.error('Payment not found for order_id:', orderId);
    return;
  }

  // Update payment status
  await payment.update({
    status: newStatus,
    payment_time: newStatus === 'completed' ? new Date() : payment.payment_time,
    payment_details: {
      ...payment.payment_details,
      webhook_data: webhookData,
      final_status: payment_status,
      reference
    }
  });

  // Update booking if payment completed
  if (newStatus === 'completed') {
    await payment.Booking.update({
      payment_status: 'paid',
      status: 'confirmed'
    });

    // Create success notification
    await db.Notification.create({
      user_id: payment.user_id,
      title: 'Payment Successful',
      message: `Your mobile money payment of ${payment.amount} TZS has been completed successfully. Booking #${payment.booking_id} is now confirmed.`,
      type: 'success',
      related_entity: 'payment',
      related_id: payment.payment_id
    });

  } else if (newStatus === 'failed') {
    // Update booking status for failed payment
    await payment.Booking.update({
      payment_status: 'pending',
      status: 'pending'
    });

    // Create failure notification
    await db.Notification.create({
      user_id: payment.user_id,
      title: 'Payment Failed',
      message: `Your mobile money payment for booking #${payment.booking_id} has failed. Please try again or use a different payment method.`,
      type: 'error',
      related_entity: 'payment',
      related_id: payment.payment_id
    });
  }
}

// Check payment status (manual check)
exports.checkPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findOne({
      where: {
        payment_id: id,
        user_id: req.userId
      }
    });

    if (!payment) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment not found'
      });
    }

    // For mobile money payments, check status with ZenoPay
    if (payment.payment_method === 'mobile_money' && payment.transaction_id) {
      const statusResult = await zenoPayService.checkPaymentStatus(payment.transaction_id);

      if (statusResult.success) {
        const newStatus = zenoPayService.mapPaymentStatus(statusResult.data.status);

        // Update payment if status changed
        if (newStatus !== payment.status) {
          await payment.update({
            status: newStatus,
            payment_time: newStatus === 'completed' ? new Date() : payment.payment_time,
            payment_details: {
              ...payment.payment_details,
              status_check: statusResult.data
            }
          });

          // Update booking if payment completed
          if (newStatus === 'completed') {
            const booking = await Booking.findByPk(payment.booking_id);
            if (booking) {
              await booking.update({
                payment_status: 'paid',
                status: 'confirmed'
              });
            }
          }
        }
      }
    }

    // Refresh payment data
    await payment.reload();

    res.status(200).json({
      status: 'success',
      data: {
        payment_id: payment.payment_id,
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        payment_method: payment.payment_method,
        status: payment.status,
        payment_time: payment.payment_time,
        transaction_id: payment.transaction_id
      }
    });

  } catch (error) {
    console.error('Payment status check error:', error);
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
    console.error('Payment history error:', error);
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
    console.error('Payment details error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch payment details'
    });
  }
};