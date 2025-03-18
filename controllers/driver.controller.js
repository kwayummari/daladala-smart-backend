// controllers/driver.controller.js
const db = require('../models');
const Driver = db.Driver;
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
exports.getStatistics = async (req, res) => {
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

    // Get current day's trips
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTrips = await db.Trip.count({
      where: {
        driver_id: driver.driver_id,
        start_time: {
          [db.Sequelize.Op.gte]: today
        }
      }
    });

    // Get total passengers served (from bookings)
    const passengersQuery = await db.sequelize.query(`
      SELECT SUM(b.passenger_count) as total_passengers
      FROM bookings b
      JOIN trips t ON b.trip_id = t.trip_id
      WHERE t.driver_id = :driverId AND b.status = 'completed'
    `, {
      replacements: { driverId: driver.driver_id },
      type: db.sequelize.QueryTypes.SELECT
    });

    const totalPassengers = passengersQuery[0].total_passengers || 0;

    res.status(200).json({
      status: 'success',
      data: {
        total_trips: totalTrips,
        today_trips: todayTrips,
        total_passengers: totalPassengers,
        rating: driver.rating,
        total_ratings: driver.total_ratings
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};