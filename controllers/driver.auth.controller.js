// controllers/driver.auth.controller.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../models');
const config = require('../config/auth.config');

const User = db.User;
const Driver = db.Driver;
const Vehicle = db.Vehicle;
const UserRole = db.UserRole;

// Generate JWT token
const generateToken = (user, driver) => {
    return jwt.sign(
        {
            id: user.user_id,
            driver_id: driver.driver_id,
            role: 'driver'
        },
        config.secret,
        { expiresIn: '24h' }
    );
};

// Driver Login
exports.driverLogin = async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { phone, password, remember_me = false } = req.body;
        console.log('Driver login attempt:', { phone, remember_me });

        if (!phone || !password) {
            return res.status(400).json({
                status: 'error',
                message: 'Phone and password are required'
            });
        }

        // Find user by phone and check if they are a driver
        const user = await User.findOne({
            where: { phone },
            include: [
                {
                    model: UserRole,
                    as: 'role',
                    attributes: ['role_name']
                }
            ]
        });

        console.log('User found:', user ? 'Yes' : 'No');

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'Driver not found'
            });
        }

        // Check if user is a driver
        if (user.role.role_name !== 'driver') {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. Driver account required.'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid credentials'
            });
        }

        // Check verification status
        if (!user.is_verified) {
            return res.status(403).json({
                status: 'error',
                message: 'Please verify your account first. Check your phone for verification code.',
                data: {
                    requires_verification: true,
                    user_id: user.user_id,
                    phone: user.phone,
                    email: user.email
                }
            });
        }

        // Check if user is active
        if (user.status !== 'active') {
            return res.status(403).json({
                status: 'error',
                message: 'Account is not active. Please contact support.',
                requires_verification: user.status === 'pending'
            });
        }

        // Get driver information
        const driver = await Driver.findOne({
            where: { user_id: user.user_id },
            include: [
                {
                    model: Vehicle,
                    as: 'vehicles',
                    where: { is_active: true },
                    required: false,
                    attributes: [
                        'vehicle_id',
                        'plate_number',
                        'vehicle_type',
                        'model',
                        'capacity',
                        'color',
                        'is_air_conditioned'
                    ]
                }
            ]
        });

        if (!driver) {
            return res.status(404).json({
                status: 'error',
                message: 'Driver profile not found. Please contact support.'
            });
        }

        // Check if driver is approved
        if (driver.status !== 'active') {
            return res.status(403).json({
                status: 'error',
                message: 'Driver account is not approved yet. Please wait for approval or contact support.',
                data: {
                    driver_status: driver.status
                }
            });
        }

        // Update last login
        await user.update({ last_login: new Date() });

        // Generate JWT token
        const token = generateToken(user, driver);

        // Get primary vehicle (first active vehicle)
        const primaryVehicle = driver.vehicles && driver.vehicles.length > 0
            ? driver.vehicles[0]
            : null;

        // Set token expiration based on remember_me
        const tokenExpiration = remember_me
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
            : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        res.status(200).json({
            status: 'success',
            message: 'Driver login successful',
            data: {
                token,
                token_expires_at: tokenExpiration,
                driver: {
                    driver_id: driver.driver_id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    phone: user.phone,
                    profile_picture: user.profile_picture,
                    license_number: driver.license_number,
                    license_expiry: driver.license_expiry,
                    id_number: driver.id_number,
                    rating: parseFloat(driver.rating || 0),
                    total_ratings: driver.total_ratings || 0,
                    is_available: driver.is_available,
                    is_tracking_enabled: driver.is_tracking_enabled,
                    status: driver.status,
                    last_location_update: driver.last_location_update,
                    current_latitude: driver.current_latitude,
                    current_longitude: driver.current_longitude,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                },
                vehicle: primaryVehicle ? {
                    vehicle_id: primaryVehicle.vehicle_id,
                    plate_number: primaryVehicle.plate_number,
                    vehicle_type: primaryVehicle.vehicle_type,
                    model: primaryVehicle.model,
                    capacity: primaryVehicle.capacity,
                    color: primaryVehicle.color,
                    is_air_conditioned: primaryVehicle.is_air_conditioned,
                    is_active: true
                } : null
            }
        });

    } catch (error) {
        console.error('Driver login error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Driver Register (if needed)
exports.driverRegister = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const {
            first_name,
            last_name,
            phone,
            email,
            password,
            license_number,
            license_expiry,
            id_number,
            vehicle_plate_number,
            vehicle_model,
            vehicle_type,
            vehicle_capacity
        } = req.body;

        // Check if phone already exists
        const existingUser = await User.findOne({ where: { phone } });
        if (existingUser) {
            return res.status(400).json({
                status: 'error',
                message: 'Phone number already registered'
            });
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = await User.findOne({ where: { email } });
            if (existingEmail) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Email already registered'
                });
            }
        }

        // Check if license number already exists
        const existingDriver = await Driver.findOne({ where: { license_number } });
        if (existingDriver) {
            return res.status(400).json({
                status: 'error',
                message: 'License number already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Get driver role
        const driverRole = await UserRole.findOne({ where: { role_name: 'driver' } });
        if (!driverRole) {
            return res.status(500).json({
                status: 'error',
                message: 'Driver role not found. Please contact support.'
            });
        }

        // Start transaction
        const transaction = await db.sequelize.transaction();

        try {
            // Create user
            const user = await User.create({
                first_name,
                last_name,
                phone,
                email,
                password: hashedPassword,
                role_id: driverRole.role_id,
                status: 'pending', // Requires admin approval
                is_verified: false
            }, { transaction });

            // Create driver profile
            const driver = await Driver.create({
                user_id: user.user_id,
                license_number,
                license_expiry: new Date(license_expiry),
                id_number,
                rating: 5.0,
                total_ratings: 0,
                is_available: false,
                status: 'pending' // Requires admin approval
            }, { transaction });

            // Create vehicle if provided
            let vehicle = null;
            if (vehicle_plate_number && vehicle_model) {
                vehicle = await Vehicle.create({
                    driver_id: driver.driver_id,
                    plate_number: vehicle_plate_number,
                    vehicle_type: vehicle_type || 'minibus',
                    model: vehicle_model,
                    capacity: vehicle_capacity || 14,
                    is_active: false // Will be activated after approval
                }, { transaction });
            }

            await transaction.commit();

            // TODO: Send verification SMS/Email
            // TODO: Notify admin for driver approval

            res.status(201).json({
                status: 'success',
                message: 'Driver registration successful. Your account is pending approval. You will be notified once approved.',
                data: {
                    user_id: user.user_id,
                    driver_id: driver.driver_id,
                    requires_verification: true,
                    requires_approval: true,
                    phone: user.phone,
                    email: user.email
                }
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('Driver registration error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get Driver Profile
exports.getDriverProfile = async (req, res) => {
    try {
        const user = await User.findByPk(req.userId, {
            include: [
                {
                    model: UserRole,
                    as: 'role',
                    attributes: ['role_name']
                }
            ],
            attributes: { exclude: ['password'] }
        });

        if (!user || user.role.role_name !== 'driver') {
            return res.status(403).json({
                status: 'error',
                message: 'Access denied. Driver account required.'
            });
        }

        const driver = await Driver.findOne({
            where: { user_id: user.user_id },
            include: [
                {
                    model: Vehicle,
                    as: 'vehicles',
                    where: { is_active: true },
                    required: false
                }
            ]
        });

        if (!driver) {
            return res.status(404).json({
                status: 'error',
                message: 'Driver profile not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: {
                driver_id: driver.driver_id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone: user.phone,
                profile_picture: user.profile_picture,
                license_number: driver.license_number,
                license_expiry: driver.license_expiry,
                id_number: driver.id_number,
                rating: parseFloat(driver.rating || 0),
                total_ratings: driver.total_ratings || 0,
                is_available: driver.is_available,
                is_tracking_enabled: driver.is_tracking_enabled,
                status: driver.status,
                last_location_update: driver.last_location_update,
                current_latitude: driver.current_latitude,
                current_longitude: driver.current_longitude,
                created_at: user.created_at,
                updated_at: user.updated_at,
                vehicles: driver.vehicles
            }
        });

    } catch (error) {
        console.error('Get driver profile error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update Driver Status
exports.updateDriverStatus = async (req, res) => {
    try {
        const { status, is_available } = req.body;

        if (!status) {
            return res.status(400).json({
                status: 'error',
                message: 'Status is required'
            });
        }

        const validStatuses = ['online', 'offline', 'break', 'busy'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
            });
        }

        const driver = await Driver.findOne({
            where: { user_id: req.userId }
        });

        if (!driver) {
            return res.status(404).json({
                status: 'error',
                message: 'Driver profile not found'
            });
        }

        // Update driver status
        await driver.update({
            status,
            is_available: is_available !== undefined ? is_available : (status === 'online'),
            last_location_update: new Date()
        });

        res.status(200).json({
            status: 'success',
            message: 'Driver status updated successfully',
            data: {
                driver_id: driver.driver_id,
                status: driver.status,
                is_available: driver.is_available,
                updated_at: driver.updated_at
            }
        });

    } catch (error) {
        console.error('Update driver status error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// routes/auth.routes.js - ADD THESE ROUTES TO YOUR EXISTING auth.routes.js
/*
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const driverAuthController = require('../controllers/driver.auth.controller');
const { validate, simplifiedUserValidationRules, loginValidationRules, verificationValidationRules } = require('../middlewares/validation.middleware');
const { verifyToken } = require('../middlewares/auth.middleware');

// Existing routes...
router.post('/register', simplifiedUserValidationRules(), validate, authController.register);
router.post('/login', loginValidationRules(), validate, authController.login);

// Driver Authentication Routes
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

// Driver Profile Routes (protected)
router.get('/driver/profile', verifyToken, driverAuthController.getDriverProfile);
router.put('/driver/status', verifyToken, driverAuthController.updateDriverStatus);

// Existing routes...
router.post('/verify', [
    body('identifier').notEmpty().withMessage('Phone or email is required'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Code must be 6 digits')
], validate, authController.verifyAccount);

module.exports = router;
*/