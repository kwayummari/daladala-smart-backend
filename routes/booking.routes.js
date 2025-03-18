const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate, bookingValidationRules } = require('../middlewares/validation.middleware');

// All routes require authentication
router.use(verifyToken);

// Create booking
router.post('/', bookingValidationRules(), validate, bookingController.createBooking);

// Get user bookings
router.get('/', bookingController.getUserBookings);

// Get booking details
router.get('/:id', bookingController.getBookingDetails);

// Cancel booking
router.put('/:id/cancel', bookingController.cancelBooking);

module.exports = router;