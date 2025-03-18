// routes/review.routes.js
const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Public routes
// Get reviews by trip
router.get('/trip/:trip_id', reviewController.getReviewsByTrip);

// Get reviews by driver
router.get('/driver/:driver_id', reviewController.getReviewsByDriver);

// Protected routes
router.use(verifyToken);

// Submit review
router.post('/', reviewController.submitReview);

// Get user reviews
router.get('/my-reviews', reviewController.getUserReviews);

module.exports = router;