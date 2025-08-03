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

router.get('/earnings', driverController.getEarnings);

// Get driver notifications
router.get('/notifications', driverController.getNotifications);

// Mark notification as read
router.put('/notifications/:notification_id/read', driverController.markNotificationAsRead);

// Mark all notifications as read
router.put('/notifications/read-all', driverController.markAllNotificationsAsRead);

module.exports = router;