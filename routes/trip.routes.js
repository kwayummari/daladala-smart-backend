// routes/trip.routes.js
const express = require('express');
const router = express.Router();
const tripController = require('../controllers/trip.controller');

// Try to load auth middleware, but don't fail if it doesn't exist
let authMiddleware = {
    verifyToken: (req, res, next) => next(), // Default no-op middleware
    isDriver: (req, res, next) => next()
};

try {
    authMiddleware = require('./../middlewares/auth.middleware');
} catch (e) {
    try {
        authMiddleware = require('./../middleware/auth.middleware');
    } catch (e2) {
        console.log('Warning: Auth middleware not found, using no-op middleware');
    }
}

// Optional auth middleware - sets userId if token is valid, but doesn't block if no token
const optionalAuth = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
        try {
            // If you have a verifyToken function that doesn't throw errors
            authMiddleware.verifyToken(req, res, next);
        } catch (e) {
            // If token is invalid, continue without userId
            next();
        }
    } else {
        // No token provided, continue without userId
        next();
    }
};

const setDriverId = (req, res, next) => {
    // If user is a driver, set driverId for easier access
    if (req.userId && req.user && req.user.role === 'driver') {
        req.driverId = req.user.driver_id || req.userId;
    } else if (req.userId) {
        // For backward compatibility, use userId as driverId if no specific driver_id
        req.driverId = req.userId;
    }
    next();
};

// Public routes (work with or without authentication)
router.get('/upcoming', optionalAuth, tripController.getUpcomingTrips);
router.get('/:id', tripController.getTripDetails);
router.get('/route/:route_id', tripController.getTripsByRoute);

// Protected routes (require authentication)
router.get('/user/upcoming', authMiddleware.verifyToken, tripController.getUpcomingTrips);

// Driver routes (require driver authentication)
if (typeof tripController.updateTripStatus === 'function') {
    router.put('/driver/:id/status', authMiddleware.verifyToken, authMiddleware.isDriver, tripController.updateTripStatus);
}

if (typeof tripController.updateVehicleLocation === 'function') {
    router.post('/driver/:trip_id/location', authMiddleware.verifyToken, authMiddleware.isDriver, tripController.updateVehicleLocation);
}

// Alternative: If you want to group driver routes under /driver
router.get('/driver/my-trips', authMiddleware.verifyToken, setDriverId, tripController.getDriverTrips);
router.post('/driver/:id/start', authMiddleware.verifyToken, setDriverId, tripController.startTrip);
router.post('/driver/:id/end', authMiddleware.verifyToken, setDriverId, tripController.endTrip);
router.post('/driver/location/update', authMiddleware.verifyToken, setDriverId, tripController.updateDriverLocation);

// Alternative: If you want to group passenger routes under /passenger
router.get('/passenger/my-trips', authMiddleware.verifyToken, tripController.getPassengerTrips);
router.get('/passenger/:id/track', authMiddleware.verifyToken, tripController.getLiveTripLocation);

module.exports = router;