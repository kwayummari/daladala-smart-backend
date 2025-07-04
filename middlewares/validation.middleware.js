// middlewares/validation.middleware.js
const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Simplified user validation for registration
const simplifiedUserValidationRules = () => {
  return [
    body('phone')
      .notEmpty()
      .withMessage('Phone number is required')
      .isMobilePhone('any', { strictMode: false })
      .withMessage('Please provide a valid phone number')
      .custom(value => {
        // Validate Tanzanian phone numbers
        const cleanPhone = value.replace(/[\s\-\+]/g, '');
        if (!cleanPhone.match(/^(255|0)[67]\d{8}$/)) {
          throw new Error('Please provide a valid Tanzanian phone number');
        }
        return true;
      }),

    body('email')
      .notEmpty()
      .withMessage('Email address is required')
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),

    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
  ];
};

const loginValidationRules = () => {
  return [
    body('phone')
      .notEmpty()
      .withMessage('Phone number or email is required'),

    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ];
};

// Verification validation rules
const verificationValidationRules = (type) => {
  const rules = [
    body('code')
      .notEmpty()
      .withMessage('Verification code is required')
      .isLength({ min: 6, max: 6 })
      .withMessage('Verification code must be 6 digits')
      .isNumeric()
      .withMessage('Verification code must contain only numbers')
  ];

  if (type === 'phone') {
    rules.push(
      body('phone')
        .notEmpty()
        .withMessage('Phone number is required')
        .isMobilePhone('any', { strictMode: false })
        .withMessage('Please provide a valid phone number')
    );
  } else if (type === 'email') {
    rules.push(
      body('email')
        .notEmpty()
        .withMessage('Email address is required')
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
    );
  }

  return rules;
};

const bookingValidationRules = () => {
  return [
    body('trip_id').isInt().withMessage('Valid trip ID is required'),
    body('pickup_stop_id').isInt().withMessage('Valid pickup stop ID is required'),
    body('dropoff_stop_id').isInt().withMessage('Valid dropoff stop ID is required'),
    body('passenger_count').isInt({ min: 1 }).withMessage('At least one passenger is required')
  ];
};

const validationMiddleware = {
  validate,
  simplifiedUserValidationRules,
  loginValidationRules,
  verificationValidationRules,
  bookingValidationRules
};

module.exports = validationMiddleware;