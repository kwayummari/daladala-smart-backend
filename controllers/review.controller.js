// controllers/review.controller.js
const db = require('../models');
const Review = db.Review;
const Driver = db.Driver;

// Submit review
exports.submitReview = async (req, res) => {
  try {
    const { trip_id, driver_id, vehicle_id, rating, comment, is_anonymous = false } = req.body;

    // Check if user has already reviewed this trip
    const existingReview = await Review.findOne({
      where: {
        user_id: req.userId,
        trip_id
      }
    });

    if (existingReview) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reviewed this trip'
      });
    }

    // Check if trip exists and user was a passenger
    const booking = await db.Booking.findOne({
      where: {
        user_id: req.userId,
        trip_id,
        status: 'completed'
      }
    });

    if (!booking) {
      return res.status(403).json({
        status: 'error',
        message: 'You can only review trips you have completed'
      });
    }

    // Create review
    const review = await Review.create({
      user_id: req.userId,
      trip_id,
      driver_id,
      vehicle_id,
      rating,
      comment,
      review_time: new Date(),
      is_anonymous,
      status: 'approved' // Auto-approve for now
    });

    // Update driver rating
    if (driver_id) {
      const driver = await Driver.findByPk(driver_id);
      
      if (driver) {
        const newRatingTotal = driver.rating * driver.total_ratings + rating;
        const newTotalRatings = driver.total_ratings + 1;
        const newRating = newRatingTotal / newTotalRatings;
        
        await driver.update({
          rating: newRating,
          total_ratings: newTotalRatings
        });
      }
    }

    res.status(201).json({
      status: 'success',
      message: 'Review submitted successfully',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get reviews by trip
exports.getReviewsByTrip = async (req, res) => {
  try {
    const { trip_id } = req.params;

    const reviews = await Review.findAll({
      where: {
        trip_id,
        status: 'approved'
      },
      include: [
        {
          model: db.User,
          attributes: ['first_name', 'last_name', 'profile_picture']
        },
        {
          model: db.Driver,
          include: [{
            model: db.User,
            attributes: ['first_name', 'last_name']
          }]
        },
        {
          model: db.Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type']
        }
      ],
      order: [['review_time', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get reviews by driver
exports.getReviewsByDriver = async (req, res) => {
  try {
    const { driver_id } = req.params;

    const reviews = await Review.findAll({
      where: {
        driver_id,
        status: 'approved'
      },
      include: [
        {
          model: db.User,
          attributes: ['first_name', 'last_name', 'profile_picture']
        },
        {
          model: db.Trip,
          attributes: ['trip_id', 'start_time'],
          include: [{
            model: db.Route,
            attributes: ['route_name']
          }]
        }
      ],
      order: [['review_time', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get user reviews
exports.getUserReviews = async (req, res) => {
  try {
    const reviews = await Review.findAll({
      where: {
        user_id: req.userId
      },
      include: [
        {
          model: db.Trip,
          attributes: ['trip_id', 'start_time', 'end_time'],
          include: [{
            model: db.Route,
            attributes: ['route_name', 'start_point', 'end_point']
          }]
        },
        {
          model: db.Driver,
          include: [{
            model: db.User,
            attributes: ['first_name', 'last_name']
          }]
        },
        {
          model: db.Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type']
        }
      ],
      order: [['review_time', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: reviews
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};