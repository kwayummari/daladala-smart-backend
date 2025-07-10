// services/onDemandService.js
const db = require('../models');
const { OnDemandRequest, OnDemandParticipant, User, Driver, Vehicle, Trip } = db;
const { Op } = require('sequelize');
const socketService = require('./socketService');
const LocationTrackingService = require('./locationTrackingService');

class OnDemandService {

    // Create new on-demand request
    static async createOnDemandRequest(requestData) {
        const transaction = await db.sequelize.transaction();

        try {
            const {
                user_id,
                pickup_location,
                pickup_latitude,
                pickup_longitude,
                destination_location,
                destination_latitude,
                destination_longitude,
                passenger_count = 1,
                minimum_passengers = 10
            } = requestData;

            // Calculate distance and fare
            const distance = this.calculateDistance(
                pickup_latitude, pickup_longitude,
                destination_latitude, destination_longitude
            );

            // Get on-demand fare calculation
            const fareCalculator = await db.FareCalculator.findOne({
                where: {
                    fare_type: 'on_demand',
                    is_active: true,
                    effective_from: { [Op.lte]: new Date() },
                    [Op.or]: [
                        { effective_to: null },
                        { effective_to: { [Op.gte]: new Date() } }
                    ]
                }
            });

            if (!fareCalculator) {
                throw new Error('On-demand fare calculator not configured');
            }

            // Calculate fare: (normal charges * 2) + distance price
            const baseFare = fareCalculator.base_fare * fareCalculator.multiplier;
            const distanceFare = distance * fareCalculator.price_per_km;
            const estimatedFare = baseFare + distanceFare;
            const farePerPerson = Math.max(estimatedFare / minimum_passengers, fareCalculator.minimum_fare);

            // Set expiration time (2 hours from now)
            const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

            // Create on-demand request
            const request = await OnDemandRequest.create({
                requested_by: user_id,
                pickup_location,
                pickup_latitude,
                pickup_longitude,
                destination_location,
                destination_latitude,
                destination_longitude,
                passenger_count,
                estimated_fare: farePerPerson,
                distance_km: distance,
                minimum_passengers,
                current_passengers: passenger_count,
                expires_at: expiresAt,
                status: 'pending'
            }, { transaction });

            // Add requester as first participant
            await OnDemandParticipant.create({
                request_id: request.request_id,
                user_id: user_id,
                passenger_count,
                fare_amount: farePerPerson * passenger_count,
                status: 'joined'
            }, { transaction });

            await transaction.commit();

            // Notify nearby users about the on-demand request
            await this.notifyNearbyUsers(request);

            return {
                success: true,
                request_id: request.request_id,
                estimated_fare_per_person: farePerPerson,
                total_fare: farePerPerson * passenger_count,
                minimum_passengers: minimum_passengers,
                current_passengers: passenger_count,
                expires_at: expiresAt,
                distance_km: distance
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error creating on-demand request:', error);
            throw error;
        }
    }

    // Join existing on-demand request
    static async joinOnDemandRequest(requestId, userId, passengerCount = 1) {
        const transaction = await db.sequelize.transaction();

        try {
            const request = await OnDemandRequest.findByPk(requestId, {
                include: [
                    {
                        model: OnDemandParticipant,
                        as: 'participants'
                    }
                ]
            });

            if (!request) {
                throw new Error('On-demand request not found');
            }

            if (request.status !== 'pending' && request.status !== 'collecting_passengers') {
                throw new Error('This request is no longer accepting participants');
            }

            if (new Date() > request.expires_at) {
                throw new Error('This request has expired');
            }

            // Check if user already joined
            const existingParticipant = await OnDemandParticipant.findOne({
                where: {
                    request_id: requestId,
                    user_id: userId
                }
            });

            if (existingParticipant) {
                throw new Error('You have already joined this request');
            }

            // Check capacity
            const totalPassengers = request.current_passengers + passengerCount;
            if (totalPassengers > 30) { // Assuming max vehicle capacity
                throw new Error('Request would exceed vehicle capacity');
            }

            // Add participant
            await OnDemandParticipant.create({
                request_id: requestId,
                user_id: userId,
                passenger_count: passengerCount,
                fare_amount: request.estimated_fare * passengerCount,
                status: 'joined'
            }, { transaction });

            // Update request
            await request.update({
                current_passengers: totalPassengers,
                status: totalPassengers >= request.minimum_passengers ? 'collecting_passengers' : 'pending'
            }, { transaction });

            await transaction.commit();

            // If minimum passengers reached, start looking for driver
            if (totalPassengers >= request.minimum_passengers) {
                await this.findDriverForRequest(requestId);
            }

            // Notify all participants
            await this.notifyParticipants(requestId, 'participant_joined', {
                current_passengers: totalPassengers,
                minimum_reached: totalPassengers >= request.minimum_passengers
            });

            return {
                success: true,
                message: 'Successfully joined on-demand request',
                current_passengers: totalPassengers,
                minimum_passengers: request.minimum_passengers,
                status: totalPassengers >= request.minimum_passengers ? 'collecting_passengers' : 'pending'
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error joining on-demand request:', error);
            throw error;
        }
    }

    // Find driver for on-demand request
    static async findDriverForRequest(requestId) {
        try {
            const request = await OnDemandRequest.findByPk(requestId);
            if (!request) {
                throw new Error('Request not found');
            }

            // Find nearby available drivers
            const nearbyDrivers = await LocationTrackingService.getNearbyDrivers(
                request.pickup_latitude,
                request.pickup_longitude,
                15 // 15km radius
            );

            if (nearbyDrivers.length === 0) {
                // No drivers available, notify participants
                await this.notifyParticipants(requestId, 'no_drivers_available', {
                    message: 'No drivers available at the moment. We will keep looking.'
                });
                return;
            }

            // For now, assign to closest available driver
            const selectedDriver = nearbyDrivers[0];

            // Create a special trip for this on-demand request
            const trip = await Trip.create({
                driver_id: selectedDriver.driver_id,
                vehicle_id: selectedDriver.vehicle_id,
                start_time: new Date(),
                status: 'scheduled',
                trip_type: 'on_demand'
            });

            // Update request with driver and trip info
            await request.update({
                driver_id: selectedDriver.driver_id,
                vehicle_id: selectedDriver.vehicle_id,
                trip_id: trip.trip_id,
                status: 'driver_assigned'
            });

            // Mark driver as unavailable
            await Driver.update(
                { is_available: false },
                { where: { driver_id: selectedDriver.driver_id } }
            );

            // Notify all participants about driver assignment
            await this.notifyParticipants(requestId, 'driver_assigned', {
                driver_info: {
                    name: `${selectedDriver.first_name} ${selectedDriver.last_name}`,
                    phone: selectedDriver.phone,
                    rating: selectedDriver.rating,
                    vehicle_plate: selectedDriver.plate_number
                },
                estimated_arrival: '10-15 minutes' // You can calculate this based on distance
            });

            return {
                success: true,
                driver_assigned: true,
                driver_info: {
                    name: `${selectedDriver.first_name} ${selectedDriver.last_name}`,
                    phone: selectedDriver.phone,
                    rating: selectedDriver.rating
                }
            };

        } catch (error) {
            console.error('Error finding driver for request:', error);
            throw error;
        }
    }

    // Get active on-demand requests near user location
    static async getNearbyOnDemandRequests(userLatitude, userLongitude, radiusKm = 5) {
        try {
            // Use Haversine formula to find nearby requests
            const query = `
        SELECT odr.*, u.first_name, u.last_name,
               (6371 * acos(cos(radians(?)) * cos(radians(odr.pickup_latitude)) * 
               cos(radians(odr.pickup_longitude) - radians(?)) + 
               sin(radians(?)) * sin(radians(odr.pickup_latitude)))) AS distance
        FROM on_demand_requests odr
        JOIN users u ON odr.requested_by = u.user_id
        WHERE odr.status IN ('pending', 'collecting_passengers')
        AND odr.expires_at > NOW()
        HAVING distance < ?
        ORDER BY distance ASC
        LIMIT 10
      `;

            const nearbyRequests = await db.sequelize.query(query, {
                replacements: [userLatitude, userLongitude, userLatitude, radiusKm],
                type: db.Sequelize.QueryTypes.SELECT
            });

            // Get participant counts for each request
            const requestsWithDetails = await Promise.all(
                nearbyRequests.map(async (request) => {
                    const participants = await OnDemandParticipant.findAll({
                        where: { request_id: request.request_id },
                        include: [
                            {
                                model: User,
                                as: 'user',
                                attributes: ['first_name', 'last_name']
                            }
                        ]
                    });

                    return {
                        ...request,
                        participants: participants.map(p => ({
                            name: `${p.user.first_name} ${p.user.last_name}`,
                            passenger_count: p.passenger_count
                        })),
                        spots_remaining: request.minimum_passengers - request.current_passengers,
                        can_join: request.current_passengers < 30 // max capacity
                    };
                })
            );

            return requestsWithDetails;

        } catch (error) {
            console.error('Error getting nearby on-demand requests:', error);
            throw error;
        }
    }

    // Cancel on-demand request
    static async cancelOnDemandRequest(requestId, userId) {
        const transaction = await db.sequelize.transaction();

        try {
            const request = await OnDemandRequest.findByPk(requestId);

            if (!request) {
                throw new Error('Request not found');
            }

            if (request.requested_by !== userId) {
                throw new Error('Only the request creator can cancel the request');
            }

            if (request.status === 'in_progress') {
                throw new Error('Cannot cancel request that is already in progress');
            }

            // Update request status
            await request.update({ status: 'cancelled' }, { transaction });

            // Cancel all participant bookings
            await OnDemandParticipant.update(
                { status: 'cancelled' },
                {
                    where: { request_id: requestId },
                    transaction
                }
            );

            // If driver was assigned, make them available again
            if (request.driver_id) {
                await Driver.update(
                    { is_available: true },
                    {
                        where: { driver_id: request.driver_id },
                        transaction
                    }
                );

                // Cancel the trip
                if (request.trip_id) {
                    await Trip.update(
                        { status: 'cancelled' },
                        {
                            where: { trip_id: request.trip_id },
                            transaction
                        }
                    );
                }
            }

            await transaction.commit();

            // Notify all participants
            await this.notifyParticipants(requestId, 'request_cancelled', {
                message: 'The on-demand request has been cancelled by the organizer'
            });

            return {
                success: true,
                message: 'On-demand request cancelled successfully'
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error cancelling on-demand request:', error);
            throw error;
        }
    }

    // Leave on-demand request
    static async leaveOnDemandRequest(requestId, userId) {
        const transaction = await db.sequelize.transaction();

        try {
            const participant = await OnDemandParticipant.findOne({
                where: {
                    request_id: requestId,
                    user_id: userId,
                    status: 'joined'
                }
            });

            if (!participant) {
                throw new Error('You are not a participant in this request');
            }

            const request = await OnDemandRequest.findByPk(requestId);

            if (request.status === 'in_progress') {
                throw new Error('Cannot leave request that is already in progress');
            }

            // Update participant status
            await participant.update({ status: 'cancelled' }, { transaction });

            // Update request passenger count
            const newPassengerCount = request.current_passengers - participant.passenger_count;
            await request.update({
                current_passengers: newPassengerCount,
                status: newPassengerCount < request.minimum_passengers ? 'pending' : request.status
            }, { transaction });

            // If this was the organizer and there are other participants, transfer ownership
            if (request.requested_by === userId && newPassengerCount > 0) {
                const remainingParticipants = await OnDemandParticipant.findAll({
                    where: {
                        request_id: requestId,
                        status: 'joined'
                    }
                });

                if (remainingParticipants.length > 0) {
                    await request.update({
                        requested_by: remainingParticipants[0].user_id
                    }, { transaction });
                }
            }

            // If no participants left, cancel the request
            if (newPassengerCount === 0) {
                await request.update({ status: 'cancelled' }, { transaction });
            }

            await transaction.commit();

            // Notify remaining participants
            if (newPassengerCount > 0) {
                await this.notifyParticipants(requestId, 'participant_left', {
                    current_passengers: newPassengerCount,
                    minimum_passengers: request.minimum_passengers
                });
            }

            return {
                success: true,
                message: 'Successfully left the on-demand request'
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error leaving on-demand request:', error);
            throw error;
        }
    }

    // Helper method to calculate distance between two points
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    // Notify participants about request updates
    static async notifyParticipants(requestId, eventType, data) {
        try {
            const participants = await OnDemandParticipant.findAll({
                where: {
                    request_id: requestId,
                    status: 'joined'
                },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['user_id']
                    }
                ]
            });

            participants.forEach(participant => {
                socketService.emitToUser(participant.user.user_id, eventType, {
                    request_id: requestId,
                    ...data
                });
            });

        } catch (error) {
            console.error('Error notifying participants:', error);
        }
    }

    // Notify nearby users about new on-demand request
    static async notifyNearbyUsers(request) {
        try {
            // This would typically involve finding users within a certain radius
            // and sending them push notifications about the new on-demand request
            // For now, we'll just emit to all connected users via WebSocket

            socketService.broadcast('new_on_demand_request', {
                request_id: request.request_id,
                pickup_location: request.pickup_location,
                destination_location: request.destination_location,
                estimated_fare: request.estimated_fare,
                current_passengers: request.current_passengers,
                minimum_passengers: request.minimum_passengers
            });

        } catch (error) {
            console.error('Error notifying nearby users:', error);
        }
    }
}

module.exports = OnDemandService;