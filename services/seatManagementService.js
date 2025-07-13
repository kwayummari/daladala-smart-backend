// services/seatManagementService.js
const db = require('../models');
const { Seat, BookingSeat, Trip, Vehicle, Booking, Stop } = db;
const { Op } = require('sequelize');

class SeatManagementService {

    // Get available seats for a trip
    static async getAvailableSeats(tripId, pickupStopId, dropoffStopId) {
        try {
            const trip = await db.Trip.findByPk(tripId, {
                include: [{ model: db.Vehicle, as: 'vehicle' }]
            });

            if (!trip || !trip.vehicle) {
                throw new Error('Trip or vehicle not found');
            }

            const totalSeats = trip.vehicle.seat_capacity || 30;

            // Get all bookings for this trip
            const bookings = await db.Booking.findAll({
                where: {
                    trip_id: tripId,
                    status: { [Op.in]: ['confirmed', 'in_progress'] }
                },
                include: [
                    {
                        model: db.Stop,
                        as: 'pickupStop',
                        include: [{ model: db.RouteStop, as: 'routeStops' }]
                    },
                    {
                        model: db.Stop,
                        as: 'dropoffStop',
                        include: [{ model: db.RouteStop, as: 'routeStops' }]
                    }
                ]
            });

            // If no pickup/dropoff specified, return overall availability
            if (!pickupStopId || !dropoffStopId) {
                const totalBookedPassengers = bookings.reduce((sum, booking) => sum + booking.passenger_count, 0);
                return {
                    total_seats: totalSeats,
                    available_seats: Math.max(0, totalSeats - totalBookedPassengers),
                    occupied_seats: totalBookedPassengers,
                    seats: this.generateSeatMap(totalSeats, [])
                };
            }

            // Get route stop orders for segment calculation
            const [pickupRouteStop, dropoffRouteStop] = await Promise.all([
                db.RouteStop.findOne({
                    where: { route_id: trip.route_id, stop_id: pickupStopId }
                }),
                db.RouteStop.findOne({
                    where: { route_id: trip.route_id, stop_id: dropoffStopId }
                })
            ]);

            if (!pickupRouteStop || !dropoffRouteStop) {
                throw new Error('Invalid pickup or dropoff stop for this route');
            }

            // Find conflicting bookings (overlapping segments)
            const conflictingBookings = bookings.filter(booking => {
                const bookingPickupOrder = booking.pickupStop?.routeStops?.[0]?.stop_order;
                const bookingDropoffOrder = booking.dropoffStop?.routeStops?.[0]?.stop_order;

                if (!bookingPickupOrder || !bookingDropoffOrder) return false;

                // Check if segments overlap
                return !(bookingDropoffOrder <= pickupRouteStop.stop_order ||
                    bookingPickupOrder >= dropoffRouteStop.stop_order);
            });

            const occupiedPassengers = conflictingBookings.reduce((sum, booking) => sum + booking.passenger_count, 0);
            const occupiedSeatNumbers = conflictingBookings
                .filter(booking => booking.seat_numbers)
                .flatMap(booking => booking.seat_numbers.split(','));

            return {
                total_seats: totalSeats,
                available_seats: Math.max(0, totalSeats - occupiedPassengers),
                occupied_seats: occupiedPassengers,
                seats: this.generateSeatMap(totalSeats, occupiedSeatNumbers)
            };

        } catch (error) {
            console.error('Error getting available seats:', error);
            throw error;
        }
    }

