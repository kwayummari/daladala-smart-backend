// services/seatManagementService.js - NEW SERVICE
const { Op } = require('sequelize');
const db = require('../models');
const { Seat, BookingSeat, Booking, Trip, Vehicle } = db;

class SeatManagementService {

    // Get available seats for a specific trip and date
    static async getAvailableSeats(tripId, pickupStopId = null, dropoffStopId = null, travelDate = null) {
        try {
            // Get trip and vehicle information
            const trip = await Trip.findOne({
                where: { trip_id: tripId },
                include: [{
                    model: Vehicle,
                    attributes: ['vehicle_id', 'seat_capacity', 'plate_number', 'vehicle_type']
                }]
            });

            if (!trip) {
                throw new Error('Trip not found');
            }

            // Get all seats for this vehicle
            const allSeats = await Seat.findAll({
                where: { vehicle_id: trip.vehicle_id },
                attributes: ['seat_id', 'seat_number', 'seat_type', 'is_available'],
                order: [['seat_number', 'ASC']]
            });

            // Build query for occupied seats
            let occupiedSeatsQuery = {
                trip_id: tripId,
                is_occupied: true
            };

            // Add date filter if provided
            if (travelDate) {
                occupiedSeatsQuery.booking_date = travelDate;
            }

            // Get occupied seats
            const occupiedSeats = await BookingSeat.findAll({
                where: occupiedSeatsQuery,
                include: [
                    {
                        model: Seat,
                        attributes: ['seat_number', 'seat_type']
                    },
                    {
                        model: Booking,
                        attributes: ['travel_date', 'pickup_stop_id', 'dropoff_stop_id', 'status']
                    }
                ],
                attributes: ['booking_seat_id', 'seat_id', 'passenger_name', 'is_occupied', 'boarded_at', 'alighted_at']
            });

            // Filter occupied seats based on route overlap (if pickup/dropoff specified)
            let relevantOccupiedSeats = occupiedSeats;
            if (pickupStopId && dropoffStopId) {
                relevantOccupiedSeats = occupiedSeats.filter(os => {
                    // Check if there's route overlap
                    const booking = os.Booking;
                    return this.hasRouteOverlap(
                        pickupStopId, dropoffStopId,
                        booking.pickup_stop_id, booking.dropoff_stop_id
                    );
                });
            }

            const occupiedSeatIds = relevantOccupiedSeats.map(os => os.seat_id);

            // Calculate available seats
            const availableSeats = allSeats.filter(seat =>
                seat.is_available && !occupiedSeatIds.includes(seat.seat_id)
            );

            return {
                trip_id: tripId,
                travel_date: travelDate,
                vehicle_info: {
                    vehicle_id: trip.vehicle_id,
                    plate_number: trip.Vehicle.plate_number,
                    vehicle_type: trip.Vehicle.vehicle_type,
                    total_capacity: trip.Vehicle.seat_capacity
                },
                seat_summary: {
                    total_seats: allSeats.length,
                    available_seats: availableSeats.length,
                    occupied_seats: relevantOccupiedSeats.length,
                    maintenance_seats: allSeats.filter(s => !s.is_available).length
                },
                available_seats: availableSeats.map(seat => ({
                    seat_id: seat.seat_id,
                    seat_number: seat.seat_number,
                    seat_type: seat.seat_type
                })),
                occupied_seats: relevantOccupiedSeats.map(os => ({
                    seat_id: os.seat_id,
                    seat_number: os.Seat.seat_number,
                    seat_type: os.Seat.seat_type,
                    passenger_name: os.passenger_name,
                    booking_date: os.Booking.travel_date,
                    boarded: !!os.boarded_at,
                    alighted: !!os.alighted_at
                }))
            };

        } catch (error) {
            console.error('Error getting available seats:', error);
            throw error;
        }
    }

