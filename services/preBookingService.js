// services/preBookingService.js
const db = require('../models');
const { PreBooking, Booking, Trip, Route, Stop, User } = db;
const { Op } = require('sequelize');
const SeatManagementService = require('./seatManagementService');
const ReceiptService = require('./receiptService');

class PreBookingService {

    // Create pre-booking for up to 30 days in advance
    static async createPreBooking(preBookingData) {
        const transaction = await db.sequelize.transaction();

        try {
            const {
                user_id,
                route_id,
                pickup_stop_id,
                dropoff_stop_id,
                travel_dates, // Array of dates
                preferred_time,
                passenger_count = 1,
                seat_preferences = [] // Optional seat preferences
            } = preBookingData;

            // Validate travel dates (max 30 days in advance)
            const today = new Date();
            const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

            const invalidDates = travel_dates.filter(date => {
                const travelDate = new Date(date);
                return travelDate < today || travelDate > maxDate;
            });

            if (invalidDates.length > 0) {
                throw new Error('Travel dates must be between today and 30 days from now');
            }

            // Validate route and stops
            const route = await Route.findByPk(route_id);
            if (!route) {
                throw new Error('Route not found');
            }

            const [pickupStop, dropoffStop] = await Promise.all([
                Stop.findByPk(pickup_stop_id),
                Stop.findByPk(dropoff_stop_id)
            ]);

            if (!pickupStop || !dropoffStop) {
                throw new Error('Invalid pickup or dropoff stop');
            }

            // Calculate fare
            const fare = await this.calculateFare(route_id, pickup_stop_id, dropoff_stop_id, passenger_count);

            // Create pre-bookings for each date
            const preBookings = [];
            for (const travelDate of travel_dates) {
                const preBooking = await PreBooking.create({
                    user_id,
                    route_id,
                    pickup_stop_id,
                    dropoff_stop_id,
                    travel_date: travelDate,
                    preferred_time,
                    passenger_count,
                    fare_amount: fare.total_fare,
                    seat_numbers: seat_preferences.join(','),
                    status: 'active'
                }, { transaction });

                preBookings.push(preBooking);
            }

            await transaction.commit();

            return {
                success: true,
                message: `Pre-bookings created for ${travel_dates.length} dates`,
                pre_bookings: preBookings.map(pb => ({
                    pre_booking_id: pb.pre_booking_id,
                    travel_date: pb.travel_date,
                    fare_amount: pb.fare_amount,
                    status: pb.status
                })),
                total_amount: fare.total_fare * travel_dates.length,
                valid_until: maxDate
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error creating pre-booking:', error);
            throw error;
        }
    }

    // Convert pre-booking to actual booking when trip is available
    static async convertPreBookingToBooking(preBookingId, tripId) {
        const transaction = await db.sequelize.transaction();

        try {
            const preBooking = await PreBooking.findByPk(preBookingId, {
                include: [
                    {
                        model: User,
                        as: 'user'
                    }
                ]
            });

            if (!preBooking) {
                throw new Error('Pre-booking not found');
            }

            if (preBooking.status !== 'active') {
                throw new Error('Pre-booking is not active');
            }

            // Verify trip matches the pre-booking requirements
            const trip = await Trip.findByPk(tripId, {
                include: [
                    {
                        model: Route,
                        as: 'route'
                    },
                    {
                        model: db.Vehicle,
                        as: 'vehicle'
                    }
                ]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            if (trip.route_id !== preBooking.route_id) {
                throw new Error('Trip route does not match pre-booking route');
            }

            // Check if trip date matches pre-booking date
            const tripDate = new Date(trip.start_time).toDateString();
            const preBookingDate = new Date(preBooking.travel_date).toDateString();

            if (tripDate !== preBookingDate) {
                throw new Error('Trip date does not match pre-booking date');
            }

            // Check seat availability
            const availableSeats = await SeatManagementService.getAvailableSeats(
                tripId,
                preBooking.pickup_stop_id,
                preBooking.dropoff_stop_id
            );

            if (availableSeats.available_seats < preBooking.passenger_count) {
                throw new Error('Not enough seats available for this trip');
            }

            // Create actual booking
            const booking = await Booking.create({
                user_id: preBooking.user_id,
                trip_id: tripId,
                pickup_stop_id: preBooking.pickup_stop_id,
                dropoff_stop_id: preBooking.dropoff_stop_id,
                booking_time: new Date(),
                fare_amount: preBooking.fare_amount,
                passenger_count: preBooking.passenger_count,
                status: 'confirmed',
                payment_status: 'pending',
                booking_type: 'pre_booking',
                booking_date: preBooking.travel_date
            }, { transaction });

            // Handle seat assignment
            let seatNumbers = [];
            if (preBooking.seat_numbers) {
                // Try to assign preferred seats
                const preferredSeats = preBooking.seat_numbers.split(',');
                try {
                    await SeatManagementService.reserveSeats(
                        booking.booking_id,
                        tripId,
                        preferredSeats
                    );
                    seatNumbers = preferredSeats;
                } catch (seatError) {
                    // If preferred seats not available, auto-assign
                    seatNumbers = await this.autoAssignSeats(tripId, preBooking.passenger_count, booking.booking_id);
                }
            } else {
                // Auto-assign seats
                seatNumbers = await this.autoAssignSeats(tripId, preBooking.passenger_count, booking.booking_id);
            }

            // Update pre-booking status
            await preBooking.update({
                status: 'completed',
                booking_id: booking.booking_id,
                trip_id: tripId
            }, { transaction });

            await transaction.commit();

            // Generate receipt for the booking
            const receipt = await ReceiptService.generateBookingReceipt(booking.booking_id);

            return {
                success: true,
                message: 'Pre-booking successfully converted to booking',
                booking: {
                    booking_id: booking.booking_id,
                    trip_id: tripId,
                    seat_numbers: seatNumbers,
                    fare_amount: booking.fare_amount,
                    status: booking.status
                },
                receipt: receipt.receipt
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error converting pre-booking to booking:', error);
            throw error;
        }
    }

    // Auto-assign available seats
    static async autoAssignSeats(tripId, passengerCount, bookingId) {
        try {
            const availableSeats = await SeatManagementService.getAvailableSeats(tripId, null, null);

            if (availableSeats.available_seats < passengerCount) {
                throw new Error('Not enough seats available');
            }

            // Get the first available seats
            const seatsToAssign = availableSeats.seats
                .filter(seat => seat.is_available)
                .slice(0, passengerCount)
                .map(seat => seat.seat_number);

            await SeatManagementService.reserveSeats(bookingId, tripId, seatsToAssign);

            return seatsToAssign;

        } catch (error) {
            console.error('Error auto-assigning seats:', error);
            throw error;
        }
    }

    // Get user's pre-bookings
    static async getUserPreBookings(userId, status = null) {
        try {
            const whereCondition = { user_id: userId };
            if (status) {
                whereCondition.status = status;
            }

            const preBookings = await PreBooking.findAll({
                where: whereCondition,
                include: [
                    {
                        model: Route,
                        as: 'route',
                        attributes: ['route_name', 'route_number']
                    },
                    {
                        model: Stop,
                        as: 'pickup_stop',
                        attributes: ['stop_name']
                    },
                    {
                        model: Stop,
                        as: 'dropoff_stop',
                        attributes: ['stop_name']
                    },
                    {
                        model: Booking,
                        as: 'booking',
                        required: false,
                        attributes: ['booking_id', 'status', 'payment_status']
                    },
                    {
                        model: Trip,
                        as: 'trip',
                        required: false,
                        attributes: ['trip_id', 'start_time', 'status']
                    }
                ],
                order: [['travel_date', 'ASC']]
            });

            return preBookings.map(pb => ({
                pre_booking_id: pb.pre_booking_id,
                route_name: pb.route.route_name,
                pickup_stop: pb.pickup_stop.stop_name,
                dropoff_stop: pb.dropoff_stop.stop_name,
                travel_date: pb.travel_date,
                preferred_time: pb.preferred_time,
                passenger_count: pb.passenger_count,
                fare_amount: pb.fare_amount,
                status: pb.status,
                booking_info: pb.booking ? {
                    booking_id: pb.booking.booking_id,
                    status: pb.booking.status,
                    payment_status: pb.booking.payment_status
                } : null,
                trip_info: pb.trip ? {
                    trip_id: pb.trip.trip_id,
                    departure_time: pb.trip.start_time,
                    trip_status: pb.trip.status
                } : null,
                created_at: pb.created_at
            }));

        } catch (error) {
            console.error('Error getting user pre-bookings:', error);
            throw error;
        }
    }

    // Cancel pre-booking
    static async cancelPreBooking(preBookingId, userId) {
        const transaction = await db.sequelize.transaction();

        try {
            const preBooking = await PreBooking.findOne({
                where: {
                    pre_booking_id: preBookingId,
                    user_id: userId
                }
            });

            if (!preBooking) {
                throw new Error('Pre-booking not found or access denied');
            }

            if (preBooking.status === 'cancelled') {
                throw new Error('Pre-booking is already cancelled');
            }

            if (preBooking.status === 'completed') {
                throw new Error('Cannot cancel pre-booking that has been converted to booking');
            }

            // Update status
            await preBooking.update({
                status: 'cancelled'
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                message: 'Pre-booking cancelled successfully',
                pre_booking_id: preBookingId
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error cancelling pre-booking:', error);
            throw error;
        }
    }

    // Check for available trips for pre-bookings
    static async checkTripsForPreBookings() {
        try {
            // Get all active pre-bookings for today and tomorrow
            const today = new Date();
            const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

            const activePreBookings = await PreBooking.findAll({
                where: {
                    status: 'active',
                    travel_date: {
                        [Op.between]: [today, tomorrow]
                    }
                },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['first_name', 'last_name', 'phone', 'email']
                    }
                ]
            });

            const conversions = [];

            for (const preBooking of activePreBookings) {
                // Find matching trips
                const matchingTrips = await Trip.findAll({
                    where: {
                        route_id: preBooking.route_id,
                        status: 'scheduled',
                        start_time: {
                            [Op.between]: [
                                new Date(preBooking.travel_date),
                                new Date(preBooking.travel_date.getTime() + 24 * 60 * 60 * 1000)
                            ]
                        }
                    }
                });

                for (const trip of matchingTrips) {
                    try {
                        // Check if preferred time matches (within 2 hours)
                        if (preBooking.preferred_time) {
                            const tripTime = new Date(trip.start_time);
                            const preferredDateTime = new Date(preBooking.travel_date);
                            const [hours, minutes] = preBooking.preferred_time.split(':');
                            preferredDateTime.setHours(parseInt(hours), parseInt(minutes));

                            const timeDiff = Math.abs(tripTime - preferredDateTime) / (1000 * 60); // minutes
                            if (timeDiff > 120) { // More than 2 hours difference
                                continue;
                            }
                        }

                        // Try to convert
                        const result = await this.convertPreBookingToBooking(preBooking.pre_booking_id, trip.trip_id);
                        conversions.push({
                            pre_booking_id: preBooking.pre_booking_id,
                            trip_id: trip.trip_id,
                            user: preBooking.user,
                            result: result
                        });

                        // Send notification to user
                        // await notificationService.sendPreBookingConfirmation(preBooking.user, result);

                        break; // Break after successful conversion
                    } catch (error) {
                        console.log(`Failed to convert pre-booking ${preBooking.pre_booking_id} to trip ${trip.trip_id}:`, error.message);
                        continue;
                    }
                }
            }

            return {
                processed: activePreBookings.length,
                converted: conversions.length,
                conversions: conversions
            };

        } catch (error) {
            console.error('Error checking trips for pre-bookings:', error);
            throw error;
        }
    }

    // Calculate fare for pre-booking
    static async calculateFare(routeId, pickupStopId, dropoffStopId, passengerCount) {
        try {
            // Get fare information from fares table
            const fare = await db.Fare.findOne({
                where: {
                    route_id: routeId,
                    from_stop_id: pickupStopId,
                    to_stop_id: dropoffStopId
                }
            });

            if (fare) {
                return {
                    base_fare: fare.fare_amount,
                    total_fare: fare.fare_amount * passengerCount,
                    per_passenger: fare.fare_amount
                };
            }

            // Fallback: calculate based on distance
            const fareCalculator = await db.FareCalculator.findOne({
                where: {
                    fare_type: 'regular',
                    is_active: true,
                    effective_from: { [Op.lte]: new Date() },
                    [Op.or]: [
                        { effective_to: null },
                        { effective_to: { [Op.gte]: new Date() } }
                    ]
                }
            });

            if (!fareCalculator) {
                throw new Error('Fare calculator not configured');
            }

            // Use base fare if no specific fare found
            const baseFare = fareCalculator.base_fare;
            const totalFare = baseFare * passengerCount;

            return {
                base_fare: baseFare,
                total_fare: totalFare,
                per_passenger: baseFare
            };

        } catch (error) {
            console.error('Error calculating fare:', error);
            throw error;
        }
    }

    // Expire old pre-bookings
    static async expireOldPreBookings() {
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const expiredCount = await PreBooking.update(
                { status: 'expired' },
                {
                    where: {
                        status: 'active',
                        travel_date: { [Op.lt]: yesterday }
                    }
                }
            );

            return {
                expired_count: expiredCount[0]
            };

        } catch (error) {
            console.error('Error expiring old pre-bookings:', error);
            throw error;
        }
    }

    // Get pre-booking statistics
    static async getPreBookingStats(userId = null) {
        try {
            const whereCondition = userId ? { user_id: userId } : {};

            const stats = await PreBooking.findAll({
                where: whereCondition,
                attributes: [
                    'status',
                    [db.sequelize.fn('COUNT', db.sequelize.col('pre_booking_id')), 'count'],
                    [db.sequelize.fn('SUM', db.sequelize.col('fare_amount')), 'total_amount']
                ],
                group: ['status'],
                raw: true
            });

            const result = {
                total_pre_bookings: 0,
                total_amount: 0,
                by_status: {}
            };

            stats.forEach(stat => {
                result.total_pre_bookings += parseInt(stat.count);
                result.total_amount += parseFloat(stat.total_amount || 0);
                result.by_status[stat.status] = {
                    count: parseInt(stat.count),
                    amount: parseFloat(stat.total_amount || 0)
                };
            });

            return result;

        } catch (error) {
            console.error('Error getting pre-booking stats:', error);
            throw error;
        }
    }

    // Modify pre-booking (before conversion)
    static async modifyPreBooking(preBookingId, userId, modifications) {
        const transaction = await db.sequelize.transaction();

        try {
            const preBooking = await PreBooking.findOne({
                where: {
                    pre_booking_id: preBookingId,
                    user_id: userId,
                    status: 'active'
                }
            });

            if (!preBooking) {
                throw new Error('Pre-booking not found or cannot be modified');
            }

            // Check if travel date is at least 24 hours away
            const now = new Date();
            const travelDate = new Date(preBooking.travel_date);
            const hoursUntilTravel = (travelDate - now) / (1000 * 60 * 60);

            if (hoursUntilTravel < 24) {
                throw new Error('Cannot modify pre-booking less than 24 hours before travel date');
            }

            const allowedModifications = ['preferred_time', 'passenger_count', 'seat_numbers'];
            const updateData = {};

            for (const [key, value] of Object.entries(modifications)) {
                if (allowedModifications.includes(key)) {
                    updateData[key] = value;
                }
            }

            // Recalculate fare if passenger count changed
            if (updateData.passenger_count && updateData.passenger_count !== preBooking.passenger_count) {
                const fare = await this.calculateFare(
                    preBooking.route_id,
                    preBooking.pickup_stop_id,
                    preBooking.dropoff_stop_id,
                    updateData.passenger_count
                );
                updateData.fare_amount = fare.total_fare;
            }

            await preBooking.update(updateData, { transaction });
            await transaction.commit();

            return {
                success: true,
                message: 'Pre-booking modified successfully',
                updated_fields: Object.keys(updateData),
                pre_booking: {
                    pre_booking_id: preBooking.pre_booking_id,
                    ...updateData,
                    travel_date: preBooking.travel_date
                }
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error modifying pre-booking:', error);
            throw error;
        }
    }

    // Get available dates for pre-booking on a route
    static async getAvailableDatesForRoute(routeId, pickupStopId, dropoffStopId) {
        try {
            const today = new Date();
            const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

            // Get existing trips for the route
            const existingTrips = await Trip.findAll({
                where: {
                    route_id: routeId,
                    start_time: {
                        [Op.between]: [today, maxDate]
                    },
                    status: ['scheduled', 'in_progress']
                },
                attributes: ['trip_id', 'start_time', 'vehicle_id'],
                include: [
                    {
                        model: db.Vehicle,
                        as: 'vehicle',
                        attributes: ['seat_capacity']
                    }
                ]
            });

            // Get pre-bookings for the same route and segment
            const existingPreBookings = await PreBooking.findAll({
                where: {
                    route_id: routeId,
                    pickup_stop_id: pickupStopId,
                    dropoff_stop_id: dropoffStopId,
                    travel_date: {
                        [Op.between]: [today, maxDate]
                    },
                    status: ['active', 'completed']
                },
                attributes: ['travel_date', 'passenger_count']
            });

            // Generate available dates
            const availableDates = [];

            for (let d = new Date(today); d <= maxDate; d.setDate(d.getDate() + 1)) {
                const dateString = d.toISOString().split('T')[0];

                // Check if there are trips on this date
                const tripsOnDate = existingTrips.filter(trip => {
                    const tripDate = new Date(trip.start_time).toISOString().split('T')[0];
                    return tripDate === dateString;
                });

                // Check pre-booking demand for this date
                const preBookingsOnDate = existingPreBookings.filter(pb => {
                    const pbDate = new Date(pb.travel_date).toISOString().split('T')[0];
                    return pbDate === dateString;
                });

                const totalPreBookedPassengers = preBookingsOnDate.reduce((sum, pb) => sum + pb.passenger_count, 0);
                const maxCapacity = tripsOnDate.reduce((sum, trip) => sum + trip.vehicle.seat_capacity, 0);

                availableDates.push({
                    date: dateString,
                    trips_scheduled: tripsOnDate.length,
                    total_capacity: maxCapacity,
                    pre_booked_passengers: totalPreBookedPassengers,
                    available_capacity: maxCapacity - totalPreBookedPassengers,
                    is_available: maxCapacity > totalPreBookedPassengers || maxCapacity === 0,
                    trip_times: tripsOnDate.map(trip => ({
                        trip_id: trip.trip_id,
                        departure_time: trip.start_time,
                        capacity: trip.vehicle.seat_capacity
                    }))
                });
            }

            return {
                route_id: routeId,
                pickup_stop_id: pickupStopId,
                dropoff_stop_id: dropoffStopId,
                date_range: {
                    from: today.toISOString().split('T')[0],
                    to: maxDate.toISOString().split('T')[0]
                },
                available_dates: availableDates
            };

        } catch (error) {
            console.error('Error getting available dates for route:', error);
            throw error;
        }
    }

    // Bulk create pre-bookings for recurring trips (e.g., daily commute)
    static async createRecurringPreBooking(recurringData) {
        const transaction = await db.sequelize.transaction();

        try {
            const {
                user_id,
                route_id,
                pickup_stop_id,
                dropoff_stop_id,
                start_date,
                end_date,
                days_of_week, // Array like [1, 2, 3, 4, 5] for Mon-Fri
                preferred_time,
                passenger_count = 1,
                seat_preferences = []
            } = recurringData;

            // Validate date range
            const today = new Date();
            const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

            if (new Date(start_date) < today || new Date(end_date) > maxDate) {
                throw new Error('Date range must be within the next 30 days');
            }

            // Generate dates based on days of week
            const travelDates = [];
            const currentDate = new Date(start_date);
            const endDateObj = new Date(end_date);

            while (currentDate <= endDateObj) {
                const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
                if (days_of_week.includes(dayOfWeek)) {
                    travelDates.push(new Date(currentDate));
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }

            if (travelDates.length === 0) {
                throw new Error('No valid travel dates found for the specified days of week');
            }

            // Calculate fare
            const fare = await this.calculateFare(route_id, pickup_stop_id, dropoff_stop_id, passenger_count);

            // Create pre-bookings
            const preBookings = [];
            for (const travelDate of travelDates) {
                const preBooking = await PreBooking.create({
                    user_id,
                    route_id,
                    pickup_stop_id,
                    dropoff_stop_id,
                    travel_date: travelDate,
                    preferred_time,
                    passenger_count,
                    fare_amount: fare.total_fare,
                    seat_numbers: seat_preferences.join(','),
                    status: 'active'
                }, { transaction });

                preBookings.push(preBooking);
            }

            await transaction.commit();

            return {
                success: true,
                message: `Recurring pre-bookings created for ${travelDates.length} dates`,
                pre_bookings: preBookings.map(pb => ({
                    pre_booking_id: pb.pre_booking_id,
                    travel_date: pb.travel_date,
                    fare_amount: pb.fare_amount
                })),
                total_amount: fare.total_fare * travelDates.length,
                travel_dates: travelDates
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error creating recurring pre-booking:', error);
            throw error;
        }
    }
}

module.exports = PreBookingService;