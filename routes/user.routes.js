const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// Get user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put('/profile', userController.updateProfile);

// Change password
router.put('/change-password', userController.changePassword);

// Delete account
router.delete('/account', userController.deleteAccount);

// Get notifications
router.get('/notifications', userController.getNotifications);

// Mark notification as read
router.put('/notifications/:notification_id/read', userController.markNotificationAsRead);

// Mark all notifications as read
router.put('/notifications/read-all', userController.markAllNotificationsAsRead);

module.exports = router;