// routes/booking.routes.js - COMPLETE ENHANCED VERSION
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Import validation rules - you'll need to create this file if it doesn't exist
// const { validate, bookingValidationRules, multipleBookingValidationRules } = require('../middlewares/validation.middleware');

// For now, let's create simple validation inline
const { body, validationResult } = require('express-validator');

// Simple validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 'error',
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// Single booking validation rules
const bookingValidationRules = () => {
    return [
        body('trip_id').isInt().withMessage('Trip ID must be an integer'),
        body('pickup_stop_id').isInt().withMessage('Pickup stop ID must be an integer'),
        body('dropoff_stop_id').isInt().withMessage('Dropoff stop ID must be an integer'),
        body('passenger_count')
            .isInt({ min: 1, max: 10 })
            .withMessage('Passenger count must be between 1 and 10'),
        body('seat_numbers')
            .optional()
            .isArray()
            .withMessage('Seat numbers must be an array'),
        body('seat_numbers.*')
            .optional()
            .isString()
            .withMessage('Each seat number must be a string'),
        body('passenger_names')
            .optional()
            .isArray()
            .withMessage('Passenger names must be an array'),
        body('passenger_names.*')
            .optional()
            .isString()
            .isLength({ min: 1, max: 100 })
            .withMessage('Each passenger name must be a string between 1-100 characters'),
        body('travel_date')
            .optional()
            .isDate()
            .withMessage('Travel date must be a valid date'),
        // Custom validation for seat consistency
        body().custom((value) => {
            if (value.seat_numbers && value.passenger_count) {
                if (value.seat_numbers.length !== value.passenger_count) {
                    throw new Error('Number of selected seats must match passenger count');
                }
            }
            if (value.seat_numbers && value.passenger_names) {
                if (value.passenger_names.length > 0 && value.passenger_names.length !== value.seat_numbers.length) {
                    throw new Error('Number of passenger names must match number of selected seats');
                }
            }
            return true;
        })
    ];
};

// Multiple booking validation rules
const multipleBookingValidationRules = () => {
    return [
        body('bookings_data')
            .isArray({ min: 1, max: 30 })
            .withMessage('Bookings data must be an array with 1-30 items'),
        body('bookings_data.*.trip_id')
            .isInt()
            .withMessage('Each booking must have a valid trip ID'),
        body('bookings_data.*.pickup_stop_id')
            .isInt()
            .withMessage('Each booking must have a valid pickup stop ID'),
        body('bookings_data.*.dropoff_stop_id')
            .isInt()
            .withMessage('Each booking must have a valid dropoff stop ID'),
        body('bookings_data.*.passenger_count')
            .optional()
            .isInt({ min: 1, max: 10 })
            .withMessage('Passenger count must be between 1 and 10'),
        body('bookings_data.*.travel_date')
            .isDate()
            .withMessage('Each booking must have a valid travel date'),
        body('bookings_data.*.seat_numbers')
            .optional()
            .isArray()
            .withMessage('Seat numbers must be an array'),
        body('bookings_data.*.passenger_names')
            .optional()
            .isArray()
            .withMessage('Passenger names must be an array'),
        body('is_multi_day')
            .optional()
            .isBoolean()
            .withMessage('is_multi_day must be a boolean'),
        body('date_range')
            .optional()
            .isIn(['single', 'week', 'month', '3months'])
            .withMessage('date_range must be one of: single, week, month, 3months'),
        // Custom validation for total passengers across all bookings
        body().custom((value) => {
            if (value.bookings_data) {
                const totalPassengers = value.bookings_data.reduce((sum, booking) => {
                    return sum + (booking.passenger_count || 1);
                }, 0);

                if (totalPassengers > 10) {
                    throw new Error('Total passengers across all bookings cannot exceed 10');
                }
            }
            return true;
        })
    ];
};

// All routes require authentication
router.use(verifyToken);

// ===============================
// BOOKING MANAGEMENT ROUTES
// ===============================

// Create single booking with optional seat selection
/**
 * POST /api/bookings
 * Body: {
 *   trip_id: number,
 *   pickup_stop_id: number,
 *   dropoff_stop_id: number,
 *   passenger_count: number,
 *   seat_numbers?: string[],
 *   passenger_names?: string[],
 *   travel_date?: string
 * }
 */
router.post('/', bookingValidationRules(), validate, bookingController.createBooking);

// Create multiple bookings for multi-day trips
/**
 * POST /api/bookings/multiple
 * Body: {
 *   bookings_data: Array<{
 *     trip_id: number,
 *     pickup_stop_id: number,
 *     dropoff_stop_id: number,
 *     passenger_count: number,
 *     seat_numbers?: string[],
 *     passenger_names?: string[],
 *     travel_date: string
 *   }>,
 *   is_multi_day?: boolean,
 *   date_range?: string
 * }
 */
router.post('/multiple', multipleBookingValidationRules(), validate, bookingController.createMultipleBookings);

// Get user bookings (with enhanced grouping for multi-day)
/**
 * GET /api/bookings
 * Query params: ?status=pending&booking_type=regular&travel_date=2025-07-15&is_multi_day=true
 */
router.get('/', bookingController.getUserBookings);

// Get specific booking details (with related bookings for multi-day)
/**
 * GET /api/bookings/:id
 */
router.get('/:id', bookingController.getBookingDetails);

// Cancel booking (single or entire multi-day group)
/**
 * PUT /api/bookings/:id/cancel
 * Body: { cancel_entire_group?: boolean }
 */
router.put('/:id/cancel', bookingController.cancelBooking);

// ===============================
// SEAT MANAGEMENT ROUTES
// ===============================

// Get available seats for a trip on a specific date
/**
 * GET /api/bookings/:trip_id/seats
 * Query params: ?travel_date=2025-07-15
 */
router.get('/:trip_id/seats', bookingController.getAvailableSeats);

// Release seat when passenger alights
/**
 * PUT /api/bookings/seats/:booking_seat_id/release
 */
router.put('/seats/:booking_seat_id/release', bookingController.releaseSeat);

// ===============================
// ADDITIONAL HELPER ROUTES
// ===============================

// Get booking statistics (optional - for analytics)
router.get('/stats/user', async (req, res) => {
    try {
        const { Booking } = require('../models');
        const { Op } = require('sequelize');

        const stats = await Booking.findAll({
            where: { user_id: req.userId },
            attributes: [
                'status',
                [require('sequelize').fn('COUNT', '*'), 'count'],
                [require('sequelize').fn('SUM', require('sequelize').col('fare_amount')), 'total_amount']
            ],
            group: ['status'],
            raw: true
        });

        res.status(200).json({
            status: 'success',
            data: stats
        });
    } catch (error) {
        console.error('Error getting booking stats:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get booking statistics'
        });
    }
});

// Get recent bookings (for dashboard)
router.get('/recent', async (req, res) => {
    try {
        const { Booking, Trip, Stop } = require('../models');

        const recentBookings = await Booking.findAll({
            where: {
                user_id: req.userId,
                booking_time: {
                    [require('sequelize').Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                }
            },
            include: [
                {
                    model: Trip,
                    include: [{
                        model: require('../models').Route,
                        attributes: ['route_name']
                    }],
                    attributes: ['trip_id', 'start_time', 'status']
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
            attributes: ['booking_id', 'booking_time', 'fare_amount', 'passenger_count', 'status', 'travel_date'],
            order: [['booking_time', 'DESC']],
            limit: 10
        });

        res.status(200).json({
            status: 'success',
            data: recentBookings
        });
    } catch (error) {
        console.error('Error getting recent bookings:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get recent bookings'
        });
    }
});

module.exports = router;