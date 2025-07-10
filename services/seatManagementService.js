// services/seatManagementService.js
const db = require('../models');
const { Seat, BookingSeat, Trip, Vehicle, Booking, Stop } = db;
const { Op } = require('sequelize');

class SeatManagementService {

    // Get available seats for a trip
    static async getAvailableSeats(tripId, pickupStopId, dropoffStopId) {
        try {
            const trip = await Trip.findByPk(tripId, {
                include: [
                    {
                        model: Vehicle,
                        as: 'vehicle',
                        attributes: ['seat_capacity']
                    }
                ]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            // Get all seats for this vehicle
            const allSeats = await Seat.findAll({
                where: { vehicle_id: trip.vehicle_id },
                order: [['seat_number', 'ASC']]
            });

            // Get occupied seats for this trip segment
            const occupiedSeats = await this.getOccupiedSeatsForSegment(tripId, pickupStopId, dropoffStopId);
            const occupiedSeatIds = occupiedSeats.map(seat => seat.seat_id);

            // Filter available seats
            const availableSeats = allSeats.filter(seat => !occupiedSeatIds.includes(seat.seat_id));

            return {
                total_seats: trip.vehicle.seat_capacity,
                available_seats: availableSeats.length,
                occupied_seats: occupiedSeats.length,
                seats: allSeats.map(seat => ({
                    seat_id: seat.seat_id,
                    seat_number: seat.seat_number,
                    is_available: !occupiedSeatIds.includes(seat.seat_id),
                    is_occupied: occupiedSeatIds.includes(seat.seat_id)
                }))
            };

        } catch (error) {
            console.error('Error getting available seats:', error);
            throw error;
        }
    }

    // Get occupied seats for a specific route segment
    static async getOccupiedSeatsForSegment(tripId, pickupStopId, dropoffStopId) {
        try {
            // Get the stop order for this trip
            const tripStops = await db.TripStop.findAll({
                where: { trip_id: tripId },
                order: [['stop_order', 'ASC']]
            });

            const pickupOrder = tripStops.find(ts => ts.stop_id === pickupStopId)?.stop_order;
            const dropoffOrder = tripStops.find(ts => ts.stop_id === dropoffStopId)?.stop_order;

            if (!pickupOrder || !dropoffOrder) {
                throw new Error('Invalid pickup or dropoff stop for this trip');
            }

            // Find seats that are occupied during this segment
            const occupiedSeats = await BookingSeat.findAll({
                where: {
                    trip_id: tripId,
                    is_occupied: true
                },
                include: [
                    {
                        model: Booking,
                        as: 'booking',
                        include: [
                            {
                                model: Stop,
                                as: 'pickup_stop',
                                through: { attributes: [] }
                            },
                            {
                                model: Stop,
                                as: 'dropoff_stop',
                                through: { attributes: [] }
                            }
                        ]
                    },
                    {
                        model: Seat,
                        as: 'seat'
                    }
                ]
            });

            // Filter seats that conflict with the requested segment
            const conflictingSeats = occupiedSeats.filter(bookingSeat => {
                const booking = bookingSeat.booking;
                const bookingPickupOrder = tripStops.find(ts => ts.stop_id === booking.pickup_stop_id)?.stop_order;
                const bookingDropoffOrder = tripStops.find(ts => ts.stop_id === booking.dropoff_stop_id)?.stop_order;

                // Check if segments overlap
                return !(bookingDropoffOrder <= pickupOrder || bookingPickupOrder >= dropoffOrder);
            });

            return conflictingSeats;

        } catch (error) {
            console.error('Error getting occupied seats for segment:', error);
            throw error;
        }
    }

    // Reserve seats for a booking
    static async reserveSeats(bookingId, tripId, seatNumbers, passengerNames = []) {
        const transaction = await db.sequelize.transaction();

        try {
            const booking = await Booking.findByPk(bookingId);
            if (!booking) {
                throw new Error('Booking not found');
            }

            const trip = await Trip.findByPk(tripId, {
                include: [{ model: Vehicle, as: 'vehicle' }]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            // Validate seat numbers
            const seats = await Seat.findAll({
                where: {
                    vehicle_id: trip.vehicle_id,
                    seat_number: { [Op.in]: seatNumbers }
                }
            });

            if (seats.length !== seatNumbers.length) {
                throw new Error('Some seat numbers are invalid for this vehicle');
            }

            // Check if seats are available for this segment
            const occupiedSeats = await this.getOccupiedSeatsForSegment(
                tripId,
                booking.pickup_stop_id,
                booking.dropoff_stop_id
            );

            const occupiedSeatIds = occupiedSeats.map(seat => seat.seat_id);
            const requestedSeatIds = seats.map(seat => seat.seat_id);

            const conflictingSeats = requestedSeatIds.filter(seatId => occupiedSeatIds.includes(seatId));

            if (conflictingSeats.length > 0) {
                const conflictingSeatNumbers = seats
                    .filter(seat => conflictingSeats.includes(seat.seat_id))
                    .map(seat => seat.seat_number);
                throw new Error(`Seats ${conflictingSeatNumbers.join(', ')} are not available for this route segment`);
            }

            // Create booking seat records
            const bookingSeats = [];
            for (let i = 0; i < seats.length; i++) {
                const seat = seats[i];
                const passengerName = passengerNames[i] || `${booking.user.first_name} ${booking.user.last_name}`;

                const bookingSeat = await BookingSeat.create({
                    booking_id: bookingId,
                    seat_id: seat.seat_id,
                    trip_id: tripId,
                    passenger_name: passengerName,
                    is_occupied: true
                }, { transaction });

                bookingSeats.push(bookingSeat);
            }

            // Update booking with seat information
            await booking.update({
                seat_numbers: seatNumbers.join(',')
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                reserved_seats: seats.map(seat => ({
                    seat_id: seat.seat_id,
                    seat_number: seat.seat_number
                })),
                booking_id: bookingId
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error reserving seats:', error);
            throw error;
        }
    }

    // Release seats when passenger alights
    static async releaseSeat(tripId, seatId, driverId) {
        try {
            // Verify driver is assigned to this trip
            const trip = await Trip.findOne({
                where: {
                    trip_id: tripId,
                    driver_id: driverId
                }
            });

            if (!trip) {
                throw new Error('Trip not found or not assigned to this driver');
            }

            // Find the booking seat
            const bookingSeat = await BookingSeat.findOne({
                where: {
                    trip_id: tripId,
                    seat_id: seatId,
                    is_occupied: true,
                    alighted_at: null
                }
            });

            if (!bookingSeat) {
                throw new Error('Seat is not currently occupied or passenger has already alighted');
            }

            // Mark passenger as alighted
            await bookingSeat.update({
                alighted_at: new Date(),
                is_occupied: false
            });

            // The seat becomes available automatically via trigger
            return {
                success: true,
                message: 'Passenger marked as alighted, seat is now available',
                seat_id: seatId,
                alighted_at: new Date()
            };

        } catch (error) {
            console.error('Error releasing seat:', error);
            throw error;
        }
    }

    // Mark passenger as boarded
    static async markPassengerBoarded(tripId, seatId, driverId) {
        try {
            // Verify driver is assigned to this trip
            const trip = await Trip.findOne({
                where: {
                    trip_id: tripId,
                    driver_id: driverId
                }
            });

            if (!trip) {
                throw new Error('Trip not found or not assigned to this driver');
            }

            const bookingSeat = await BookingSeat.findOne({
                where: {
                    trip_id: tripId,
                    seat_id: seatId,
                    is_occupied: true,
                    boarded_at: null
                }
            });

            if (!bookingSeat) {
                throw new Error('Seat booking not found or passenger already boarded');
            }

            await bookingSeat.update({
                boarded_at: new Date()
            });

            return {
                success: true,
                message: 'Passenger marked as boarded',
                seat_id: seatId,
                boarded_at: new Date()
            };

        } catch (error) {
            console.error('Error marking passenger as boarded:', error);
            throw error;
        }
    }

    // Get seat occupancy for a trip (driver view)
    static async getTripSeatOccupancy(tripId, driverId) {
        try {
            // Verify driver access
            const trip = await Trip.findOne({
                where: {
                    trip_id: tripId,
                    driver_id: driverId
                },
                include: [
                    {
                        model: Vehicle,
                        as: 'vehicle',
                        attributes: ['seat_capacity', 'plate_number']
                    }
                ]
            });

            if (!trip) {
                throw new Error('Trip not found or not assigned to this driver');
            }

            // Get all seat bookings for this trip
            const seatBookings = await BookingSeat.findAll({
                where: { trip_id: tripId },
                include: [
                    {
                        model: Seat,
                        as: 'seat',
                        attributes: ['seat_number']
                    },
                    {
                        model: Booking,
                        as: 'booking',
                        include: [
                            {
                                model: db.User,
                                as: 'user',
                                attributes: ['first_name', 'last_name', 'phone']
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
                            }
                        ]
                    }
                ]
            });

            // Group by seat for easy viewing
            const seatMap = {};
            seatBookings.forEach(booking => {
                const seatNumber = booking.seat.seat_number;
                seatMap[seatNumber] = {
                    seat_id: booking.seat_id,
                    seat_number: seatNumber,
                    passenger_name: booking.passenger_name,
                    passenger_phone: booking.booking.user.phone,
                    pickup_stop: booking.booking.pickup_stop.stop_name,
                    dropoff_stop: booking.booking.dropoff_stop.stop_name,
                    is_boarded: !!booking.boarded_at,
                    has_alighted: !!booking.alighted_at,
                    boarded_at: booking.boarded_at,
                    alighted_at: booking.alighted_at
                };
            });

            return {
                trip_id: tripId,
                vehicle_info: {
                    plate_number: trip.vehicle.plate_number,
                    total_seats: trip.vehicle.seat_capacity
                },
                occupied_seats: Object.keys(seatMap).length,
                available_seats: trip.vehicle.seat_capacity - Object.keys(seatMap).length,
                seat_details: seatMap
            };

        } catch (error) {
            console.error('Error getting trip seat occupancy:', error);
            throw error;
        }
    }

    // Get passenger seat info for a booking
    static async getPassengerSeatInfo(bookingId, userId) {
        try {
            const booking = await Booking.findOne({
                where: {
                    booking_id: bookingId,
                    user_id: userId
                }
            });

            if (!booking) {
                throw new Error('Booking not found or access denied');
            }

            const seatBookings = await BookingSeat.findAll({
                where: { booking_id: bookingId },
                include: [
                    {
                        model: Seat,
                        as: 'seat',
                        attributes: ['seat_number']
                    }
                ]
            });

            return {
                booking_id: bookingId,
                seats: seatBookings.map(sb => ({
                    seat_id: sb.seat_id,
                    seat_number: sb.seat.seat_number,
                    passenger_name: sb.passenger_name,
                    is_boarded: !!sb.boarded_at,
                    has_alighted: !!sb.alighted_at,
                    boarded_at: sb.boarded_at,
                    alighted_at: sb.alighted_at
                }))
            };

        } catch (error) {
            console.error('Error getting passenger seat info:', error);
            throw error;
        }
    }

    // Initialize seats for a new vehicle
    static async initializeVehicleSeats(vehicleId, seatCapacity) {
        const transaction = await db.sequelize.transaction();

        try {
            // Create seats for the vehicle
            const seats = [];
            for (let i = 1; i <= seatCapacity; i++) {
                seats.push({
                    vehicle_id: vehicleId,
                    seat_number: `S${i.toString().padStart(2, '0')}`,
                    is_available: true
                });
            }

            await Seat.bulkCreate(seats, { transaction });
            await transaction.commit();

            return {
                success: true,
                message: `${seatCapacity} seats created for vehicle`,
                seats_created: seatCapacity
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error initializing vehicle seats:', error);
            throw error;
        }
    }

    // Update vehicle seat capacity
    static async updateVehicleSeatCapacity(vehicleId, newCapacity) {
        const transaction = await db.sequelize.transaction();

        try {
            const vehicle = await Vehicle.findByPk(vehicleId);
            if (!vehicle) {
                throw new Error('Vehicle not found');
            }

            const currentSeats = await Seat.count({ where: { vehicle_id: vehicleId } });

            if (newCapacity > currentSeats) {
                // Add new seats
                const seatsToAdd = [];
                for (let i = currentSeats + 1; i <= newCapacity; i++) {
                    seatsToAdd.push({
                        vehicle_id: vehicleId,
                        seat_number: `S${i.toString().padStart(2, '0')}`,
                        is_available: true
                    });
                }
                await Seat.bulkCreate(seatsToAdd, { transaction });
            } else if (newCapacity < currentSeats) {
                // Remove excess seats (only if not occupied)
                const seatsToRemove = await Seat.findAll({
                    where: { vehicle_id: vehicleId },
                    order: [['seat_number', 'DESC']],
                    limit: currentSeats - newCapacity
                });

                // Check if any of these seats are currently occupied
                const occupiedSeats = await BookingSeat.findAll({
                    where: {
                        seat_id: { [Op.in]: seatsToRemove.map(s => s.seat_id) },
                        is_occupied: true
                    }
                });

                if (occupiedSeats.length > 0) {
                    throw new Error('Cannot reduce seat capacity while some seats are occupied');
                }

                await Seat.destroy({
                    where: {
                        seat_id: { [Op.in]: seatsToRemove.map(s => s.seat_id) }
                    },
                    transaction
                });
            }

            // Update vehicle capacity
            await vehicle.update({ seat_capacity: newCapacity }, { transaction });
            await transaction.commit();

            return {
                success: true,
                message: `Vehicle seat capacity updated to ${newCapacity}`,
                old_capacity: currentSeats,
                new_capacity: newCapacity
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error updating vehicle seat capacity:', error);
            throw error;
        }
    }
}

module.exports = SeatManagementService;