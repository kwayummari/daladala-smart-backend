// routes/payment.routes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

// PUBLIC ROUTES (no authentication required)
// Webhook endpoint MUST come first and have no auth
router.post('/webhook/zenopay', paymentController.handleZenoPayWebhook);

// PROTECTED ROUTES (authentication required)
// Apply authentication middleware to all routes below
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