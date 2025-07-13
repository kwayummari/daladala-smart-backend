// controllers/booking.controller.js - XAMPP COMPATIBLE VERSION
const { Op, Transaction } = require('sequelize');
const db = require('../models');
const { Booking, Trip, Stop, User, Fare, Notification, PreBooking, Seat, BookingSeat } = db;
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate unique booking reference (XAMPP compatible)
const generateBookingReference = async (userId, transaction) => {
  let reference;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    // Use sequence table for uniqueness
    const [result] = await db.sequelize.query(
      'INSERT INTO booking_reference_sequence () VALUES (); SELECT LAST_INSERT_ID() as id;',
      { transaction }
    );

    const sequenceId = result[0].id;
    const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
    reference = `BOOK_${timestamp}_${userId}_${sequenceId}`;

    // Check if reference already exists (very unlikely but good to check)
    const existingBooking = await Booking.findOne({
      where: { booking_reference: reference },
      transaction
    });

    exists = !!existingBooking;
    attempts++;
  }

  if (exists) {
    // Final fallback using UUID
    reference = `BOOK_${uuidv4().replace(/-/g, '').substring(0, 16)}`;
  }

  return reference;
};

// Helper function to generate QR code data
const generateBookingQRCode = async (booking, seatDetails = []) => {
  const qrData = {
    booking_id: booking.booking_id,
    booking_reference: booking.booking_reference,
    passenger_count: booking.passenger_count,
    travel_date: booking.travel_date || booking.booking_date,
    seats: seatDetails,
    route_info: booking.route_info || {},
    validation_code: `VALID_${booking.booking_id}_${Date.now()}`,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    type: booking.is_multi_day ? 'multi_day' : 'single',
    verification_url: `https://app.daladasmart.co.tz/validate-ticket/${booking.booking_id}`
  };

  const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    quality: 0.92,
    margin: 1,
    width: 256
  });

  return qrCodeDataURL;
};

