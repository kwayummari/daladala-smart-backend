// routes/driver.routes.js
const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driver.controller');
const { verifyToken, isDriver } = require('../middlewares/auth.middleware');

// All routes require driver authentication
router.use(verifyToken, isDriver);

// Get driver profile
router.get('/profile', driverController.getDriverProfile);

// Update driver availability
router.put('/availability', driverController.updateAvailability);

// Get driver assigned trips
router.get('/trips', driverController.getAssignedTrips);

// Get driver statistics
router.get('/statistics', driverController.getStatistics);

module.exports = router;