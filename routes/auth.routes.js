// routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validate, simplifiedUserValidationRules, loginValidationRules, verificationValidationRules } = require('../middlewares/validation.middleware');

// Simplified registration - only phone, email, password
router.post('/register', simplifiedUserValidationRules(), validate, authController.register);

// Login user (allows phone or email)
router.post('/login', loginValidationRules(), validate, authController.login);

// Verify phone number - use the working validation function
router.post('/verify-phone', verificationValidationRules('phone'), validate, authController.verifyPhone);

// Verify email address - use the working validation function  
router.post('/verify-email', verificationValidationRules('email'), validate, authController.verifyEmail);

// Resend verification code
router.post('/resend-verification', [
    body('phone').optional().isMobilePhone('any', { strictMode: false }).withMessage('Invalid phone number'),
    body('email').optional().isEmail().withMessage('Invalid email address'),
    body('type').isIn(['phone', 'email']).withMessage('Type must be either phone or email')
], validate, authController.resendVerificationCode);

// Request password reset
router.post('/request-reset', [
    body('phone').notEmpty().withMessage('Phone number or email is required')
], validate, authController.requestPasswordReset);

// Reset password with token
router.post('/reset-password', [
    body('phone').notEmpty().withMessage('Phone number or email is required'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits'),
    body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
], validate, authController.resetPassword);

module.exports = router;