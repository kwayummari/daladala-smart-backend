// controllers/driver.controller.js
const db = require('../models');
const Driver = db.Driver;
const { Op } = require('sequelize');
const User = db.User;

// Get driver profile
exports.getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({
      where: {
        user_id: req.userId
      },
      include: [{
        model: User,
        attributes: ['first_name', 'last_name', 'phone', 'email', 'profile_picture']
      }]
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: driver
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Update driver availability
exports.updateAvailability = async (req, res) => {
  try {
    const { is_available } = req.body;

    const driver = await Driver.findOne({
      where: {
        user_id: req.userId
      }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    await driver.update({
      is_available: is_available
    });

    res.status(200).json({
      status: 'success',
      message: 'Driver availability updated successfully',
      data: {
        is_available: driver.is_available
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get driver assigned trips
exports.getAssignedTrips = async (req, res) => {
  try {
    const driver = await Driver.findOne({
      where: {
        user_id: req.userId
      }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    const trips = await db.Trip.findAll({
      where: {
        driver_id: driver.driver_id
      },
      include: [
        {
          model: db.Route,
          attributes: ['route_id', 'route_name', 'start_point', 'end_point']
        },
        {
          model: db.Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type']
        }
      ],
      order: [['start_time', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: trips
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get driver statistics
// Get driver statistics
exports.getStatistics = async (req, res) => {
  console.log("Fetching driver statistics for user ID:", req.userId);
  try {
    const driver = await Driver.findOne({
      where: {
        user_id: req.userId
      }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    // Get total trips completed
    const totalTrips = await db.Trip.count({
      where: {
        driver_id: driver.driver_id,
        status: 'completed'
      }
    });
    console.log("Total trips completed:", totalTrips);

    // Get current day's trips
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTrips = await db.Trip.count({
      where: {
        driver_id: driver.driver_id,
        start_time: {
          [Op.gte]: today,      // Changed from db.Sequelize.Op.gte
          [Op.lt]: tomorrow     // Changed from db.Sequelize.Op.lt
        }
      }
    });
    console.log("Today's trips:", todayTrips);

    // Get total passengers served (safer approach)
    let totalPassengers = 0;
    try {
      const passengersResult = await db.Booking.sum('passenger_count', {
        include: [{
          model: db.Trip,
          where: {
            driver_id: driver.driver_id
          },
          attributes: []
        }],
        where: {
          status: 'completed'
        }
      });
      totalPassengers = passengersResult || 0;
    } catch (bookingError) {
      console.log("No bookings found or error:", bookingError.message);
      totalPassengers = 0;
    }

    console.log("Total passengers served:", totalPassengers);

    res.status(200).json({
      status: 'success',
      data: {
        total_trips: totalTrips,
        today_trips: todayTrips,
        total_passengers: totalPassengers,
        rating: parseFloat(driver.rating) || 0,
        total_ratings: driver.total_ratings
      }
    });
  } catch (error) {
    console.error("Error in getStatistics:", error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get driver earnings
exports.getEarnings = async (req, res) => {
  try {
    const { start_date, end_date, period = 'daily' } = req.query;
    const driverId = req.userId;

    // Find the driver
    const driver = await Driver.findOne({
      where: { user_id: driverId }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    // Build date filter
    const { Op } = require('sequelize');
    let dateFilter = {};

    if (start_date && end_date) {
      dateFilter.created_at = {
        [Op.between]: [new Date(start_date), new Date(end_date)]
      };
    }

    // Get completed trips first
    const trips = await db.Trip.findAll({
      where: {
        driver_id: driver.driver_id,
        status: 'completed',
        ...dateFilter
      },
      attributes: ['trip_id', 'created_at', 'start_time', 'end_time'],
      order: [['created_at', 'DESC']]
    });

    let totalEarnings = 0;
    let totalTrips = trips.length;
    let earningsBreakdown = [];

    // Get bookings and payments for each trip separately
    for (const trip of trips) {
      const bookings = await db.Booking.findAll({
        where: {
          trip_id: trip.trip_id,
          status: 'completed',
          payment_status: 'paid'
        },
        include: [
          {
            model: db.Payment,
            where: { status: 'completed' },
            required: false
          }
        ]
      });

      let tripEarnings = 0;

      bookings.forEach(booking => {
        // Add fare amount from booking
        tripEarnings += parseFloat(booking.fare_amount || 0);

        // Or if you prefer to get from payments
        if (booking.Payments) {
          booking.Payments.forEach(payment => {
            // Use this if you want payment amount instead of fare
            // tripEarnings += parseFloat(payment.amount || 0);
          });
        }
      });

      totalEarnings += tripEarnings;

      if (tripEarnings > 0) {
        earningsBreakdown.push({
          trip_id: trip.trip_id,
          date: trip.created_at,
          earnings: tripEarnings,
          passenger_count: bookings.length
        });
      }
    }

    // Calculate driver's share (assuming 80% goes to driver)
    const driverShare = totalEarnings * 0.8;
    const platformFee = totalEarnings * 0.2;

    res.status(200).json({
      status: 'success',
      data: {
        total_earnings: totalEarnings,
        driver_earnings: driverShare,
        platform_fee: platformFee,
        total_trips: totalTrips,
        period: period,
        date_range: {
          start_date: start_date || null,
          end_date: end_date || null
        },
        earnings_breakdown: earningsBreakdown.slice(0, 10)
      }
    });

  } catch (error) {
    console.error('Get driver earnings error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get earnings data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get driver notifications
exports.getNotifications = async (req, res) => {
  try {
    const driver = await Driver.findOne({
      where: { user_id: req.userId }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    const notifications = await db.Notification.findAll({
      where: {
        user_id: req.userId
      },
      order: [['created_at', 'DESC']],
      limit: 10
    });

    res.status(200).json({
      status: 'success',
      data: notifications
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notification_id } = req.params;
    const driver = await Driver.findOne({
      where: { user_id: req.userId }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    const notification = await db.Notification.findOne({
      where: {
        notification_id: notification_id,
        user_id: req.userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found'
      });
    }

    await notification.update({
      is_read: true,
      read_at: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Mark all notifications as read
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const driver = await Driver.findOne({
      where: { user_id: req.userId }
    });

    if (!driver) {
      return res.status(404).json({
        status: 'error',
        message: 'Driver profile not found'
      });
    }

    await db.Notification.update(
      {
        is_read: true,
        read_at: new Date()
      },
      {
        where: {
          user_id: req.userId,
          is_read: false
        }
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};