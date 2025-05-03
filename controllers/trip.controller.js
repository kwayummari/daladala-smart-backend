const db = require('../models');
const { Sequelize, Op } = require('sequelize'); // Direct import of Sequelize and Op
const Trip = db.Trip;
const Route = db.Route;
const Stop = db.Stop;
const RouteTracking = db.RouteTracking;
const Vehicle = db.Vehicle;
const Driver = db.Driver;
const User = db.User;

// The rest of your code remains the same, just make sure to use Op instead of db.Sequelize.Op

// Get upcoming trips
exports.getUpcomingTrips = async (req, res) => {
  try {
    const { route_id } = req.query;
    let whereClause = {
      status: {
        [Op.in]: ['scheduled', 'in_progress']
      },
      start_time: {
        [Op.gte]: new Date()
      }
    };

    if (route_id) {
      whereClause.route_id = route_id;
    }

    const trips = await Trip.findAll({
      where: whereClause,
      include: [
        {
          model: Route,
          attributes: ['route_id', 'route_number', 'route_name', 'start_point', 'end_point']
        },
        {
          model: Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'capacity', 'color', 'is_air_conditioned']
        },
        {
          model: Driver,
          attributes: ['driver_id', 'rating', 'total_ratings'],
          include: [{
            model: User,
            attributes: ['first_name', 'last_name', 'profile_picture']
          }]
        },
        {
          model: Stop,
          as: 'currentStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        },
        {
          model: Stop,
          as: 'nextStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        }
      ],
      order: [['start_time', 'ASC']]
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

// Get trip details
exports.getTripDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const trip = await Trip.findByPk(id, {
      include: [
        {
          model: Route,
          attributes: ['route_id', 'route_number', 'route_name', 'start_point', 'end_point', 'distance_km', 'estimated_time_minutes']
        },
        {
          model: Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'capacity', 'color', 'is_air_conditioned']
        },
        {
          model: Driver,
          attributes: ['driver_id', 'rating', 'total_ratings'],
          include: [{
            model: User,
            attributes: ['first_name', 'last_name', 'profile_picture']
          }]
        },
        {
          model: Stop,
          as: 'currentStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        },
        {
          model: Stop,
          as: 'nextStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        }
      ]
    });

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Get route tracking data
    const tracking = await RouteTracking.findAll({
      where: {
        trip_id: id
      },
      include: [{
        model: Stop,
        attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
      }],
      order: [
        [{ model: Stop, as: 'Stop' }, 'stop_order', 'ASC']
      ]
    });

    // Get vehicle location
    const vehicleLocation = await db.VehicleLocation.findOne({
      where: {
        trip_id: id
      },
      order: [['recorded_at', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: {
        trip,
        tracking,
        currentLocation: vehicleLocation
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get trips by route
exports.getTripsByRoute = async (req, res) => {
  try {
    const { route_id } = req.params;
    const { date } = req.query;

    let whereClause = {
      route_id
    };

    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      
      whereClause.start_time = {
        [Op.between]: [startDate, endDate]
      };
    }

    const trips = await Trip.findAll({
      where: whereClause,
      include: [
        {
          model: Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'capacity']
        },
        {
          model: Driver,
          attributes: ['driver_id', 'rating'],
          include: [{
            model: User,
            attributes: ['first_name', 'last_name']
          }]
        }
      ],
      order: [['start_time', 'ASC']]
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

// Driver: Update trip status
exports.updateTripStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, current_stop_id, next_stop_id } = req.body;

    const trip = await Trip.findByPk(id);

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Check if this is the driver assigned to the trip
    const driver = await Driver.findOne({
      where: {
        user_id: req.userId
      }
    });

    if (!driver || trip.driver_id !== driver.driver_id) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to update this trip'
      });
    }

    // Update trip
    const updateData = {};
    
    if (status) updateData.status = status;
    if (current_stop_id) updateData.current_stop_id = current_stop_id;
    if (next_stop_id) updateData.next_stop_id = next_stop_id;
    
    if (status === 'completed') {
      updateData.end_time = new Date();
    }

    await trip.update(updateData);

    // If current stop is updated, update route tracking
    if (current_stop_id) {
      const tracking = await RouteTracking.findOne({
        where: {
          trip_id: id,
          stop_id: current_stop_id
        }
      });

      if (tracking) {
        await tracking.update({
          arrival_time: new Date(),
          status: 'arrived'
        });
      }
    }

    // If moving to next stop, mark previous stop as departed
    if (next_stop_id && current_stop_id) {
      const tracking = await RouteTracking.findOne({
        where: {
          trip_id: id,
          stop_id: current_stop_id
        }
      });

      if (tracking) {
        await tracking.update({
          departure_time: new Date(),
          status: 'departed'
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Trip status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Driver: Update vehicle location
exports.updateVehicleLocation = async (req, res) => {
  try {
    const { trip_id } = req.params;
    const { latitude, longitude, heading, speed } = req.body;

    const trip = await Trip.findByPk(trip_id);

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Check if this is the driver assigned to the trip
    const driver = await Driver.findOne({
      where: {
        user_id: req.userId
      }
    });

    if (!driver || trip.driver_id !== driver.driver_id) {
      return res.status(403).json({
        status: 'error',
        message: 'You are not authorized to update this trip'
      });
    }

    // Create new location record
    await db.VehicleLocation.create({
      vehicle_id: trip.vehicle_id,
      trip_id,
      latitude,
      longitude,
      heading,
      speed,
      recorded_at: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Vehicle location updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};