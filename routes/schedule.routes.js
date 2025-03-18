// routes/schedule.routes.js
const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/schedule.controller');

// Public routes
// Get schedules by route
router.get('/route/:route_id', scheduleController.getSchedulesByRoute);

// Get schedule by ID
router.get('/:id', scheduleController.getScheduleById);

module.exports = router;