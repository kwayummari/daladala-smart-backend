// services/locationTrackingService.js
const db = require('../models');
const { Driver, Trip, VehicleLocation, User } = db;
const socketService = require('./socketService');

class LocationTrackingService {

    // Update driver location
    static async updateDriverLocation(driverId, latitude, longitude) {
        try {
            const driver = await Driver.findByPk(driverId, {
                include: [{
                    model: User,
                    as: 'user',
                    attributes: ['first_name', 'last_name', 'phone', 'profile_picture']
                }]
            });

            if (!driver) {
                throw new Error('Driver not found');
            }

            // Update driver's current location
            await driver.update({
                current_latitude: latitude,
                current_longitude: longitude,
                last_location_update: new Date(),
                is_tracking_enabled: true
            });

            // Get active trip for this driver
            const activeTrip = await Trip.findOne({
                where: {
                    driver_id: driverId,
                    status: 'in_progress'
                }
            });

            if (activeTrip) {
                // Update trip with driver location
                await activeTrip.update({
                    driver_latitude: latitude,
                    driver_longitude: longitude,
                    last_driver_update: new Date()
                });

                // Save to vehicle_locations table for history
                await VehicleLocation.create({
                    vehicle_id: activeTrip.vehicle_id,
                    trip_id: activeTrip.trip_id,
                    latitude: latitude,
                    longitude: longitude,
                    speed: 0, // You can add speed parameter if available
                    recorded_at: new Date()
                });

                // Emit location update to passengers via WebSocket
                const locationData = {
                    trip_id: activeTrip.trip_id,
                    driver_info: {
                        id: driver.driver_id,
                        name: `${driver.user.first_name} ${driver.user.last_name}`,
                        phone: driver.user.phone,
                        profile_picture: driver.user.profile_picture,
                        rating: driver.rating
                    },
                    location: {
                        latitude: latitude,
                        longitude: longitude,
                        timestamp: new Date()
                    }
                };

                // Emit to all passengers in this trip
                socketService.emitToTripPassengers(activeTrip.trip_id, 'driver_location_update', locationData);
            }

            return {
                success: true,
                driver_info: {
                    id: driver.driver_id,
                    name: `${driver.user.first_name} ${driver.user.last_name}`,
                    location: { latitude, longitude },
                    last_update: new Date()
                }
            };

        } catch (error) {
            console.error('Error updating driver location:', error);
            throw error;
        }
    }

