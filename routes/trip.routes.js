const express = require('express');
const router = express.Router();
const tripController = require('../controllers/trip.controller');
const { verifyToken, isDriver } = require('../middlewares/auth.middleware');

// Public routes (no authentication required)
// Get upcoming trips
router.get('/upcoming', tripController.getUpcomingTrips);

// Get trip details
router.get('/:id', tripController.getTripDetails);

// Get trips by route
router.get('/route/:route_id', tripController.getTripsByRoute);

// Driver routes (authentication and driver role required)
router.use('/driver', verifyToken, isDriver);

// Update trip status
router.put('/driver/:id/status', tripController.updateTripStatus);

// Update vehicle location
router.post('/driver/:trip_id/location', tripController.updateVehicleLocation);

module.exports = router;