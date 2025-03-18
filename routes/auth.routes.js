const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { validate, userValidationRules, loginValidationRules } = require('../middlewares/validation.middleware');

// Register new user
router.post('/register', userValidationRules(), validate, authController.register);

// Login user
router.post('/login', loginValidationRules(), validate, authController.login);

// Verify user with token
router.get('/verify/:token', authController.verifyUser);

// Request password reset
router.post('/request-reset', authController.requestPasswordReset);

// Reset password with token
router.post('/reset-password', authController.resetPassword);

module.exports = router;