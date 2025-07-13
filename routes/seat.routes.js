// routes/seat.routes.js - NEW ROUTES
const express = require('express');
const router = express.Router();
const seatController = require('../controllers/seat.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// Get available seats for a trip
router.get('/trips/:tripId/available', seatController.getAvailableSeats);

// Reserve specific seats for a booking
router.post('/reserve', seatController.reserveSeats);

// Auto-assign seats for a booking
router.post('/auto-assign', seatController.autoAssignSeats);

// Release seat (for drivers)
router.post('/release', seatController.releaseSeat);

// Get trip seat statistics
router.get('/trips/:tripId/stats', seatController.getTripSeatStats);

module.exports = router;