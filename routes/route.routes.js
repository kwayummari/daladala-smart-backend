const express = require('express');
const router = express.Router();
const routeController = require('../controllers/route.controller');
const { verifyToken, isAdmin } = require('../middlewares/auth.middleware');

// Public routes (no authentication required)
// Get all routes
router.get('/', routeController.getAllRoutes);

// Get route by id
router.get('/:id', routeController.getRouteById);

// Get route stops
router.get('/:id/stops', routeController.getRouteStops);

// Get route fares
router.get('/:id/fares', routeController.getRouteFares);

// Search routes
router.get('/search', routeController.searchRoutes);

// Get fare between stops
router.get('/fare', routeController.getFareBetweenStops);

// Admin routes (authentication and admin role required)
// The following routes would typically be used in the CMS
router.use(verifyToken, isAdmin);

// Add more routes for admin functionality (creating/updating routes, stops, fares)
// These would be implemented as you expand the CMS functionality

module.exports = router;