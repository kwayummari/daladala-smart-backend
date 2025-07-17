// routes/auth.routes.js
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const driverAuthController = require('../controllers/driver.auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { validate, simplifiedUserValidationRules, loginValidationRules, verificationValidationRules } = require('../middlewares/validation.middleware');

router.post('/register', simplifiedUserValidationRules(), validate, authController.register);
router.post('/login', loginValidationRules(), validate, authController.login);
router.post('/driver/login', [
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], validate, driverAuthController.driverLogin);
router.post('/driver/register', [
    body('first_name').notEmpty().withMessage('First name is required'),
    body('last_name').notEmpty().withMessage('Last name is required'),
    body('phone').isMobilePhone().withMessage('Valid phone number is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('license_number').notEmpty().withMessage('License number is required'),
    body('license_expiry').isISO8601().withMessage('Valid license expiry date is required'),
    body('id_number').notEmpty().withMessage('ID number is required')
], validate, driverAuthController.driverRegister);
router.get('/driver/profile', verifyToken, driverAuthController.getDriverProfile);
router.put('/driver/status', verifyToken, driverAuthController.updateDriverStatus);

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