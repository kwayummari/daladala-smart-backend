// controllers/booking.controller.js - COMPLETELY FIXED VERSION
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

    console.log('📝 Creating booking with data:', {
      trip_id, pickup_stop_id, dropoff_stop_id, passenger_count, userId: req.userId
    });

    if (!trip_id || !pickup_stop_id || !dropoff_stop_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Trip ID, pickup stop, and dropoff stop are required'
      });
    }

    // Validate trip exists and is bookable
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

    console.log('🚌 Trip found:', trip ? `Trip ${trip.trip_id}` : 'No trip found');

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found or not available for booking'
      });
    }

    // Validate pickup and dropoff stops exist
    const [pickupStop, dropoffStop] = await Promise.all([
      Stop.findByPk(pickup_stop_id),
      Stop.findByPk(dropoff_stop_id)
    ]);

    console.log('🚏 Stops found:', {
      pickupStop: pickupStop ? `${pickupStop.stop_id}: ${pickupStop.stop_name}` : 'Not found',
      dropoffStop: dropoffStop ? `${dropoffStop.stop_id}: ${dropoffStop.stop_name}` : 'Not found'
    });

    if (!pickupStop) {
      return res.status(404).json({
        status: 'error',
        message: `Pickup stop not found: ${pickup_stop_id}`
      });
    }

    if (!dropoffStop) {
      return res.status(404).json({
        status: 'error',
        message: `Dropoff stop not found: ${dropoff_stop_id}`
      });
    }

    // Check if passenger count is valid
    if (passenger_count < 1 || passenger_count > 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Passenger count must be between 1 and 10'
      });
    }

    // Get fare information
    let fareAmount = 2000.0; // Default fare
    try {
      const fare = await Fare.findOne({
        where: {
          route_id: trip.route_id,
          start_stop_id: pickup_stop_id,
          end_stop_id: dropoff_stop_id
        }
      });

      if (fare) {
        fareAmount = fare.amount;
        console.log('💰 Fare found:', fareAmount);
      } else {
        console.log('💰 Using default fare:', fareAmount);
      }
    } catch (fareError) {
      console.log('⚠️ Could not fetch fare, using default:', fareError.message);
    }

    // Calculate total fare
    const totalFare = fareAmount * passenger_count;

    console.log('🧮 Calculated total fare:', totalFare);

    // Create the booking
    const booking = await Booking.create({
      user_id: req.userId,
      trip_id: trip_id,
      pickup_stop_id: pickup_stop_id,
      dropoff_stop_id: dropoff_stop_id,
      booking_time: new Date(),
      fare_amount: totalFare,
      passenger_count: passenger_count,
      status: 'confirmed',
      payment_status: 'pending'
    });

    console.log('✅ Booking created successfully:', booking.booking_id);

    // Create notification
    try {
      await Notification.create({
        user_id: req.userId,
        title: 'Booking Confirmation',
        message: `Your booking for trip #${trip_id} has been confirmed. Please proceed with payment.`,
        type: 'success',
        related_entity: 'booking',
        related_id: booking.booking_id
      });
      console.log('📱 Notification created');
    } catch (notificationError) {
      console.log('⚠️ Failed to create notification:', notificationError.message);
      // Don't fail the booking if notification fails
    }

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
        route_info: {
          route_name: trip.Route.route_name,
          start_point: trip.Route.start_point,
          end_point: trip.Route.end_point
        },
        pickup_stop: {
          stop_id: pickupStop.stop_id,
          stop_name: pickupStop.stop_name
        },
        dropoff_stop: {
          stop_id: dropoffStop.stop_id,
          stop_name: dropoffStop.stop_name
        }
      }
    });
  } catch (error) {
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create booking',
      debug: process.env.NODE_ENV === 'development' ? {
        error_message: error.message,
        error_stack: error.stack
      } : undefined
    });
  }
};

