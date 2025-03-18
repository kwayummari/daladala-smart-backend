const db = require('../models');
const Trip = db.Trip;
const RouteTracking = db.RouteTracking;
const VehicleLocation = db.VehicleLocation;
const NotificationService = require('./notification.service');
const { Op } = db.Sequelize;

class TripService {
  /**
   * Get active trip for a driver
   * @param {number} driverId - Driver ID
   * @returns {Promise<Object|null>} - The active trip or null
   */
  static async getActiveDriverTrip(driverId) {
    try {
      return await Trip.findOne({
        where: {
          driver_id: driverId,
          status: {
            [Op.in]: ['scheduled', 'in_progress']
          },
          start_time: {
            [Op.lte]: new Date(new Date().getTime() + 30 * 60000) // Include trips starting in the next 30 minutes
          }
        },
        include: [
          {
            model: db.Route,
            attributes: ['route_id', 'route_name', 'start_point', 'end_point']
          },
          {
            model: db.Vehicle,
            attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'capacity']
          },
          {
            model: db.Stop,
            as: 'currentStop',
            attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
          },
          {
            model: db.Stop,
            as: 'nextStop',
            attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
          }
        ],
        order: [['start_time', 'ASC']]
      });
    } catch (error) {
      throw new Error(`Failed to get active driver trip: ${error.message}`);
    }
  }

  /**
   * Update trip status
   * @param {number} tripId - Trip ID
   * @param {string} status - New status
   * @param {number} currentStopId - Current stop ID
   * @param {number} nextStopId - Next stop ID
   * @returns {Promise<Object>} - The updated trip
   */
  static async updateTripStatus(tripId, status, currentStopId, nextStopId) {
    try {
      const trip = await Trip.findByPk(tripId);

      if (!trip) {
        throw new Error('Trip not found');
      }

      // Update trip
      const updateData = {};
      
      if (status) updateData.status = status;
      if (currentStopId) updateData.current_stop_id = currentStopId;
      if (nextStopId) updateData.next_stop_id = nextStopId;
      
      if (status === 'completed') {
        updateData.end_time = new Date();
      }

      await trip.update(updateData);

      // If current stop is updated, update route tracking
      if (currentStopId) {
        await this.updateRouteTracking(tripId, currentStopId, 'arrived');
      }

      // If moving to next stop, mark previous stop as departed
      if (nextStopId && currentStopId) {
        await this.updateRouteTracking(tripId, currentStopId, 'departed');
      }

      // If trip is starting, notify all passengers
      if (status === 'in_progress' && trip.status === 'scheduled') {
        await this.notifyTripStart(tripId);
      }

      // If trip is completed, notify all passengers
      if (status === 'completed') {
        await this.notifyTripCompletion(tripId);
      }

      return trip;
    } catch (error) {
      throw new Error(`Failed to update trip status: ${error.message}`);
    }
  }

  /**
   * Update route tracking
   * @param {number} tripId - Trip ID
   * @param {number} stopId - Stop ID
   * @param {string} status - New status (arrived, departed)
   * @returns {Promise<Object>} - The updated tracking
   */
  static async updateRouteTracking(tripId, stopId, status) {
    try {
      const tracking = await RouteTracking.findOne({
        where: {
          trip_id: tripId,
          stop_id: stopId
        }
      });

      if (!tracking) {
        throw new Error('Route tracking not found');
      }

      const updateData = {
        status
      };

      if (status === 'arrived') {
        updateData.arrival_time = new Date();
      } else if (status === 'departed') {
        updateData.departure_time = new Date();
      }

      return await tracking.update(updateData);
    } catch (error) {
      throw new Error(`Failed to update route tracking: ${error.message}`);
    }
  }

  /**
   * Update vehicle location
   * @param {number} vehicleId - Vehicle ID
   * @param {number} tripId - Trip ID
   * @param {number} latitude - Latitude
   * @param {number} longitude - Longitude
   * @param {number} heading - Heading
   * @param {number} speed - Speed
   * @returns {Promise<Object>} - The created location
   */
  static async updateVehicleLocation(vehicleId, tripId, latitude, longitude, heading, speed) {
    try {
      return await VehicleLocation.create({
        vehicle_id: vehicleId,
        trip_id: tripId,
        latitude,
        longitude,
        heading,
        speed,
        recorded_at: new Date()
      });
    } catch (error) {
      throw new Error(`Failed to update vehicle location: ${error.message}`);
    }
  }

  /**
   * Notify passengers about trip start
   * @param {number} tripId - Trip ID
   * @returns {Promise<void>}
   */
  static async notifyTripStart(tripId) {
    try {
      // Get all bookings for this trip
      const bookings = await db.Booking.findAll({
        where: {
          trip_id: tripId,
          status: {
            [Op.in]: ['confirmed', 'in_progress']
          }
        }
      });

      // Get trip details
      const trip = await Trip.findByPk(tripId);

      // Send notifications to all passengers
      for (const booking of bookings) {
        await NotificationService.sendTripStartNotification(booking.user_id, trip, booking);
      }
    } catch (error) {
      console.error(`Failed to notify trip start: ${error.message}`);
    }
  }

  /**
   * Notify passengers about trip completion
   * @param {number} tripId - Trip ID
   * @returns {Promise<void>}
   */
  static async notifyTripCompletion(tripId) {
    try {
      // Get all bookings for this trip
      const bookings = await db.Booking.findAll({
        where: {
          trip_id: tripId,
          status: 'in_progress'
        }
      });

      // Get trip details
      const trip = await Trip.findByPk(tripId);

      // Update bookings to completed
      for (const booking of bookings) {
        await booking.update({
          status: 'completed'
        });

        // Send notifications to all passengers
        await NotificationService.sendTripCompletionNotification(booking.user_id, trip, booking);
      }
    } catch (error) {
      console.error(`Failed to notify trip completion: ${error.message}`);
    }
  }
}

module.exports = TripService;