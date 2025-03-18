const db = require('../models');
const Payment = db.Payment;
const Booking = db.Booking;
const Notification = db.Notification;

// Process payment
exports.processPayment = async (req, res) => {
  try {
    const { booking_id, payment_method, transaction_id = null, payment_details = null } = req.body;

    // Check if booking exists and belongs to user
    const booking = await Booking.findOne({
      where: {
        booking_id,
        user_id: req.userId
      }
    });

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
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
      where: {
        booking_id
      }
    });

    if (existingPayment) {
      return res.status(400).json({
        status: 'error',
        message: 'Payment already exists for this booking'
      });
    }

    // Create payment record
    const payment = await Payment.create({
      booking_id,
      user_id: req.userId,
      amount: booking.fare_amount,
      currency: 'TZS',
      payment_method,
      transaction_id,
      payment_time: new Date(),
      status: 'completed',
      payment_details
    });

    // Update booking payment status
    await booking.update({
      payment_status: 'paid',
      status: 'confirmed'
    });

    // Create notification for user
    await Notification.create({
      user_id: req.userId,
      title: 'Payment Confirmation',
      message: `Your payment of ${booking.fare_amount} TZS for booking #${booking_id} has been confirmed.`,
      type: 'success',
      related_entity: 'payment',
      related_id: payment.payment_id
    });

    res.status(200).json({
      status: 'success',
      message: 'Payment processed successfully',
      data: {
        payment_id: payment.payment_id,
        booking_id: payment.booking_id,
        amount: payment.amount,
        currency: payment.currency,
        payment_method: payment.payment_method,
        status: payment.status,
        payment_time: payment.payment_time
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get payment history
exports.getPaymentHistory = async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: {
        user_id: req.userId
      },
      include: [{
        model: Booking,
        include: [{
          model: db.Trip,
          include: [{
            model: db.Route,
            attributes: ['route_name']
          }]
        }]
      }],
      order: [['payment_time', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
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
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};