// Create multiple bookings for multiple trips
exports.createMultipleBookings = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { bookings_data } = req.body;

    console.log('📝 Creating multiple bookings:', {
      count: bookings_data?.length,
      userId: req.userId
    });

    if (!bookings_data || !Array.isArray(bookings_data) || bookings_data.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'bookings_data array is required'
      });
    }

    if (bookings_data.length > 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 10 bookings can be created at once'
      });
    }

    const createdBookings = [];
    let totalFare = 0;

    for (const [index, bookingData] of bookings_data.entries()) {
      console.log(`📋 Processing booking ${index + 1}/${bookings_data.length}:`, bookingData);

      const { trip_id, pickup_stop_id, dropoff_stop_id, passenger_count = 1 } = bookingData;

      // Validate required fields
      if (!trip_id || !pickup_stop_id || !dropoff_stop_id) {
        throw new Error(`Booking ${index + 1}: Missing required fields (trip_id, pickup_stop_id, dropoff_stop_id)`);
      }

      // Validate trip
      const trip = await Trip.findOne({
        where: {
          trip_id,
          status: { [Op.in]: ['scheduled', 'in_progress'] }
        },
        include: [{ model: db.Route }],
        transaction
      });

      if (!trip) {
        throw new Error(`Booking ${index + 1}: Trip ${trip_id} not found or not available`);
      }

      // Validate stops
      const [pickupStop, dropoffStop] = await Promise.all([
        Stop.findByPk(pickup_stop_id, { transaction }),
        Stop.findByPk(dropoff_stop_id, { transaction })
      ]);

      if (!pickupStop || !dropoffStop) {
        throw new Error(`Booking ${index + 1}: Invalid stops for trip ${trip_id}`);
      }

      // Get fare
      let fareAmount = 2000.0;
      try {
        const fare = await Fare.findOne({
          where: {
            route_id: trip.route_id,
            start_stop_id: pickup_stop_id,
            end_stop_id: dropoff_stop_id
          },
          transaction
        });
        if (fare) fareAmount = fare.amount;
      } catch (fareError) {
        console.log(`Using default fare for trip ${trip_id}`);
      }

      const bookingFare = fareAmount * passenger_count;
      totalFare += bookingFare;

      // Create booking
      const booking = await Booking.create({
        user_id: req.userId,
        trip_id,
        pickup_stop_id,
        dropoff_stop_id,
        booking_time: new Date(),
        fare_amount: bookingFare,
        passenger_count,
        status: 'confirmed',
        payment_status: 'pending'
      }, { transaction });

      createdBookings.push({
        booking_id: booking.booking_id,
        trip_id,
        fare_amount: bookingFare,
        passenger_count,
        route_name: trip.Route.route_name,
        pickup_stop: {
          stop_id: pickupStop.stop_id,
          stop_name: pickupStop.stop_name
        },
        dropoff_stop: {
          stop_id: dropoffStop.stop_id,
          stop_name: dropoffStop.stop_name
        }
      });

      console.log(`✅ Booking ${index + 1} created:`, booking.booking_id);
    }

    await transaction.commit();
    console.log('✅ All bookings committed to database');

    // Create notification for multiple bookings
    try {
      await Notification.create({
        user_id: req.userId,
        title: 'Multiple Bookings Created',
        message: `${createdBookings.length} bookings created successfully. Total: ${totalFare.toFixed(0)} TZS`,
        type: 'success',
        related_entity: 'booking',
        related_id: createdBookings[0].booking_id
      });
      console.log('📱 Notification created for multiple bookings');
    } catch (notificationError) {
      console.log('⚠️ Failed to create notification:', notificationError.message);
      // Don't fail the booking if notification fails
    }

    res.status(201).json({
      status: 'success',
      message: 'Multiple bookings created successfully',
      data: {
        bookings: createdBookings,
        total_bookings: createdBookings.length,
        total_fare: totalFare,
        payment_required: true
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error creating multiple bookings:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create multiple bookings'
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
    console.error('❌ Error getting user bookings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user bookings'
    });
  }
};

// Get booking details
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
      console.log('No payment found for booking:', id);
    }

    res.status(200).json({
      status: 'success',
      data: {
        booking,
        payment
      }
    });
  } catch (error) {
    console.error('❌ Error getting booking details:', error);
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
    try {
      await Notification.create({
        user_id: req.userId,
        title: 'Booking Cancelled',
        message: `Your booking #${id} has been cancelled successfully.`,
        type: 'info',
        related_entity: 'booking',
        related_id: id
      });
    } catch (notificationError) {
      console.log('⚠️ Failed to create notification:', notificationError.message);
      // Don't fail the cancellation if notification fails
    }

    res.status(200).json({
      status: 'success',
      message: 'Booking cancelled successfully',
      data: {
        booking_id: id,
        status: 'cancelled'
      }
    });
  } catch (error) {
    console.error('❌ Cancel booking error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel booking'
    });
  }
};