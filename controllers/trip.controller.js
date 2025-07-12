const db = require('../models');
const { Op } = require('sequelize');
const Trip = db.Trip;
const Route = db.Route;
const Vehicle = db.Vehicle;
const Driver = db.Driver;
const User = db.User;
const Stop = db.Stop;
const RouteTracking = db.RouteTracking;
const Booking = db.Booking;

// Get upcoming trips for a user
// Replace the getUpcomingTrips function in your trip controller with this:

exports.getUpcomingTrips = async (req, res) => {
  try {
    const userId = req.userId; // From JWT middleware (might be undefined for public access)
    const { route_id, limit = 10 } = req.query;
    let whereClause = {
      start_time: {
        [Op.gte]: new Date() // Only future trips
      },
      status: {
        [Op.in]: ['scheduled', 'active', 'in_progress']
      }
    };

    // If route_id is provided, filter by route
    if (route_id) {
      whereClause.route_id = route_id;
    }

    // If user is authenticated, get their specific trips with bookings
    if (userId) {
      try {
        // Get user's bookings to find their trips
        const userBookings = await Booking.findAll({
          where: {
            user_id: userId,
            status: {
              [Op.in]: ['confirmed', 'paid']
            }
          },
          attributes: ['trip_id']
        });

        const userTripIds = userBookings.map(booking => booking.trip_id);

        // If user has no bookings, return empty array
        if (userTripIds.length === 0) {
          return res.status(200).json({
            status: 'success',
            data: []
          });
        }

        // Add user's trip IDs to where clause
        whereClause.trip_id = {
          [Op.in]: userTripIds
        };
      } catch (bookingError) {
        console.error('Error fetching user bookings:', bookingError);
        // Continue without user-specific filtering if there's an error
      }
    }

    const trips = await Trip.findAll({
      where: whereClause,
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
        }
      ],
      order: [['start_time', 'ASC']],
      limit: parseInt(limit)
    });

    // Add available seats information
    const tripsWithSeats = await Promise.all(
      trips.map(async (trip) => {
        try {
          const totalPassengers = await Booking.sum('passenger_count', {
            where: {
              trip_id: trip.trip_id,
              status: {
                [Op.in]: ['confirmed', 'paid']
              }
            }
          }) || 0;

          const availableSeats = trip.Vehicle.capacity - totalPassengers;

          let tripData = {
            ...trip.toJSON(),
            available_seats: Math.max(0, availableSeats),
            occupied_seats: totalPassengers
          };

          // If user is authenticated, add their booking information
          if (userId) {
            try {
              const userBooking = await Booking.findOne({
                where: {
                  user_id: userId,
                  trip_id: trip.trip_id
                },
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
                  }
                ]
              });

              if (userBooking) {
                tripData.booking = {
                  booking_id: userBooking.booking_id,
                  passenger_count: userBooking.passenger_count,
                  fare_amount: userBooking.fare_amount,
                  pickup_stop: userBooking.pickupStop,
                  dropoff_stop: userBooking.dropoffStop,
                  booking_time: userBooking.booking_time,
                  status: userBooking.status,
                  payment_status: userBooking.payment_status
                };
              }
            } catch (userBookingError) {
              console.error('Error fetching user booking for trip:', userBookingError);
              // Continue without user booking info
            }
          }

          return tripData;
        } catch (seatError) {
          console.error('Error calculating seats for trip:', seatError);
          return {
            ...trip.toJSON(),
            available_seats: 0,
            occupied_seats: 0
          };
        }
      })
    );

    res.status(200).json({
      status: 'success',
      data: tripsWithSeats
    });
  } catch (error) {
    console.error('Error fetching upcoming trips:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.getUpcomingTrips2 = async (req, res) => {
  try {
    const { route_id, limit = 10 } = req.query;

    let whereClause = {
      start_time: {
        [Op.gte]: new Date() // Only future trips
      },
      status: {
        [Op.in]: ['scheduled', 'active', 'in_progress']
      }
    };

    // If route_id is provided, filter by route
    if (route_id) {
      whereClause.route_id = route_id;
    }

    const trips = await Trip.findAll({
      where: whereClause,
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
        }
      ],
      order: [['start_time', 'ASC']],
      limit: parseInt(limit)
    });
    // Add available seats information
    const tripsWithSeats = await Promise.all(
      trips.map(async (trip) => {
        try {
          const totalPassengers = await Booking.sum('passenger_count', {
            where: {
              trip_id: trip.trip_id,
              status: {
                [Op.in]: ['confirmed', 'paid']
              }
            }
          }) || 0;

          const passengerCount = totalPassengers === null ? 0 : Number(totalPassengers);
          // FIX: Ensure capacity is a number
          const vehicleCapacity = parseInt(trip.Vehicle.capacity) || 30;
          const availableSeats = vehicleCapacity - passengerCount;

          return {
            ...trip.toJSON(),
            available_seats: Math.max(0, availableSeats),
            occupied_seats: passengerCount
          };
        } catch (seatError) {
          console.error('Error calculating seats for trip:', seatError);
          return {
            ...trip.toJSON(),
            available_seats: 30, // Default fallback
            occupied_seats: 0
          };
        }
      })
    );

    res.status(200).json({
      status: 'success',
      data: tripsWithSeats
    });
  } catch (error) {
    console.error('Error fetching upcoming trips:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get all available trips (for route browsing)
exports.getAllTrips = async (req, res) => {
  try {
    const {
      route_id,
      date,
      start_point,
      end_point,
      limit = 20,
      offset = 0
    } = req.query;

    let whereClause = {
      start_time: {
        [Op.gte]: new Date() // Only future trips
      },
      status: {
        [Op.in]: ['scheduled', 'active']
      }
    };

    // Filter by route if provided
    if (route_id) {
      whereClause.route_id = route_id;
    }

    // Filter by date if provided
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      whereClause.start_time = {
        [Op.gte]: startDate,
        [Op.lt]: endDate
      };
    }

    // Include route filtering by start/end points if provided
    let routeWhere = {};
    if (start_point) {
      routeWhere.start_point = {
        [Op.iLike]: `%${start_point}%`
      };
    }
    if (end_point) {
      routeWhere.end_point = {
        [Op.iLike]: `%${end_point}%`
      };
    }

    const trips = await Trip.findAll({
      where: whereClause,
      include: [
        {
          model: Route,
          where: Object.keys(routeWhere).length > 0 ? routeWhere : undefined,
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
        }
      ],
      order: [['start_time', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Add available seats information
    const tripsWithSeats = await Promise.all(
      trips.map(async (trip) => {
        const totalBookings = await Booking.count({
          where: {
            trip_id: trip.trip_id,
            status: {
              [Op.in]: ['confirmed', 'paid']
            }
          }
        });

        const totalPassengers = await Booking.sum('passenger_count', {
          where: {
            trip_id: trip.trip_id,
            status: {
              [Op.in]: ['confirmed', 'paid']
            }
          }
        }) || 0;

        const availableSeats = trip.Vehicle.capacity - totalPassengers;

        return {
          ...trip.toJSON(),
          available_seats: Math.max(0, availableSeats),
          total_bookings: totalBookings,
          occupied_seats: totalPassengers
        };
      })
    );

    res.status(200).json({
      status: 'success',
      data: tripsWithSeats
    });
  } catch (error) {
    console.error('Error fetching trips:', error);
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
      order: [['stop_order', 'ASC']]
    });

    // Get vehicle location
    const vehicleLocation = await db.VehicleLocation.findOne({
      where: {
        trip_id: id
      },
      order: [['recorded_at', 'DESC']]
    });

    // Get available seats
    const totalPassengers = await Booking.sum('passenger_count', {
      where: {
        trip_id: id,
        status: {
          [Op.in]: ['confirmed', 'paid']
        }
      }
    }) || 0;

    const availableSeats = trip.Vehicle.capacity - totalPassengers;

    res.status(200).json({
      status: 'success',
      data: {
        trip: {
          ...trip.toJSON(),
          available_seats: Math.max(0, availableSeats),
          occupied_seats: totalPassengers
        },
        tracking,
        currentLocation: vehicleLocation
      }
    });
  } catch (error) {
    console.error('Error fetching trip details:', error);
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
    const { date, limit = 20 } = req.query;

    let whereClause = {
      route_id,
      start_time: {
        [Op.gte]: new Date()
      },
      status: {
        [Op.in]: ['scheduled', 'active']
      }
    };

    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      whereClause.start_time = {
        [Op.gte]: startDate,
        [Op.lt]: endDate
      };
    }

    const trips = await Trip.findAll({
      where: whereClause,
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
        }
      ],
      order: [['start_time', 'ASC']],
      limit: parseInt(limit)
    });

    // Add available seats information
    const tripsWithSeats = await Promise.all(
      trips.map(async (trip) => {
        const totalPassengers = await Booking.sum('passenger_count', {
          where: {
            trip_id: trip.trip_id,
            status: {
              [Op.in]: ['confirmed', 'paid']
            }
          }
        }) || 0;

        const availableSeats = trip.Vehicle.capacity - totalPassengers;

        return {
          ...trip.toJSON(),
          available_seats: Math.max(0, availableSeats),
          occupied_seats: totalPassengers
        };
      })
    );

    res.status(200).json({
      status: 'success',
      data: tripsWithSeats
    });
  } catch (error) {
    console.error('Error fetching trips by route:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Update trip status (for drivers)
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

    // Update trip
    await trip.update({
      status,
      current_stop_id,
      next_stop_id,
      updated_at: new Date()
    });

    // Create tracking entry if stop changed
    if (current_stop_id) {
      await RouteTracking.create({
        trip_id: id,
        stop_id: current_stop_id,
        actual_arrival_time: new Date(),
        status: 'arrived'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Trip status updated successfully',
      data: {
        trip_id: trip.trip_id,
        status: trip.status,
        current_stop_id: trip.current_stop_id,
        next_stop_id: trip.next_stop_id
      }
    });
  } catch (error) {
    console.error('Error updating trip status:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Update vehicle location (for drivers)
exports.updateVehicleLocation = async (req, res) => {
  try {
    const { id } = req.params; // This is trip_id
    const { latitude, longitude, heading, speed } = req.body;

    const trip = await Trip.findByPk(id);
    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Create vehicle location record (keep your existing logic)
    await db.VehicleLocation.create({
      trip_id: id,
      vehicle_id: trip.vehicle_id,
      latitude,
      longitude,
      heading,
      speed,
      recorded_at: new Date()
    });

    // ALSO update trip with latest location (if fields exist)
    try {
      await trip.update({
        driver_latitude: latitude,
        driver_longitude: longitude,
        last_driver_update: new Date()
      });
    } catch (updateError) {
    }

    res.status(200).json({
      status: 'success',
      message: 'Vehicle location updated successfully'
    });
  } catch (error) {
    console.error('Error updating vehicle location:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.startTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.driverId || req.userId;

    const trip = await Trip.findOne({
      where: {
        trip_id: id,
        driver_id: driverId
      }
    });

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found or not assigned to this driver'
      });
    }

    if (trip.status !== 'scheduled') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot start trip. Current status: ${trip.status}`
      });
    }

    await trip.update({
      status: 'in_progress',
      // Set actual start time if different from scheduled
      start_time: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Trip started successfully',
      data: {
        trip_id: trip.trip_id,
        status: trip.status,
        start_time: trip.start_time
      }
    });

  } catch (error) {
    console.error('Error starting trip:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to start trip',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// End trip (for drivers) - ADD THIS
exports.endTrip = async (req, res) => {
  try {
    const { id } = req.params;
    const driverId = req.driverId || req.userId;

    const trip = await Trip.findOne({
      where: {
        trip_id: id,
        driver_id: driverId
      }
    });

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found or not assigned to this driver'
      });
    }

    if (trip.status !== 'in_progress') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot end trip. Current status: ${trip.status}`
      });
    }

    await trip.update({
      status: 'completed',
      end_time: new Date()
    });

    // Update all associated bookings to completed
    await Booking.update(
      { status: 'completed' },
      {
        where: {
          trip_id: id,
          status: 'in_progress'
        }
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'Trip ended successfully',
      data: {
        trip_id: trip.trip_id,
        status: trip.status,
        end_time: trip.end_time
      }
    });

  } catch (error) {
    console.error('Error ending trip:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to end trip',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update driver location during trip - ADD THIS
exports.updateDriverLocation = async (req, res) => {
  try {
    const { latitude, longitude, heading, speed } = req.body;
    const driverId = req.driverId || req.userId;

    if (!latitude || !longitude) {
      return res.status(400).json({
        status: 'error',
        message: 'Latitude and longitude are required'
      });
    }

    // Find active trip for this driver
    const activeTrip = await Trip.findOne({
      where: {
        driver_id: driverId,
        status: 'in_progress'
      }
    });

    if (!activeTrip) {
      return res.status(404).json({
        status: 'error',
        message: 'No active trip found for location update'
      });
    }

    // Update trip with driver location
    await activeTrip.update({
      driver_latitude: latitude,
      driver_longitude: longitude,
      last_driver_update: new Date()
    });

    // Also create vehicle location record
    try {
      await VehicleLocation.create({
        vehicle_id: activeTrip.vehicle_id,
        trip_id: activeTrip.trip_id,
        latitude,
        longitude,
        heading: heading || null,
        speed: speed || null,
        recorded_at: new Date()
      });
    } catch (locationError) {
      console.warn('Could not create vehicle location record:', locationError.message);
      // Don't fail the request if location recording fails
    }

    res.status(200).json({
      status: 'success',
      message: 'Location updated successfully',
      data: {
        trip_id: activeTrip.trip_id,
        latitude,
        longitude,
        updated_at: new Date()
      }
    });

  } catch (error) {
    console.error('Error updating driver location:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get driver's current trips - ADD THIS
exports.getDriverTrips = async (req, res) => {
  try {
    const driverId = req.driverId || req.userId;
    const { status } = req.query;

    if (!driverId) {
      return res.status(400).json({
        status: 'error',
        message: 'Driver ID is required'
      });
    }

    const whereCondition = { driver_id: driverId };
    if (status && status !== 'all') {
      whereCondition.status = status;
    }

    const trips = await Trip.findAll({
      where: whereCondition,
      include: [
        {
          model: Route,
          attributes: ['route_id', 'route_number', 'route_name', 'start_point', 'end_point']
        },
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
      order: [['start_time', 'DESC']],
      limit: 50
    });

    // Calculate passenger count for each trip
    const tripsWithPassengers = await Promise.all(
      trips.map(async (trip) => {
        const passengerCount = await Booking.sum('passenger_count', {
          where: {
            trip_id: trip.trip_id,
            status: {
              [Op.in]: ['confirmed', 'paid', 'in_progress']
            }
          }
        }) || 0;

        return {
          trip_id: trip.trip_id,
          route_name: trip.Route?.route_name || 'Unknown Route',
          route_number: trip.Route?.route_number || 'N/A',
          vehicle_plate: trip.Vehicle?.plate_number || 'Unknown',
          start_time: trip.start_time,
          end_time: trip.end_time,
          status: trip.status,
          passenger_count: passengerCount,
          Route: trip.Route,
          Vehicle: trip.Vehicle,
          Driver: trip.Driver
        };
      })
    );

    res.status(200).json({
      status: 'success',
      data: {
        trips: tripsWithPassengers,
        total: trips.length
      }
    });

  } catch (error) {
    console.error('Error getting driver trips:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get trips',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get live trip location for passengers - ADD THIS
exports.getLiveTripLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const trip = await Trip.findByPk(id, {
      include: [
        {
          model: Driver,
          include: [{
            model: User,
            attributes: ['first_name', 'last_name', 'phone', 'profile_picture']
          }]
        }
      ]
    });

    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Check if user has active booking for this trip
    const booking = await Booking.findOne({
      where: {
        user_id: userId,
        trip_id: id,
        status: ['confirmed', 'in_progress']
      }
    });

    if (!booking) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have an active booking for this trip'
      });
    }

    const driverInfo = {
      id: trip.Driver?.driver_id,
      name: `${trip.Driver?.User?.first_name} ${trip.Driver?.User?.last_name}`,
      phone: trip.Driver?.User?.phone,
      profile_picture: trip.Driver?.User?.profile_picture,
      rating: trip.Driver?.rating
    };

    // Try to get location from new fields, fallback to vehicle location
    let locationInfo = {};
    try {
      locationInfo = {
        latitude: trip.driver_latitude || null,
        longitude: trip.driver_longitude || null,
        last_update: trip.last_driver_update || null
      };
    } catch (error) {
      // Fallback to vehicle location table
      const vehicleLocation = await db.VehicleLocation.findOne({
        where: { trip_id: id },
        order: [['recorded_at', 'DESC']]
      });

      locationInfo = {
        latitude: vehicleLocation?.latitude || null,
        longitude: vehicleLocation?.longitude || null,
        last_update: vehicleLocation?.recorded_at || null
      };
    }

    res.status(200).json({
      status: 'success',
      data: {
        trip_id: id,
        driver_info: driverInfo,
        location: locationInfo,
        trip_status: trip.status
      }
    });

  } catch (error) {
    console.error('Error getting live trip location:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get trip location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get passenger trips - ADD THIS
exports.getPassengerTrips = async (req, res) => {
  try {
    const userId = req.userId;
    const { status } = req.query;

    const whereCondition = { user_id: userId };
    if (status) {
      whereCondition.status = status;
    }

    const bookings = await Booking.findAll({
      where: whereCondition,
      include: [
        {
          model: Trip,
          include: [
            {
              model: Route,
              attributes: ['route_name']
            },
            {
              model: Driver,
              include: [
                {
                  model: User,
                  attributes: ['first_name', 'last_name', 'phone']
                }
              ]
            },
            {
              model: Vehicle,
              attributes: ['plate_number', 'vehicle_type']
            }
          ]
        },
        {
          model: Stop,
          as: 'pickupStop',
          attributes: ['stop_name']
        },
        {
          model: Stop,
          as: 'dropoffStop',
          attributes: ['stop_name']
        }
      ],
      order: [['booking_time', 'DESC']],
      limit: 20
    });

    const formattedBookings = bookings.map(booking => ({
      booking_id: booking.booking_id,
      trip_id: booking.trip_id,
      route_name: booking.Trip?.Route?.route_name,
      pickup_stop: booking.pickupStop?.stop_name,
      dropoff_stop: booking.dropoffStop?.stop_name,
      departure_time: booking.Trip?.start_time,
      seat_numbers: booking.seat_numbers,
      fare_amount: booking.fare_amount,
      booking_status: booking.status,
      trip_status: booking.Trip?.status,
      driver_info: {
        name: `${booking.Trip?.Driver?.User?.first_name} ${booking.Trip?.Driver?.User?.last_name}`,
        phone: booking.Trip?.Driver?.User?.phone,
        rating: booking.Trip?.Driver?.rating
      },
      vehicle_info: {
        plate_number: booking.Trip?.Vehicle?.plate_number,
        type: booking.Trip?.Vehicle?.vehicle_type
      }
    }));

    res.status(200).json({
      status: 'success',
      data: {
        bookings: formattedBookings,
        total: bookings.length
      }
    });

  } catch (error) {
    console.error('Error getting passenger trips:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get trips',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

