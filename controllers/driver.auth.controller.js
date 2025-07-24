// controllers/driver.auth.controller.js - Enhanced version with complete registration
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

// Enhanced Driver Registration
exports.driverRegister = async (req, res) => {
    const transaction = await db.sequelize.transaction();

    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            await transaction.rollback();
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
            vehicle_capacity,
            vehicle_color,
            vehicle_year
        } = req.body;

        // Check if phone already exists
        const existingUser = await User.findOne({
            where: { phone },
            transaction
        });

        if (existingUser) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Phone number already registered'
            });
        }

        // Check if email already exists (if provided)
        if (email) {
            const existingEmail = await User.findOne({
                where: { email },
                transaction
            });

            if (existingEmail) {
                await transaction.rollback();
                return res.status(400).json({
                    status: 'error',
                    message: 'Email already registered'
                });
            }
        }

        // Check if license number already exists
        const existingDriver = await Driver.findOne({
            where: { license_number },
            transaction
        });

        if (existingDriver) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'License number already registered'
            });
        }

        // Check if vehicle plate already exists
        if (vehicle_plate_number) {
            const existingVehicle = await Vehicle.findOne({
                where: { plate_number: vehicle_plate_number },
                transaction
            });

            if (existingVehicle) {
                await transaction.rollback();
                return res.status(400).json({
                    status: 'error',
                    message: 'Vehicle plate number already registered'
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Get driver role
        const driverRole = await UserRole.findOne({
            where: { role_name: 'driver' },
            transaction
        });

        if (!driverRole) {
            await transaction.rollback();
            return res.status(500).json({
                status: 'error',
                message: 'Driver role not found. Please contact support.'
            });
        }

        // Create user
        const newUser = await User.create({
            first_name,
            last_name,
            phone,
            email: email || null,
            password: hashedPassword,
            role_id: driverRole.role_id,
            is_verified: false, // Requires verification
            status: 'pending_approval' // Requires admin approval
        }, { transaction });

        // Create driver profile
        const newDriver = await Driver.create({
            user_id: newUser.user_id,
            license_number,
            license_expiry: new Date(license_expiry),
            id_number,
            rating: 0.0,
            total_ratings: 0,
            is_available: false,
            is_tracking_enabled: false,
            status: 'offline',
            approval_status: 'pending' // Requires admin approval
        }, { transaction });

        // Create vehicle if provided
        let newVehicle = null;
        if (vehicle_plate_number && vehicle_model && vehicle_type && vehicle_capacity) {
            newVehicle = await Vehicle.create({
                driver_id: newDriver.driver_id,
                plate_number: vehicle_plate_number,
                vehicle_type,
                model: vehicle_model,
                capacity: parseInt(vehicle_capacity),
                color: vehicle_color || null,
                year: vehicle_year || null,
                is_air_conditioned: false, // Default value
                status: 'pending_inspection', // Requires inspection
                is_active: false // Will be activated after approval
            }, { transaction });
        }

        await transaction.commit();

        // Generate verification code (6 digits)
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Save verification code (you might want to create a separate table for this)
        await User.update(
            { verification_code: verificationCode },
            { where: { user_id: newUser.user_id } }
        );

        // TODO: Send SMS verification code
        console.log(`Verification code for ${phone}: ${verificationCode}`);

        // TODO: Send email notification to admin about new driver registration
        console.log(`New driver registration: ${first_name} ${last_name} - ${phone}`);

        res.status(201).json({
            status: 'success',
            message: 'Driver registration successful. Please verify your phone number and wait for admin approval.',
            data: {
                user_id: newUser.user_id,
                driver_id: newDriver.driver_id,
                phone: newUser.phone,
                verification_required: true,
                approval_required: true,
                vehicle_created: newVehicle !== null
            }
        });

    } catch (error) {
        await transaction.rollback();
        console.error('Driver registration error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Driver Login (enhanced)
exports.driverLogin = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { phone, password, remember_me = false } = req.body;

        // Find user by phone and check if they are a driver
        const user = await User.findOne({
            where: { phone },
            attributes: ['user_id', 'first_name', 'last_name', 'email', 'phone', 'profile_picture', 'status', 'is_verified', 'password', 'created_at', 'updated_at'],
            include: [
                {
                    model: UserRole,
                    as: 'role',
                    attributes: ['role_name']
                },
                {
                    model: Driver,
                    as: 'driverProfile',
                    include: [
                        {
                            model: Vehicle,
                            as: 'Vehicles',
                            where: { is_active: true },
                            required: false
                        }
                    ]
                }
            ]
        });

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
                message: 'Please verify your account first.',
                requires_verification: true
            });
        }

        // Check approval status
        const driver = user.driverProfile;
        if (!driver) {
            return res.status(403).json({
                status: 'error',
                message: 'Driver profile not found'
            });
        }

        if (driver.approval_status === 'pending') {
            return res.status(403).json({
                status: 'error',
                message: 'Your driver account is pending approval. Please wait for admin approval.',
                approval_status: 'pending'
            });
        }

        if (driver.approval_status === 'rejected') {
            return res.status(403).json({
                status: 'error',
                message: 'Your driver account has been rejected. Please contact support.',
                approval_status: 'rejected'
            });
        }

        if (user.status === 'suspended') {
            return res.status(403).json({
                status: 'error',
                message: 'Your account has been suspended. Please contact support.',
                account_status: 'suspended'
            });
        }

        // Update last login
        await user.update({ last_login: new Date() });

        // Generate JWT token
        const token = generateToken(user, driver);

        // Get primary vehicle
        const primaryVehicle = driver.Vehicles && driver.Vehicles.length > 0
            ? driver.Vehicles[0]
            : null;

        // Set token expiration
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
                    User: {
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        phone: user.phone,
                        profile_picture: user.profile_picture
                    },
                    license_number: driver.license_number,
                    license_expiry: driver.license_expiry,
                    id_number: driver.id_number,
                    rating: parseFloat(driver.rating || 0),
                    total_ratings: driver.total_ratings || 0,
                    is_available: driver.is_available,
                    is_tracking_enabled: driver.is_tracking_enabled,
                    status: driver.status,
                    approval_status: driver.approval_status,
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
                    status: primaryVehicle.status
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

// Get Driver Profile
exports.getDriverProfile = async (req, res) => {
    try {
        const driverId = req.driver_id;

        const driver = await Driver.findOne({
            where: { driver_id: driverId },
            include: [
                {
                    model: User,
                    as: 'User',
                    attributes: ['first_name', 'last_name', 'email', 'phone', 'profile_picture', 'created_at', 'updated_at']
                },
                {
                    model: Vehicle,
                    as: 'Vehicles',
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

        res.json({
            status: 'success',
            data: {
                driver_id: driver.driver_id,
                User: driver.User,
                license_number: driver.license_number,
                license_expiry: driver.license_expiry,
                id_number: driver.id_number,
                rating: parseFloat(driver.rating || 0),
                total_ratings: driver.total_ratings || 0,
                is_available: driver.is_available,
                is_tracking_enabled: driver.is_tracking_enabled,
                status: driver.status,
                approval_status: driver.approval_status,
                last_location_update: driver.last_location_update,
                current_latitude: driver.current_latitude,
                current_longitude: driver.current_longitude,
                created_at: driver.created_at,
                updated_at: driver.updated_at,
                vehicles: driver.Vehicles || []
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
        const driverId = req.driver_id;
        const { status, is_available } = req.body;

        const driver = await Driver.findOne({
            where: { driver_id: driverId }
        });

        if (!driver) {
            return res.status(404).json({
                status: 'error',
                message: 'Driver not found'
            });
        }

        // Update driver status
        await driver.update({
            status: status || driver.status,
            is_available: is_available !== undefined ? is_available : driver.is_available,
            last_status_update: new Date()
        });

        res.json({
            status: 'success',
            message: 'Driver status updated successfully',
            data: {
                driver_id: driver.driver_id,
                status: driver.status,
                is_available: driver.is_available,
                last_status_update: driver.last_status_update
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