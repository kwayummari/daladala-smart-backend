// controllers/booking.controller.js
const db = require('../models');
const Booking = db.Booking;
const Trip = db.Trip;
const Stop = db.Stop;
const Fare = db.Fare;
const User = db.User;
const Notification = db.Notification;
const { Sequelize, Op } = require('sequelize');

exports.createBooking = async (req, res) => {
  try {
    const { trip_id, pickup_stop_id, dropoff_stop_id, passenger_count = 1 } = req.body;

    if (!trip_id || !pickup_stop_id || !dropoff_stop_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Trip ID, pickup stop, and dropoff stop are required'
      });
    }

    const trip = await Trip.findOne({
      where: {
        trip_id,
        status: {
          [Op.in]: ['scheduled', 'in_progress']
        }
      },
      include: [{
        model: db.Route,
        attributes: ['route_id', 'route_name', 'start_point', 'end_point']
      }]
    });


    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found or not available for booking'
      });
    }

    const fare = await Fare.findOne({
      where: {
        route_id: trip.Route.route_id,
        start_stop_id: pickup_stop_id,
        end_stop_id: dropoff_stop_id,
        fare_type: 'standard',
        is_active: true
      }
    });


    if (!fare) {
      return res.status(404).json({
        status: 'error',
        message: 'Fare not found for the specified route and stops'
      });
    }

    const fareAmount = fare.amount * passenger_count;

    const booking = await Booking.create({
      user_id: req.userId,
      trip_id,
      pickup_stop_id,
      dropoff_stop_id,
      booking_time: new Date(),
      fare_amount: fareAmount,
      passenger_count,
      status: 'pending',
      payment_status: 'pending'
    });

    await Notification.create({
      user_id: req.userId,
      title: 'Booking Confirmation',
      message: `Your booking for trip #${trip_id} has been confirmed. Please proceed with payment.`,
      type: 'success',
      related_entity: 'booking',
      related_id: booking.booking_id
    });

    res.status(201).json({
      status: 'success',
      message: 'Booking created successfully',
      data: {
        booking_id: booking.booking_id,
        user_id: booking.user_id, 
        trip_id: booking.trip_id,
        pickup_stop_id: booking.pickup_stop_id,
        dropoff_stop_id: booking.dropoff_stop_id,
        booking_time: booking.booking_time,
        fare_amount: booking.fare_amount,
        passenger_count: booking.passenger_count,
        status: booking.status,
        payment_status: booking.payment_status,
        created_at: booking.created_at, 
        updated_at: booking.updated_at,
        route_info: {
          route_name: trip.Route.route_name,
          start_point: trip.Route.start_point,
          end_point: trip.Route.end_point
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to create booking'
    });
  }
};

// Get user bookings
exports.getUserBookings = async (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = {
      user_id: req.userId
    };

    if (status) {
      whereClause.status = status;
    }

    const bookings = await Booking.findAll({
      where: whereClause,
      include: [
        {
          model: Trip,
          include: [{
            model: db.Route,
            attributes: ['route_id', 'route_name', 'start_point', 'end_point']
          }],
          attributes: ['trip_id', 'start_time', 'end_time', 'status']
        },
        {
          model: Stop,
          as: 'pickupStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        },
        {
          model: Stop,
          as: 'dropoffStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        }
      ],
      order: [['booking_time', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: bookings
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user bookings'
    });
  }
};

// Get booking details - FIXED VERSION
exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: 'Booking ID is required'
      });
    }

    const booking = await Booking.findOne({
      where: {
        booking_id: id,
        user_id: req.userId
      },
      include: [
        {
          model: Trip,
          include: [
            {
              model: db.Route,
              attributes: ['route_id', 'route_name', 'start_point', 'end_point']
            },
            {
              model: db.Vehicle,
              attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'color'],
              required: false
            },
            {
              model: db.Driver,
              attributes: ['driver_id', 'rating'],
              required: false,
              include: [{
                model: User,
                attributes: ['first_name', 'last_name', 'profile_picture'],
                required: false
              }]
            }
          ],
          attributes: ['trip_id', 'start_time', 'end_time', 'status']
        },
        {
          model: Stop,
          as: 'pickupStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        },
        {
          model: Stop,
          as: 'dropoffStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        },
        {
          model: User,
          attributes: ['user_id', 'first_name', 'last_name', 'phone']
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // Get payment details if any
    let payment = null;
    try {
      payment = await db.Payment.findOne({
        where: { booking_id: id },
        attributes: ['payment_id', 'amount', 'currency', 'payment_method', 'status', 'payment_time', 'transaction_id']
      });
    } catch (paymentError) {
    }

    res.status(200).json({
      status: 'success',
      data: {
        booking,
        payment
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch booking details'
    });
  }
};

// Cancel booking
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOne({
      where: {
        booking_id: id,
        user_id: req.userId
      }
    });

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        status: 'error',
        message: 'Booking is already cancelled'
      });
    }

    if (booking.payment_status === 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel paid booking. Please contact support for refund.'
      });
    }

    await booking.update({
      status: 'cancelled',
      cancelled_at: new Date()
    });

    // Create notification
    await Notification.create({
      user_id: req.userId,
      title: 'Booking Cancelled',
      message: `Your booking #${id} has been cancelled successfully.`,
      type: 'info',
      related_entity: 'booking',
      related_id: id
    });

    res.status(200).json({
      status: 'success',
      message: 'Booking cancelled successfully',
      data: {
        booking_id: id,
        status: 'cancelled'
      }
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel booking'
    });
  }
};