    // Get real-time driver location for a trip
    static async getDriverLocationForTrip(tripId, userId) {
        try {
            const trip = await Trip.findByPk(tripId, {
                include: [
                    {
                        model: Driver,
                        as: 'driver',
                        include: [{
                            model: User,
                            as: 'user',
                            attributes: ['first_name', 'last_name', 'phone', 'profile_picture']
                        }]
                    }
                ]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            // Check if user has active booking for this trip
            const booking = await db.Booking.findOne({
                where: {
                    user_id: userId,
                    trip_id: tripId,
                    status: ['confirmed', 'in_progress']
                }
            });

            if (!booking) {
                throw new Error('You do not have an active booking for this trip');
            }

            const driverInfo = {
                id: trip.driver.driver_id,
                name: `${trip.driver.user.first_name} ${trip.driver.user.last_name}`,
                phone: trip.driver.user.phone,
                profile_picture: trip.driver.user.profile_picture,
                rating: trip.driver.rating,
                license_number: trip.driver.license_number,
                experience_years: trip.driver.experience_years
            };

            const locationInfo = {
                latitude: trip.driver_latitude || trip.driver.current_latitude,
                longitude: trip.driver_longitude || trip.driver.current_longitude,
                last_update: trip.last_driver_update || trip.driver.last_location_update,
                is_tracking_enabled: trip.driver.is_tracking_enabled
            };

            return {
                trip_id: tripId,
                driver_info: driverInfo,
                location: locationInfo,
                trip_status: trip.status
            };

        } catch (error) {
            console.error('Error getting driver location:', error);
            throw error;
        }
    }

    // Get location history for a trip
    static async getTripLocationHistory(tripId, userId) {
        try {
            // Verify user has access to this trip
            const booking = await db.Booking.findOne({
                where: {
                    user_id: userId,
                    trip_id: tripId
                }
            });

            if (!booking) {
                throw new Error('Access denied: No booking found for this trip');
            }

            const locationHistory = await VehicleLocation.findAll({
                where: { trip_id: tripId },
                order: [['recorded_at', 'ASC']],
                attributes: ['latitude', 'longitude', 'speed', 'recorded_at']
            });

            return locationHistory;

        } catch (error) {
            console.error('Error getting trip location history:', error);
            throw error;
        }
    }

    // Toggle driver tracking
    static async toggleDriverTracking(driverId, isEnabled) {
        try {
            const driver = await Driver.findByPk(driverId);

            if (!driver) {
                throw new Error('Driver not found');
            }

            await driver.update({
                is_tracking_enabled: isEnabled
            });

            return {
                success: true,
                message: `Location tracking ${isEnabled ? 'enabled' : 'disabled'}`,
                is_tracking_enabled: isEnabled
            };

        } catch (error) {
            console.error('Error toggling driver tracking:', error);
            throw error;
        }
    }

    // Get nearby drivers for on-demand requests
    static async getNearbyDrivers(latitude, longitude, radiusKm = 10) {
        try {
            // Use Haversine formula to find nearby drivers
            const query = `
        SELECT d.driver_id, d.rating, d.is_available, d.current_latitude, d.current_longitude,
               u.first_name, u.last_name, u.phone, u.profile_picture, v.vehicle_id, v.plate_number,
               (6371 * acos(cos(radians(?)) * cos(radians(d.current_latitude)) * 
               cos(radians(d.current_longitude) - radians(?)) + 
               sin(radians(?)) * sin(radians(d.current_latitude)))) AS distance
        FROM drivers d
        JOIN users u ON d.user_id = u.user_id
        LEFT JOIN vehicles v ON d.driver_id = v.driver_id
        WHERE d.is_available = 1 
        AND d.is_tracking_enabled = 1 
        AND d.current_latitude IS NOT NULL 
        AND d.current_longitude IS NOT NULL
        AND d.status = 'active'
        HAVING distance < ?
        ORDER BY distance ASC
        LIMIT 20
      `;

            const nearbyDrivers = await db.sequelize.query(query, {
                replacements: [latitude, longitude, latitude, radiusKm],
                type: db.Sequelize.QueryTypes.SELECT
            });

            return nearbyDrivers;

        } catch (error) {
            console.error('Error getting nearby drivers:', error);
            throw error;
        }
    }

    // Start trip tracking
    static async startTripTracking(tripId, driverId) {
        try {
            const trip = await Trip.findOne({
                where: {
                    trip_id: tripId,
                    driver_id: driverId
                }
            });

            if (!trip) {
                throw new Error('Trip not found or not assigned to this driver');
            }

            // Update trip status and enable tracking
            await trip.update({
                status: 'in_progress'
            });

            await Driver.update(
                { is_tracking_enabled: true },
                { where: { driver_id: driverId } }
            );

            // Notify passengers that trip has started
            socketService.emitToTripPassengers(tripId, 'trip_started', {
                trip_id: tripId,
                message: 'Your trip has started. You can now track your driver.',
                timestamp: new Date()
            });

            return {
                success: true,
                message: 'Trip tracking started',
                trip_id: tripId
            };

        } catch (error) {
            console.error('Error starting trip tracking:', error);
            throw error;
        }
    }

    // End trip tracking
    static async endTripTracking(tripId, driverId) {
        try {
            const trip = await Trip.findOne({
                where: {
                    trip_id: tripId,
                    driver_id: driverId
                }
            });

            if (!trip) {
                throw new Error('Trip not found or not assigned to this driver');
            }

            // Update trip status
            await trip.update({
                status: 'completed',
                end_time: new Date()
            });

            // Mark all seat bookings as completed
            await db.BookingSeat.update(
                { alighted_at: new Date() },
                {
                    where: {
                        trip_id: tripId,
                        alighted_at: null
                    }
                }
            );

            // Update bookings status
            await db.Booking.update(
                { status: 'completed' },
                {
                    where: {
                        trip_id: tripId,
                        status: ['confirmed', 'in_progress']
                    }
                }
            );

            // Notify passengers that trip has ended
            socketService.emitToTripPassengers(tripId, 'trip_completed', {
                trip_id: tripId,
                message: 'Your trip has been completed. Thank you for traveling with us!',
                timestamp: new Date()
            });

            return {
                success: true,
                message: 'Trip completed successfully',
                trip_id: tripId
            };

        } catch (error) {
            console.error('Error ending trip tracking:', error);
            throw error;
        }
    }
}

module.exports = LocationTrackingService;