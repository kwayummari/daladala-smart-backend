// controllers/seat.controller.js - NEW CONTROLLER
const SeatManagementService = require('../services/seatManagementService');
const db = require('../models');

// Get available seats for a trip
exports.getAvailableSeats = async (req, res) => {
    try {
        const { tripId } = req.params;
        const { pickup_stop_id, dropoff_stop_id } = req.query;

        if (!tripId) {
            return res.status(400).json({
                status: 'error',
                message: 'Trip ID is required'
            });
        }

        const seatInfo = await SeatManagementService.getAvailableSeats(
            tripId,
            pickup_stop_id,
            dropoff_stop_id
        );

        res.status(200).json({
            status: 'success',
            data: seatInfo
        });

    } catch (error) {
        console.error('Error getting available seats:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to get available seats'
        });
    }
};

// Reserve specific seats for a booking
exports.reserveSeats = async (req, res) => {
    try {
        const { booking_id, seat_numbers } = req.body;

        if (!booking_id || !seat_numbers || !Array.isArray(seat_numbers)) {
            return res.status(400).json({
                status: 'error',
                message: 'Booking ID and seat numbers array are required'
            });
        }

        // Verify booking belongs to user
        const booking = await db.Booking.findOne({
            where: {
                booking_id,
                user_id: req.userId
            }
        });

        if (!booking) {
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        const result = await SeatManagementService.reserveSeats(booking_id, seat_numbers);

        res.status(200).json({
            status: 'success',
            message: 'Seats reserved successfully',
            data: result
        });

    } catch (error) {
        console.error('Error reserving seats:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to reserve seats'
        });
    }
};

// Release seat (for drivers)
exports.releaseSeat = async (req, res) => {
    try {
        const { trip_id, seat_number } = req.body;

        if (!trip_id || !seat_number) {
            return res.status(400).json({
                status: 'error',
                message: 'Trip ID and seat number are required'
            });
        }

        // Get driver ID from user (assuming driver is authenticated)
        const driver = await db.Driver.findOne({
            where: { user_id: req.userId }
        });

        if (!driver) {
            return res.status(403).json({
                status: 'error',
                message: 'Only drivers can release seats'
            });
        }

        const result = await SeatManagementService.releaseSeat(
            trip_id,
            seat_number,
            driver.driver_id
        );

        res.status(200).json({
            status: 'success',
            message: 'Seat released successfully',
            data: result
        });

    } catch (error) {
        console.error('Error releasing seat:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to release seat'
        });
    }
};

// Get trip seat statistics
exports.getTripSeatStats = async (req, res) => {
    try {
        const { tripId } = req.params;

        if (!tripId) {
            return res.status(400).json({
                status: 'error',
                message: 'Trip ID is required'
            });
        }

        const stats = await SeatManagementService.getTripSeatStats(tripId);

        res.status(200).json({
            status: 'success',
            data: stats
        });

    } catch (error) {
        console.error('Error getting trip seat stats:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to get seat statistics'
        });
    }
};

// Auto-assign seats for booking
exports.autoAssignSeats = async (req, res) => {
    try {
        const { booking_id } = req.body;

        if (!booking_id) {
            return res.status(400).json({
                status: 'error',
                message: 'Booking ID is required'
            });
        }

        // Verify booking belongs to user
        const booking = await db.Booking.findOne({
            where: {
                booking_id,
                user_id: req.userId
            }
        });

        if (!booking) {
            return res.status(404).json({
                status: 'error',
                message: 'Booking not found'
            });
        }

        // Auto-assign seats
        const assignedSeats = await SeatManagementService.autoAssignSeats(
            booking.trip_id,
            booking.pickup_stop_id,
            booking.dropoff_stop_id,
            booking.passenger_count
        );

        // Reserve the auto-assigned seats
        const result = await SeatManagementService.reserveSeats(booking_id, assignedSeats);

        res.status(200).json({
            status: 'success',
            message: 'Seats auto-assigned successfully',
            data: {
                ...result,
                auto_assigned: true
            }
        });

    } catch (error) {
        console.error('Error auto-assigning seats:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to auto-assign seats'
        });
    }
};