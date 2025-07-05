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
    const { id } = req.params;
    const { latitude, longitude, heading, speed } = req.body;

    const trip = await Trip.findByPk(id);
    if (!trip) {
      return res.status(404).json({
        status: 'error',
        message: 'Trip not found'
      });
    }

    // Create or update vehicle location
    await db.VehicleLocation.create({
      trip_id: id,
      vehicle_id: trip.vehicle_id,
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
    console.error('Error updating vehicle location:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};