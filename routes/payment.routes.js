const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(verifyToken);

// Process payment
router.post('/', paymentController.processPayment);

// Get payment history
router.get('/history', paymentController.getPaymentHistory);

// Get payment details
router.get('/:id', paymentController.getPaymentDetails);

module.exports = router;