const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      status: 'error',
      errors: errors.array()
    });
  }
  next();
};

const userValidationRules = () => {
  return [
    body('first_name').notEmpty().withMessage('First name is required'),
    body('last_name').notEmpty().withMessage('Last name is required'),
    body('email').optional().isEmail().withMessage('Must be a valid email address'),
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ];
};

const loginValidationRules = () => {
  return [
    body('phone').notEmpty().withMessage('Phone number is required'),
    body('password').notEmpty().withMessage('Password is required')
  ];
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
  userValidationRules,
  loginValidationRules,
  bookingValidationRules
};

module.exports = validationMiddleware;