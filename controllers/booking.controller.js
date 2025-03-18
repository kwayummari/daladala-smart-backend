const db = require('../models');
const Booking = db.Booking;
const Trip = db.Trip;
const Stop = db.Stop;
const Fare = db.Fare;
const User = db.User;
const Notification = db.Notification;
const { Op } = db.Sequelize;

// Create booking
exports.createBooking = async (req, res) => {
  try {
    const { trip_id, pickup_stop_id, dropoff_stop_id, passenger_count = 1 } = req.body;

    // Check if trip exists and is available
    const trip = await Trip.findOne({
      where: {
        trip_id,
        status: {
          [Op.in]: ['scheduled', 'in_progress']
        }
      },
      include: [{
        model: db.Route,
        attributes: ['route_id']
      }]
    });

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found or not available for booking'
      });
    }

    // Get fare amount
    const fare = await Fare.findOne({
      where: {
        route_id: trip.Route.route_id,
        start_stop_id: pickup_stop_id,
        end_stop_id: dropoff_stop_id,
        fare_type: 'standard', // Default to standard fare
        is_active: true
      }
    });

    if (!fare) {
      return res.status(404).json({
        status: 'error',
        message: 'Fare not found for the specified route and stops'
      });
    }

    // Calculate total fare
    const fareAmount = fare.amount * passenger_count;

    // Create booking
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

    // Create notification for user
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
        trip_id: booking.trip_id,
        fare_amount: booking.fare_amount,
        passenger_count: booking.passenger_count,
        status: booking.status,
        payment_status: booking.payment_status
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
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
          }]
        },
        {
          model: Stop,
          as: 'pickupStop',
          attributes: ['stop_id', 'stop_name']
        },
        {
          model: Stop,
          as: 'dropoffStop',
          attributes: ['stop_id', 'stop_name']
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
      message: error.message
    });
  }
};

// Get booking details
exports.getBookingDetails = async (req, res) => {
  try {
    const { id } = req.params;

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
              attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'color']
            },
            {
              model: db.Driver,
              attributes: ['driver_id', 'rating'],
              include: [{
                model: User,
                attributes: ['first_name', 'last_name', 'profile_picture']
              }]
            }
          ]
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
    const payment = await db.Payment.findOne({
      where: {
        booking_id: id
      }
    });

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
      message: error.message
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

    // Check if booking can be cancelled
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      return res.status(400).json({
        status: 'error',
        message: 'Booking cannot be cancelled at this stage'
      });
    }

    // Update booking status
    await booking.update({
      status: 'cancelled'
    });

    // If payment was made, initiate refund
    if (booking.payment_status === 'paid') {
      await db.Payment.update(
        {
          status: 'refunded'
        },
        {
          where: {
            booking_id: id
          }
        }
      );

      await booking.update({
        payment_status: 'refunded'
      });
    }

    // Create notification for user
    await Notification.create({
      user_id: req.userId,
      title: 'Booking Cancelled',
      message: `Your booking #${booking.booking_id} has been cancelled.`,
      type: 'info',
      related_entity: 'booking',
      related_id: booking.booking_id
    });

    res.status(200).json({
      status: 'success',
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};