    // Reserve specific seats for a booking
    static async reserveSeats(bookingId, seatNumbers, passengerNames = []) {
        const transaction = await db.sequelize.transaction();

        try {
            // Get booking details
            const booking = await Booking.findByPk(bookingId, {
                include: [{
                    model: Trip,
                    include: [{ model: Vehicle }]
                }],
                transaction
            });

            if (!booking) {
                throw new Error('Booking not found');
            }

            const reservedSeats = [];

            for (let i = 0; i < seatNumbers.length; i++) {
                const seatNumber = seatNumbers[i];
                const passengerName = passengerNames[i] || `Passenger ${i + 1}`;

                // Find the seat
                const seat = await Seat.findOne({
                    where: {
                        vehicle_id: booking.Trip.vehicle_id,
                        seat_number: seatNumber,
                        is_available: true
                    },
                    transaction
                });

                if (!seat) {
                    throw new Error(`Seat ${seatNumber} is not available`);
                }

                // Check if seat is already booked for this trip and date
                const existingBooking = await BookingSeat.findOne({
                    where: {
                        seat_id: seat.seat_id,
                        trip_id: booking.trip_id,
                        booking_date: booking.travel_date,
                        is_occupied: true
                    },
                    transaction
                });

                if (existingBooking) {
                    throw new Error(`Seat ${seatNumber} is already reserved for this trip`);
                }

                // Reserve the seat
                const bookingSeat = await BookingSeat.create({
                    booking_id: bookingId,
                    seat_id: seat.seat_id,
                    trip_id: booking.trip_id,
                    booking_date: booking.travel_date,
                    booking_reference: booking.booking_reference,
                    passenger_name: passengerName,
                    is_occupied: true
                }, { transaction });

                reservedSeats.push({
                    booking_seat_id: bookingSeat.booking_seat_id,
                    seat_id: seat.seat_id,
                    seat_number: seatNumber,
                    passenger_name: passengerName
                });
            }

            // Update booking with seat assignments
            const seatAssignments = reservedSeats.map(rs => ({
                seat_number: rs.seat_number,
                passenger_name: rs.passenger_name
            }));

            await booking.update({
                seat_numbers: seatNumbers.join(','),
                seat_assignments: JSON.stringify(seatAssignments)
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                booking_id: bookingId,
                reserved_seats: reservedSeats,
                total_seats_reserved: reservedSeats.length
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error reserving seats:', error);
            throw error;
        }
    }

    // Auto-assign seats for a booking
    static async autoAssignSeats(tripId, pickupStopId, dropoffStopId, passengerCount, travelDate = null) {
        try {
            const seatInfo = await this.getAvailableSeats(tripId, pickupStopId, dropoffStopId, travelDate);

            if (seatInfo.available_seats.length < passengerCount) {
                throw new Error(`Only ${seatInfo.available_seats.length} seats available, but ${passengerCount} requested`);
            }

            // Select seats - prefer seats together
            const selectedSeats = this.selectOptimalSeats(seatInfo.available_seats, passengerCount);

            return selectedSeats.map(seat => seat.seat_number);

        } catch (error) {
            console.error('Error auto-assigning seats:', error);
            throw error;
        }
    }

    // Select optimal seats (try to keep passengers together)
    static selectOptimalSeats(availableSeats, passengerCount) {
        if (passengerCount === 1) {
            return [availableSeats[0]];
        }

        // Sort seats by seat number for easier grouping
        const sortedSeats = [...availableSeats].sort((a, b) => {
            const aNum = parseInt(a.seat_number.replace(/\D/g, ''));
            const bNum = parseInt(b.seat_number.replace(/\D/g, ''));
            return aNum - bNum;
        });

        // Try to find consecutive seats
        for (let i = 0; i <= sortedSeats.length - passengerCount; i++) {
            const consecutiveSeats = [];
            let isConsecutive = true;

            for (let j = 0; j < passengerCount; j++) {
                const currentSeat = sortedSeats[i + j];
                if (!currentSeat) {
                    isConsecutive = false;
                    break;
                }

                const currentNum = parseInt(currentSeat.seat_number.replace(/\D/g, ''));
                if (j > 0) {
                    const prevNum = parseInt(sortedSeats[i + j - 1].seat_number.replace(/\D/g, ''));
                    if (currentNum !== prevNum + 1) {
                        isConsecutive = false;
                        break;
                    }
                }

                consecutiveSeats.push(currentSeat);
            }

            if (isConsecutive && consecutiveSeats.length === passengerCount) {
                return consecutiveSeats;
            }
        }

        // If no consecutive seats found, return first available seats
        return sortedSeats.slice(0, passengerCount);
    }

    // Check if two route segments overlap
    static hasRouteOverlap(pickup1, dropoff1, pickup2, dropoff2) {
        // Simplified overlap check - in real implementation, you'd check route sequence
        // For now, assume overlap if any stops match
        return pickup1 === pickup2 || pickup1 === dropoff2 ||
            dropoff1 === pickup2 || dropoff1 === dropoff2;
    }

    // Get seat statistics for a trip
    static async getTripSeatStats(tripId, travelDate = null) {
        try {
            const seatInfo = await this.getAvailableSeats(tripId, null, null, travelDate);

            return {
                trip_id: tripId,
                travel_date: travelDate,
                stats: seatInfo.seat_summary,
                occupancy_rate: ((seatInfo.seat_summary.occupied_seats / seatInfo.seat_summary.total_seats) * 100).toFixed(2)
            };

        } catch (error) {
            console.error('Error getting trip seat stats:', error);
            throw error;
        }
    }

    // Release seat when passenger alights
    static async releaseSeat(bookingSeatId, userId) {
        const transaction = await db.sequelize.transaction();

        try {
            // Verify booking seat belongs to user
            const bookingSeat = await BookingSeat.findOne({
                where: { booking_seat_id: bookingSeatId },
                include: [{
                    model: Booking,
                    where: { user_id: userId },
                    attributes: ['booking_id', 'user_id']
                }],
                transaction
            });

            if (!bookingSeat) {
                throw new Error('Booking seat not found or access denied');
            }

            if (bookingSeat.alighted_at) {
                throw new Error('Passenger has already alighted');
            }

            // Update booking seat
            await bookingSeat.update({
                alighted_at: new Date(),
                is_occupied: false
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                booking_seat_id: bookingSeatId,
                alighted_at: bookingSeat.alighted_at,
                seat_released: true
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error releasing seat:', error);
            throw error;
        }
    }

    // Board passenger (mark as boarded)
    static async boardPassenger(bookingSeatId, userId) {
        const transaction = await db.sequelize.transaction();

        try {
            // Verify booking seat belongs to user
            const bookingSeat = await BookingSeat.findOne({
                where: { booking_seat_id: bookingSeatId },
                include: [{
                    model: Booking,
                    where: { user_id: userId },
                    attributes: ['booking_id', 'user_id']
                }],
                transaction
            });

            if (!bookingSeat) {
                throw new Error('Booking seat not found or access denied');
            }

            if (bookingSeat.boarded_at) {
                throw new Error('Passenger has already boarded');
            }

            // Update booking seat
            await bookingSeat.update({
                boarded_at: new Date()
            }, { transaction });

            await transaction.commit();

            return {
                success: true,
                booking_seat_id: bookingSeatId,
                boarded_at: bookingSeat.boarded_at,
                passenger_boarded: true
            };

        } catch (error) {
            await transaction.rollback();
            console.error('Error boarding passenger:', error);
            throw error;
        }
    }

    // Get seat map for a vehicle
    static async getVehicleSeatMap(vehicleId, tripId = null, travelDate = null) {
        try {
            // Get vehicle info
            const vehicle = await Vehicle.findByPk(vehicleId, {
                attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'seat_capacity']
            });

            if (!vehicle) {
                throw new Error('Vehicle not found');
            }

            // Get all seats for this vehicle
            const seats = await Seat.findAll({
                where: { vehicle_id: vehicleId },
                attributes: ['seat_id', 'seat_number', 'seat_type', 'is_available'],
                order: [['seat_number', 'ASC']]
            });

            // Get occupied seats if trip specified
            let occupiedSeats = [];
            if (tripId) {
                let query = { trip_id: tripId, is_occupied: true };
                if (travelDate) {
                    query.booking_date = travelDate;
                }

                occupiedSeats = await BookingSeat.findAll({
                    where: query,
                    attributes: ['seat_id', 'passenger_name', 'boarded_at', 'alighted_at']
                });
            }

            const occupiedSeatIds = occupiedSeats.map(os => os.seat_id);

            // Build seat map
            const seatMap = seats.map(seat => {
                const isOccupied = occupiedSeatIds.includes(seat.seat_id);
                const occupiedInfo = isOccupied ?
                    occupiedSeats.find(os => os.seat_id === seat.seat_id) : null;

                return {
                    seat_id: seat.seat_id,
                    seat_number: seat.seat_number,
                    seat_type: seat.seat_type,
                    is_available: seat.is_available,
                    is_occupied: isOccupied,
                    passenger_name: occupiedInfo?.passenger_name || null,
                    boarded: !!occupiedInfo?.boarded_at,
                    alighted: !!occupiedInfo?.alighted_at,
                    status: !seat.is_available ? 'maintenance' :
                        isOccupied ? 'occupied' : 'available'
                };
            });

            return {
                vehicle_info: vehicle,
                trip_id: tripId,
                travel_date: travelDate,
                seat_map: seatMap,
                summary: {
                    total_seats: seats.length,
                    available_seats: seatMap.filter(s => s.status === 'available').length,
                    occupied_seats: seatMap.filter(s => s.status === 'occupied').length,
                    maintenance_seats: seatMap.filter(s => s.status === 'maintenance').length
                }
            };

        } catch (error) {
            console.error('Error getting vehicle seat map:', error);
            throw error;
        }
    }
}

module.exports = SeatManagementService;