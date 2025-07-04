// routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validate, simplifiedUserValidationRules, loginValidationRules, verificationValidationRules } = require('../middlewares/validation.middleware');

router.post('/register', simplifiedUserValidationRules(), validate, authController.register);
router.post('/login', loginValidationRules(), validate, authController.login);

router.post('/verify', [
    body('identifier').notEmpty().withMessage('Phone or email is required'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits')
], validate, authController.verifyAccount);

router.post('/resend-code', [
    body('identifier').notEmpty().withMessage('Phone or email is required')
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