// Helper function to reserve seats for a booking
const reserveSeatsForBooking = async (bookingId, tripId, seatNumbers, passengerNames = [], bookingDate, bookingReference, transaction) => {
  const reservedSeats = [];

  for (let i = 0; i < seatNumbers.length; i++) {
    const seatNumber = seatNumbers[i];
    const passengerName = passengerNames[i] || `Passenger ${i + 1}`;

    // Find the seat using a direct query
    const [seatResults] = await db.sequelize.query(
      `SELECT s.seat_id, s.seat_number, s.is_available 
       FROM seats s 
       JOIN trips t ON s.vehicle_id = t.vehicle_id 
       WHERE t.trip_id = ? AND s.seat_number = ? AND s.is_available = 1 LIMIT 1`,
      {
        replacements: [tripId, seatNumber],
        type: db.sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    if (!seatResults) {
      throw new Error(`Seat ${seatNumber} is not available`);
    }

    // Check if seat is already booked for this trip and date
    const existingBooking = await BookingSeat.findOne({
      where: {
        seat_id: seatResults.seat_id,
        trip_id: tripId,
        booking_date: bookingDate,
        is_occupied: true
      },
      transaction
    });

    if (existingBooking) {
      throw new Error(`Seat ${seatNumber} is already reserved for this trip on ${bookingDate}`);
    }

    // Reserve the seat
    const bookingSeat = await BookingSeat.create({
      booking_id: bookingId,
      seat_id: seatResults.seat_id,
      trip_id: tripId,
      booking_date: bookingDate,
      booking_reference: bookingReference,
      passenger_name: passengerName,
      is_occupied: true
    }, { transaction });

    reservedSeats.push({
      booking_seat_id: bookingSeat.booking_seat_id,
      seat_id: seatResults.seat_id,
      seat_number: seatNumber,
      passenger_name: passengerName
    });
  }

  return reservedSeats;
};

// Create single booking with seat selection
exports.createBooking = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const {
      trip_id,
      pickup_stop_id,
      dropoff_stop_id,
      passenger_count = 1,
      seat_numbers = [],
      passenger_names = [],
      travel_date
    } = req.body;

    console.log('📝 Creating single booking:', {
      trip_id,
      pickup_stop_id,
      dropoff_stop_id,
      passenger_count,
      seat_numbers,
      userId: req.userId
    });

    // Validate required fields
    if (!trip_id || !pickup_stop_id || !dropoff_stop_id) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Trip ID, pickup stop ID, and dropoff stop ID are required'
      });
    }

    // Validate seat selection if provided
    if (seat_numbers.length > 0 && seat_numbers.length !== passenger_count) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Number of selected seats must match passenger count'
      });
    }

    // Validate trip
    const trip = await Trip.findOne({
      where: {
        trip_id,
        status: { [Op.in]: ['scheduled', 'in_progress'] }
      },
      include: [{
        model: db.Route,
        attributes: ['route_id', 'route_name', 'start_point', 'end_point']
      }],
      transaction
    });

    if (!trip) {
      await transaction.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found or not available for booking'
      });
    }

    // Validate stops
    const [pickupStop, dropoffStop] = await Promise.all([
      Stop.findByPk(pickup_stop_id, { transaction }),
      Stop.findByPk(dropoff_stop_id, { transaction })
    ]);

    if (!pickupStop || !dropoffStop) {
      await transaction.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Invalid pickup or dropoff stop'
      });
    }

    // Calculate fare
    let fareAmount = 2000.0; // Default fare
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
      console.log('Using default fare');
    }

    const totalFare = fareAmount * passenger_count;
    const bookingTravelDate = travel_date || new Date().toISOString().split('T')[0];

    // Create the booking
    const booking = await Booking.create({
      user_id: req.userId,
      trip_id,
      pickup_stop_id,
      dropoff_stop_id,
      booking_time: new Date(),
      fare_amount: totalFare,
      passenger_count,
      seat_numbers: seat_numbers.length > 0 ? seat_numbers.join(',') : null,
      booking_type: 'regular',
      travel_date: bookingTravelDate,
      is_multi_day: false,
      status: 'confirmed',
      payment_status: 'pending'
    }, { transaction });

    // Reserve seats if specified
    let reservedSeats = [];
    if (seat_numbers.length > 0) {
      reservedSeats = await reserveSeatsForBooking(
        booking.booking_id,
        trip_id,
        seat_numbers,
        passenger_names,
        bookingTravelDate,
        booking.booking_reference,
        transaction
      );

      // Update booking with seat assignments
      const seatAssignments = reservedSeats.map(rs => ({
        seat_number: rs.seat_number,
        passenger_name: rs.passenger_name
      }));

      await booking.update({
        seat_assignments: JSON.stringify(seatAssignments)
      }, { transaction });
    }

    // Generate QR code
    const qrCodeData = await generateBookingQRCode({
      ...booking.toJSON(),
      route_info: {
        route_name: trip.Route.route_name,
        start_point: trip.Route.start_point,
        end_point: trip.Route.end_point
      }
    }, reservedSeats);

    // Update booking with QR code
    await booking.update({ qr_code_data: qrCodeData }, { transaction });

    await transaction.commit();

    // Create notification (outside transaction)
    try {
      await Notification.create({
        user_id: req.userId,
        title: 'Booking Confirmed',
        message: `Your booking for ${trip.Route.route_name} has been confirmed. Total: ${totalFare.toFixed(0)} TZS`,
        type: 'success',
        related_entity: 'booking',
        related_id: booking.booking_id
      });
    } catch (notificationError) {
      console.log('⚠️ Failed to create notification:', notificationError.message);
    }

    res.status(201).json({
      status: 'success',
      message: 'Booking created successfully',
      data: {
        booking_id: booking.booking_id,
        booking_reference: booking.booking_reference,
        user_id: booking.user_id,
        trip_id: booking.trip_id,
        pickup_stop_id: booking.pickup_stop_id,
        dropoff_stop_id: booking.dropoff_stop_id,
        booking_time: booking.booking_time,
        fare_amount: booking.fare_amount,
        passenger_count: booking.passenger_count,
        seat_numbers: seat_numbers,
        reserved_seats: reservedSeats,
        travel_date: booking.travel_date,
        status: booking.status,
        payment_status: booking.payment_status,
        qr_code: qrCodeData,
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
    await transaction.rollback();
    console.error('❌ Error creating booking:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create booking'
    });
  }
};