    static generateSeatMap(totalSeats, occupiedSeatNumbers) {
        const seats = [];

        for (let i = 1; i <= totalSeats; i++) {
            const seatNumber = `S${i.toString().padStart(2, '0')}`;
            seats.push({
                seat_number: seatNumber,
                seat_position: i,
                is_available: !occupiedSeatNumbers.includes(seatNumber),
                row: Math.ceil(i / 4),
                column: ((i - 1) % 4) + 1
            });
        }

        return seats;
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
    static async reserveSeats(bookingId, seatNumbers) {
        const transaction = await db.sequelize.transaction();

        try {
            const booking = await db.Booking.findByPk(bookingId, { transaction });
            if (!booking) {
                throw new Error('Booking not found');
            }

            // Validate seat count matches passenger count
            if (seatNumbers.length !== booking.passenger_count) {
                throw new Error(`Must select exactly ${booking.passenger_count} seats`);
            }

            // Check seat availability for this trip segment
            const availableSeats = await this.getAvailableSeats(
                booking.trip_id,
                booking.pickup_stop_id,
                booking.dropoff_stop_id
            );

            const unavailableSeats = seatNumbers.filter(seatNumber => {
                const seat = availableSeats.seats.find(s => s.seat_number === seatNumber);
                return !seat || !seat.is_available;
            });

            if (unavailableSeats.length > 0) {
                throw new Error(`Seats not available: ${unavailableSeats.join(', ')}`);
            }

            // Update booking with seat numbers
            await booking.update({
                seat_numbers: seatNumbers.join(',')
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                booking_id: bookingId,
                reserved_seats: seatNumbers,
                message: 'Seats reserved successfully'
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error reserving seats:', error);
            throw error;
        }
      }

    // Release seats when passenger alights
    static async releaseSeat(tripId, seatNumber, driverId) {
        try {
            // Verify driver is assigned to this trip
            const trip = await db.Trip.findOne({
                where: {
                    trip_id: tripId,
                    driver_id: driverId
                }
            });

            if (!trip) {
                throw new Error('Trip not found or not assigned to this driver');
            }

            // Find booking with this seat
            const booking = await db.Booking.findOne({
                where: {
                    trip_id: tripId,
                    seat_numbers: { [Op.like]: `%${seatNumber}%` },
                    status: 'in_progress'
                }
            });

            if (!booking) {
                throw new Error('No active booking found for this seat');
            }

            // Remove seat from booking (mark as alighted)
            const currentSeats = booking.seat_numbers ? booking.seat_numbers.split(',') : [];
            const updatedSeats = currentSeats.filter(seat => seat !== seatNumber);

            await booking.update({
                seat_numbers: updatedSeats.join(','),
                alighted_seats: booking.alighted_seats
                    ? `${booking.alighted_seats},${seatNumber}`
                    : seatNumber
            });

            return {
                success: true,
                message: 'Seat released successfully',
                released_seat: seatNumber,
                booking_id: booking.booking_id
            };

        } catch (error) {
            console.error('Error releasing seat:', error);
            throw error;
        }
    }
    
    static async autoAssignSeats(tripId, pickupStopId, dropoffStopId, passengerCount) {
        try {
            const availableSeats = await this.getAvailableSeats(tripId, pickupStopId, dropoffStopId);

            if (availableSeats.available_seats < passengerCount) {
                throw new Error('Not enough seats available');
            }

            // Get the first available seats
            const seatsToAssign = availableSeats.seats
                .filter(seat => seat.is_available)
                .slice(0, passengerCount)
                .map(seat => seat.seat_number);

            return seatsToAssign;

        } catch (error) {
            console.error('Error auto-assigning seats:', error);
            throw error;
        }
    }

    static async getTripSeatStats(tripId) {
        try {
            const trip = await db.Trip.findByPk(tripId, {
                include: [{ model: db.Vehicle, as: 'vehicle' }]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            const totalSeats = trip.vehicle?.seat_capacity || 30;

            const bookings = await db.Booking.findAll({
                where: {
                    trip_id: tripId,
                    status: { [Op.in]: ['confirmed', 'in_progress'] }
                }
            });

            const totalBookedPassengers = bookings.reduce((sum, booking) => sum + booking.passenger_count, 0);
            const occupancyRate = totalSeats > 0 ? (totalBookedPassengers / totalSeats) * 100 : 0;

            return {
                trip_id: tripId,
                total_seats: totalSeats,
                booked_seats: totalBookedPassengers,
                available_seats: Math.max(0, totalSeats - totalBookedPassengers),
                occupancy_rate: Math.round(occupancyRate * 100) / 100,
                bookings_count: bookings.length
            };

        } catch (error) {
            console.error('Error getting trip seat stats:', error);
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