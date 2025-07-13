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
    body('identifier')
      .notEmpty()
      .withMessage('Phone number or email is required')
      .bail()
      .custom((value) => {
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        const isPhone = /^[0-9]{7,15}$/.test(value); // Adjust based on your phone format
        if (!isEmail && !isPhone) {
          throw new Error('Enter a valid phone number or email address');
        }
        return true;
      }),

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
    body('trip_id')
      .isInt({ min: 1 })
      .withMessage('Valid trip ID is required'),
    body('pickup_stop_id')
      .isInt({ min: 1 })
      .withMessage('Valid pickup stop ID is required'),
    body('dropoff_stop_id')
      .isInt({ min: 1 })
      .withMessage('Valid dropoff stop ID is required'),
    body('passenger_count')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Passenger count must be between 1 and 10'),
  ];
};

const multipleBookingValidationRules = () => {
  return [
    body('bookings_data')
      .isArray({ min: 1, max: 10 })
      .withMessage('bookings_data must be an array with 1-10 bookings'),
    body('bookings_data.*.trip_id')
      .isInt({ min: 1 })
      .withMessage('Each booking must have a valid trip ID'),
    body('bookings_data.*.pickup_stop_id')
      .isInt({ min: 1 })
      .withMessage('Each booking must have a valid pickup stop ID'),
    body('bookings_data.*.dropoff_stop_id')
      .isInt({ min: 1 })
      .withMessage('Each booking must have a valid dropoff stop ID'),
    body('bookings_data.*.passenger_count')
      .optional()
      .isInt({ min: 1, max: 10 })
      .withMessage('Passenger count must be between 1 and 10'),
  ];
};

const paymentValidationRules = () => {
  return [
    body('booking_id')
      .isInt({ min: 1 })
      .withMessage('Valid booking ID is required'),
    body('payment_method')
      .isIn(['mobile_money', 'wallet', 'card'])
      .withMessage('Payment method must be mobile_money, wallet, or card'),
    body('phone_number')
      .if(body('payment_method').equals('mobile_money'))
      .matches(/^(0|255)7\d{8}$/)
      .withMessage('Valid Tanzanian phone number is required for mobile money'),
    body('amount')
      .optional()
      .isFloat({ min: 100 })
      .withMessage('Amount must be at least 100'),
  ];
};

const validationMiddleware = {
  validate,
  simplifiedUserValidationRules,
  loginValidationRules,
  verificationValidationRules,
  bookingValidationRules,
  bookingValidationRules,
  multipleBookingValidationRules,
  paymentValidationRules
};

module.exports = validationMiddleware;