// Create multiple bookings for multiple days with seat selection
exports.createMultipleBookings = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const {
      bookings_data,
      is_multi_day = true,
      date_range = 'week'
    } = req.body;

    console.log('📝 Creating multiple bookings:', {
      count: bookings_data?.length,
      is_multi_day,
      date_range,
      userId: req.userId
    });

    if (!bookings_data || !Array.isArray(bookings_data) || bookings_data.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'bookings_data array is required'
      });
    }

    if (bookings_data.length > 30) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Maximum 30 bookings can be created at once'
      });
    }

    // Generate booking reference for grouping
    const bookingReference = await generateBookingReference(req.userId, transaction);
    const createdBookings = [];
    let totalFare = 0;

    for (const [index, bookingData] of bookings_data.entries()) {
      console.log(`📋 Processing booking ${index + 1}/${bookings_data.length}:`, bookingData);

      const {
        trip_id,
        pickup_stop_id,
        dropoff_stop_id,
        passenger_count = 1,
        seat_numbers = [],
        passenger_names = [],
        travel_date
      } = bookingData;

      // Validate required fields
      if (!trip_id || !pickup_stop_id || !dropoff_stop_id || !travel_date) {
        throw new Error(`Booking ${index + 1}: Missing required fields (trip_id, pickup_stop_id, dropoff_stop_id, travel_date)`);
      }

      // Validate seat selection if provided
      if (seat_numbers.length > 0 && seat_numbers.length !== passenger_count) {
        throw new Error(`Booking ${index + 1}: Number of selected seats must match passenger count`);
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

      // Calculate fare
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
        seat_numbers: seat_numbers.length > 0 ? seat_numbers.join(',') : null,
        booking_type: 'pre_booking',
        travel_date,
        is_multi_day: true,
        booking_reference: bookingReference,
        status: 'confirmed',
        payment_status: 'pending'
      }, { transaction });

      // Reserve seats if specified
      let reservedSeats = [];
      if (seat_numbers.length > 0) {
        reservedSeats = await reserveSeatsForBooking(
          booking.booking_id,
          trip_id,
          seat_numbers,
          passenger_names,
          travel_date,
          bookingReference,
          transaction
        );

        // Update booking with seat assignments
        const seatAssignments = reservedSeats.map(rs => ({
          seat_number: rs.seat_number,
          passenger_name: rs.passenger_name
        }));

        await booking.update({
          seat_assignments: JSON.stringify(seatAssignments)
        }, { transaction });
      }

      // Generate QR code for this booking
      const qrCodeData = await generateBookingQRCode({
        ...booking.toJSON(),
        route_info: {
          route_name: trip.Route.route_name,
          start_point: trip.Route.start_point,
          end_point: trip.Route.end_point
        }
      }, reservedSeats);

      // Update booking with QR code
      await booking.update({ qr_code_data: qrCodeData }, { transaction });

      createdBookings.push({
        booking_id: booking.booking_id,
        booking_reference: booking.booking_reference,
        trip_id,
        travel_date,
        fare_amount: bookingFare,
        passenger_count,
        seat_numbers: seat_numbers,
        reserved_seats: reservedSeats,
        qr_code: qrCodeData,
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

    // Create notification for multiple bookings (outside transaction)
    try {
      await Notification.create({
        user_id: req.userId,
        title: 'Multiple Bookings Created',
        message: `${createdBookings.length} bookings created successfully for ${date_range}. Total: ${totalFare.toFixed(0)} TZS`,
        type: 'success',
        related_entity: 'booking',
        related_id: createdBookings[0].booking_id
      });
    } catch (notificationError) {
      console.log('⚠️ Failed to create notification:', notificationError.message);
    }

    res.status(201).json({
      status: 'success',
      message: 'Multiple bookings created successfully',
      data: {
        booking_reference: bookingReference,
        bookings: createdBookings,
        total_bookings: createdBookings.length,
        total_fare: totalFare,
        is_multi_day: true,
        date_range,
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

// Get user bookings with enhanced details
exports.getUserBookings = async (req, res) => {
  try {
    const { status, booking_type, travel_date, is_multi_day } = req.query;

    let whereClause = {
      user_id: req.userId
    };

    if (status) {
      whereClause.status = status;
    }

    if (booking_type) {
      whereClause.booking_type = booking_type;
    }

    if (travel_date) {
      whereClause.travel_date = travel_date;
    }

    if (is_multi_day !== undefined) {
      whereClause.is_multi_day = is_multi_day === 'true';
    }

    const bookings = await Booking.findAll({
      where: whereClause,
      include: [
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
          model: BookingSeat,
          as: 'booking_seats',
          include: [{
            model: Seat,
            attributes: ['seat_id', 'seat_number', 'seat_type']
          }],
          attributes: ['booking_seat_id', 'passenger_name', 'is_occupied', 'boarded_at', 'alighted_at']
        }
      ],
      order: [['booking_time', 'DESC']]
    });

    // Group multi-day bookings by booking_reference
    const groupedBookings = {};
    const singleBookings = [];

    bookings.forEach(booking => {
      if (booking.is_multi_day && booking.booking_reference) {
        if (!groupedBookings[booking.booking_reference]) {
          groupedBookings[booking.booking_reference] = {
            booking_reference: booking.booking_reference,
            bookings: [],
            total_fare: 0,
            total_bookings: 0,
            date_range: null,
            is_multi_day: true
          };
        }

        groupedBookings[booking.booking_reference].bookings.push({
          ...booking.toJSON(),
          seat_details: booking.booking_seats,
          qr_code: booking.qr_code_data
        });
        groupedBookings[booking.booking_reference].total_fare += parseFloat(booking.fare_amount);
        groupedBookings[booking.booking_reference].total_bookings += 1;
      } else {
        singleBookings.push({
          ...booking.toJSON(),
          seat_details: booking.booking_seats,
          qr_code: booking.qr_code_data
        });
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        single_bookings: singleBookings,
        multi_day_bookings: Object.values(groupedBookings),
        total_single: singleBookings.length,
        total_multi_day_groups: Object.keys(groupedBookings).length
      }
    });

  } catch (error) {
    console.error('❌ Error getting user bookings:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user bookings'
    });
  }
};

// Get booking details with full information
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
              attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'color', 'seat_capacity'],
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
          model: BookingSeat,
          as: 'booking_seats',
          include: [{
            model: Seat,
            attributes: ['seat_id', 'seat_number', 'seat_type']
          }],
          attributes: ['booking_seat_id', 'passenger_name', 'is_occupied', 'boarded_at', 'alighted_at']
        }
      ]
    });

    if (!booking) {
      return res.status(404).json({
        status: 'error',
        message: 'Booking not found'
      });
    }

    // If this is part of a multi-day booking, get related bookings
    let relatedBookings = [];
    if (booking.is_multi_day && booking.booking_reference) {
      relatedBookings = await Booking.findAll({
        where: {
          booking_reference: booking.booking_reference,
          user_id: req.userId,
          booking_id: { [Op.ne]: booking.booking_id }
        },
        include: [
          {
            model: Trip,
            include: [{
              model: db.Route,
              attributes: ['route_name']
            }],
            attributes: ['trip_id', 'start_time', 'status']
          }
        ],
        attributes: ['booking_id', 'travel_date', 'fare_amount', 'passenger_count', 'status', 'qr_code_data'],
        order: [['travel_date', 'ASC']]
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        ...booking.toJSON(),
        seat_details: booking.booking_seats,
        qr_code: booking.qr_code_data,
        related_bookings: relatedBookings
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

// Cancel booking (single or entire multi-day group)
exports.cancelBooking = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { id } = req.params;
    const { cancel_entire_group = false } = req.body;

    const booking = await Booking.findOne({
      where: {
        booking_id: id,
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

    if (booking.status === 'cancelled') {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Booking is already cancelled'
      });
    }

    if (booking.status === 'completed') {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Cannot cancel completed booking'
      });
    }

    let cancelledBookings = [];

    if (booking.is_multi_day && booking.booking_reference && cancel_entire_group) {
      // Cancel entire multi-day booking group
      const relatedBookings = await Booking.findAll({
        where: {
          booking_reference: booking.booking_reference,
          user_id: req.userId,
          status: { [Op.ne]: 'cancelled' }
        },
        transaction
      });

      for (const relatedBooking of relatedBookings) {
        // Release seats for each booking
        await BookingSeat.destroy({
          where: { booking_id: relatedBooking.booking_id },
          transaction
        });

        // Update booking status
        await relatedBooking.update({
          status: 'cancelled',
          updated_at: new Date()
        }, { transaction });

        cancelledBookings.push(relatedBooking.booking_id);
      }
    } else {
      // Cancel single booking
      await BookingSeat.destroy({
        where: { booking_id: booking.booking_id },
        transaction
      });

      await booking.update({
        status: 'cancelled',
        updated_at: new Date()
      }, { transaction });

      cancelledBookings.push(booking.booking_id);
    }

    await transaction.commit();

    // Create notification (outside transaction)
    try {
      await Notification.create({
        user_id: req.userId,
        title: 'Booking Cancelled',
        message: `${cancelledBookings.length} booking(s) cancelled successfully. Refund will be processed if applicable.`,
        type: 'info',
        related_entity: 'booking',
        related_id: booking.booking_id
      });
    } catch (notificationError) {
      console.log('⚠️ Failed to create notification:', notificationError.message);
    }

    res.status(200).json({
      status: 'success',
      message: `${cancelledBookings.length} booking(s) cancelled successfully`,
      data: {
        cancelled_bookings: cancelledBookings,
        booking_reference: booking.booking_reference,
        refund_eligible: booking.payment_status === 'paid'
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error cancelling booking:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to cancel booking'
    });
  }
};

// Get available seats for a trip
exports.getAvailableSeats = async (req, res) => {
  try {
    const { trip_id } = req.params;
    const { travel_date } = req.query;

    if (!trip_id) {
      return res.status(400).json({
        status: 'error',
        message: 'Trip ID is required'
      });
    }

    // Get trip and vehicle information using raw query for better performance
    const [tripResults] = await db.sequelize.query(
      `SELECT t.trip_id, t.vehicle_id, v.seat_capacity, v.plate_number 
       FROM trips t 
       JOIN vehicles v ON t.vehicle_id = v.vehicle_id 
       WHERE t.trip_id = ? LIMIT 1`,
      {
        replacements: [trip_id],
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    if (!tripResults) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Get all seats for this vehicle
    const allSeats = await db.sequelize.query(
      `SELECT seat_id, seat_number, seat_type, is_available 
       FROM seats 
       WHERE vehicle_id = ? 
       ORDER BY seat_number`,
      {
        replacements: [tripResults.vehicle_id],
        type: db.sequelize.QueryTypes.SELECT
      }
    );

    // Get occupied seats for this trip and date
    let occupiedSeatsQuery = `
      SELECT bs.seat_id, bs.passenger_name, bs.is_occupied, s.seat_number, s.seat_type
      FROM booking_seats bs
      JOIN seats s ON bs.seat_id = s.seat_id
      WHERE bs.trip_id = ? AND bs.is_occupied = 1
    `;

    const queryParams = [trip_id];

    if (travel_date) {
      occupiedSeatsQuery += ' AND bs.booking_date = ?';
      queryParams.push(travel_date);
    }

    const occupiedSeats = await db.sequelize.query(occupiedSeatsQuery, {
      replacements: queryParams,
      type: db.sequelize.QueryTypes.SELECT
    });

    const occupiedSeatIds = occupiedSeats.map(os => os.seat_id);

    // Calculate available seats
    const availableSeats = allSeats.filter(seat =>
      seat.is_available && !occupiedSeatIds.includes(seat.seat_id)
    );

    res.status(200).json({
      status: 'success',
      data: {
        trip_id: trip_id,
        vehicle_info: {
          vehicle_id: tripResults.vehicle_id,
          plate_number: tripResults.plate_number,
          total_capacity: tripResults.seat_capacity
        },
        seat_summary: {
          total_seats: allSeats.length,
          available_seats: availableSeats.length,
          occupied_seats: occupiedSeats.length
        },
        available_seats: availableSeats.map(seat => ({
          seat_id: seat.seat_id,
          seat_number: seat.seat_number,
          seat_type: seat.seat_type
        })),
        occupied_seats: occupiedSeats.map(os => ({
          seat_id: os.seat_id,
          seat_number: os.seat_number,
          seat_type: os.seat_type,
          passenger_name: os.passenger_name,
          is_occupied: os.is_occupied
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error getting available seats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get available seats'
    });
  }
};

// Release seat when passenger alights
exports.releaseSeat = async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { booking_seat_id } = req.params;

    if (!booking_seat_id) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Booking seat ID is required'
      });
    }

    // Find the booking seat and verify ownership using raw query for XAMPP compatibility
    const [bookingSeatResults] = await db.sequelize.query(
      `SELECT bs.booking_seat_id, bs.alighted_at, b.user_id, b.booking_id
       FROM booking_seats bs
       JOIN bookings b ON bs.booking_id = b.booking_id
       WHERE bs.booking_seat_id = ? AND b.user_id = ? LIMIT 1`,
      {
        replacements: [booking_seat_id, req.userId],
        type: db.sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    if (!bookingSeatResults) {
      await transaction.rollback();
      return res.status(404).json({
        status: 'error',
        message: 'Booking seat not found or access denied'
      });
    }

    if (bookingSeatResults.alighted_at) {
      await transaction.rollback();
      return res.status(400).json({
        status: 'error',
        message: 'Passenger has already alighted'
      });
    }

    // Update booking seat to mark passenger as alighted
    await db.sequelize.query(
      `UPDATE booking_seats 
       SET alighted_at = NOW(), is_occupied = 0, updated_at = NOW()
       WHERE booking_seat_id = ?`,
      {
        replacements: [booking_seat_id],
        type: db.sequelize.QueryTypes.UPDATE,
        transaction
      }
    );

    await transaction.commit();

    res.status(200).json({
      status: 'success',
      message: 'Seat released successfully',
      data: {
        booking_seat_id: booking_seat_id,
        alighted_at: new Date(),
        seat_available: true
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error releasing seat:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to release seat'
    });
  }
};