// controllers/booking.controller.js
const db = require('../models');
const Booking = db.Booking;
const Trip = db.Trip;
const Stop = db.Stop;
const Fare = db.Fare;
const User = db.User;
const Notification = db.Notification;
const { Sequelize, Op } = require('sequelize');

// controllers/booking.controller.js - Enhanced with debug logging

exports.createBooking = async (req, res) => {
  try {
    const { trip_id, pickup_stop_id, dropoff_stop_id, passenger_count = 1 } = req.body;

    console.log('🎫 Creating booking with data:');
    console.log('   Trip ID:', trip_id);
    console.log('   Pickup Stop ID:', pickup_stop_id);
    console.log('   Dropoff Stop ID:', dropoff_stop_id);
    console.log('   Passenger Count:', passenger_count);
    console.log('   User ID:', req.userId);

    if (!trip_id || !pickup_stop_id || !dropoff_stop_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Trip ID, pickup stop, and dropoff stop are required'
      });
    }

    // Step 1: Check if trip exists and is available
    console.log('🔍 Checking if trip exists...');
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
      console.log('❌ Trip not found or not available');

      // Debug: Check if trip exists with any status
      const anyTrip = await Trip.findByPk(trip_id, {
        include: [{
          model: db.Route,
          attributes: ['route_id', 'route_name', 'start_point', 'end_point']
        }]
      });

      if (anyTrip) {
        console.log('⚠️  Trip exists but has status:', anyTrip.status);
        console.log('   Trip details:', {
          trip_id: anyTrip.trip_id,
          status: anyTrip.status,
          start_time: anyTrip.start_time,
          route: anyTrip.Route?.route_name
        });

        return res.status(404).json({
          status: 'error',
          message: `Trip found but not available for booking. Current status: ${anyTrip.status}`,
          debug: {
            trip_status: anyTrip.status,
            required_statuses: ['scheduled', 'in_progress']
          }
        });
      } else {
        console.log('❌ Trip does not exist in database');

        // Show available trips for debugging
        const availableTrips = await Trip.findAll({
          where: {
            status: {
              [Op.in]: ['scheduled', 'in_progress']
            }
          },
          limit: 5,
          attributes: ['trip_id', 'status', 'start_time'],
          include: [{
            model: db.Route,
            attributes: ['route_name']
          }]
        });

        console.log('Available trips:', availableTrips.map(t => ({
          id: t.trip_id,
          status: t.status,
          route: t.Route?.route_name
        })));

        return res.status(404).json({
          status: 'error',
          message: 'Trip not found in database',
          debug: {
            requested_trip_id: trip_id,
            available_trips: availableTrips.map(t => t.trip_id)
          }
        });
      }
    }

    console.log('✅ Trip found:', {
      trip_id: trip.trip_id,
      status: trip.status,
      route: trip.Route.route_name,
      route_id: trip.Route.route_id
    });

    // Step 2: Check if pickup and dropoff stops exist
    console.log('🔍 Checking if stops exist...');
    const [pickupStop, dropoffStop] = await Promise.all([
      Stop.findByPk(pickup_stop_id),
      Stop.findByPk(dropoff_stop_id)
    ]);

    if (!pickupStop) {
      console.log('❌ Pickup stop not found:', pickup_stop_id);
      return res.status(404).json({
        status: 'error',
        message: `Pickup stop not found: ${pickup_stop_id}`,
        debug: {
          pickup_stop_id,
          dropoff_stop_id
        }
      });
    }

    if (!dropoffStop) {
      console.log('❌ Dropoff stop not found:', dropoff_stop_id);
      return res.status(404).json({
        status: 'error',
        message: `Dropoff stop not found: ${dropoff_stop_id}`,
        debug: {
          pickup_stop_id,
          dropoff_stop_id
        }
      });
    }

    console.log('✅ Stops found:', {
      pickup: { id: pickupStop.stop_id, name: pickupStop.stop_name },
      dropoff: { id: dropoffStop.stop_id, name: dropoffStop.stop_name }
    });

    // Step 3: Check if fare exists
    console.log('🔍 Checking fare for route and stops...');
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
      console.log('❌ Fare not found for stops');

      // Debug: Check what fares exist for this route
      const routeFares = await Fare.findAll({
        where: {
          route_id: trip.Route.route_id,
          is_active: true
        },
        attributes: ['fare_id', 'start_stop_id', 'end_stop_id', 'amount', 'fare_type']
      });

      console.log('Available fares for route:', routeFares.map(f => ({
        fare_id: f.fare_id,
        from_stop: f.start_stop_id,
        to_stop: f.end_stop_id,
        amount: f.amount,
        type: f.fare_type
      })));

      return res.status(404).json({
        status: 'error',
        message: 'Fare not found for the specified route and stops',
        debug: {
          route_id: trip.Route.route_id,
          pickup_stop_id,
          dropoff_stop_id,
          available_fares: routeFares.map(f => ({
            from: f.start_stop_id,
            to: f.end_stop_id,
            amount: f.amount
          }))
        }
      });
    }

    console.log('✅ Fare found:', {
      fare_id: fare.fare_id,
      amount: fare.amount,
      currency: fare.currency || 'TZS'
    });

    const fareAmount = fare.amount * passenger_count;

    // Step 4: Create the booking
    console.log('💾 Creating booking record...');
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

    console.log('✅ Booking created successfully:', {
      booking_id: booking.booking_id,
      fare_amount: fareAmount,
      status: booking.status
    });

    // Create notification
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
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create booking',
      debug: {
        error_message: error.message,
        error_stack: error.stack
      }
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