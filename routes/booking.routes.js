// routes/booking.routes.js - ENHANCED VERSION
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate, bookingValidationRules, multipleBookingValidationRules } = require('../middlewares/validation.middleware');

// All routes require authentication
router.use(verifyToken);

// Create single booking
router.post('/', bookingValidationRules(), validate, bookingController.createBooking);

// Create multiple bookings
router.post('/multiple', multipleBookingValidationRules(), validate, bookingController.createMultipleBookings);

// Get user bookings
router.get('/', bookingController.getUserBookings);

// Get booking details
router.get('/:id', bookingController.getBookingDetails);

// Cancel booking
router.put('/:id/cancel', bookingController.cancelBooking);

module.exports = router;