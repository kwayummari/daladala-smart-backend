// routes/booking.routes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
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
        body('passenger_names')
            .optional()
            .isArray()
            .withMessage('Passenger names must be an array'),
        body('travel_date')
            .optional()
            .isDate()
            .withMessage('Travel date must be a valid date'),
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
    ];
};

// All routes require authentication
router.use(verifyToken);

// ===============================
// BOOKING MANAGEMENT ROUTES
// ===============================

router.post('/', bookingValidationRules(), validate, bookingController.createBooking);
router.post('/multiple', multipleBookingValidationRules(), validate, bookingController.createMultipleBookings);
router.get('/', bookingController.getUserBookings);
router.get('/:id', bookingController.getBookingDetails);
router.put('/:id/cancel', bookingController.cancelBooking);

// ===============================
// SEAT MANAGEMENT ROUTES
// ===============================

// CRITICAL FIX: This route must come BEFORE the /:id route to avoid conflicts
router.get('/:trip_id/seats', bookingController.getAvailableSeats);

// Release seat when passenger alights  
router.put('/seats/:booking_seat_id/release', bookingController.releaseSeat);

// ===============================
// ADDITIONAL HELPER ROUTES
// ===============================

// Get booking statistics
router.get('/stats/user', async (req, res) => {
    try {
        const { Booking } = require('../models');

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

// Get recent bookings
router.get('/recent', async (req, res) => {
    try {
        const { Booking, Trip, Stop } = require('../models');

        const recentBookings = await Booking.findAll({
            where: {
                user_id: req.userId,
                booking_time: {
                    [require('sequelize').Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
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