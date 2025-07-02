// routes/payment.routes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// Webhook endpoint (no authentication required)
router.post('/webhook/zenopay', paymentController.handleZenoPayWebhook);

// All other routes require authentication
router.use(verifyToken);

// Process payment
router.post('/', paymentController.processPayment);

// Check payment status
router.get('/:id/status', paymentController.checkPaymentStatus);

// Get payment history
router.get('/history', paymentController.getPaymentHistory);

// Get payment details
router.get('/:id', paymentController.getPaymentDetails);

module.exports = router;