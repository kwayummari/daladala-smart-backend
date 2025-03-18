const db = require('../models');
const User = db.User;
const UserRole = db.UserRole;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');

// Register new user
exports.register = async (req, res) => {
  try {
    // Check if phone already exists
    const existingUser = await User.findOne({
      where: {
        phone: req.body.phone
      }
    });

    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is already in use'
      });
    }

    // Find default role (passenger)
    const passengerRole = await UserRole.findOne({
      where: {
        role_name: 'passenger'
      }
    });

    if (!passengerRole) {
      return res.status(500).json({
        status: 'error',
        message: 'Default user role not found'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // Create user
    const user = await User.create({
      role_id: passengerRole.role_id,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      phone: req.body.phone,
      password: hashedPassword,
      is_verified: false,
      status: 'active'
    });

    // Generate verification token
    // TODO: Implement SMS verification

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      data: {
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        phone: req.body.phone
      },
      include: ['role']
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        status: 'error',
        message: 'Account is not active'
      });
    }

    // Check password
    const passwordIsValid = await bcrypt.compare(req.body.password, user.password);

    if (!passwordIsValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid password'
      });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.user_id }, config.secret, {
      expiresIn: config.jwtExpiration
    });

    // Update last login
    await user.update({
      last_login: new Date()
    });

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role.role_name,
        profile_picture: user.profile_picture,
        accessToken: token
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Verify user
exports.verifyUser = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      where: {
        verification_token: token
      }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid verification token'
      });
    }

    await user.update({
      is_verified: true,
      verification_token: null
    });

    res.status(200).json({
      status: 'success',
      message: 'Account verified successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Request password reset
exports.requestPasswordReset = async (req, res) => {
  try {
    const { phone } = req.body;

    const user = await User.findOne({
      where: {
        phone
      }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Generate reset token
    const resetToken = Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

    // Set expiration to 1 hour from now
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 1);

    await user.update({
      reset_token: resetToken,
      reset_token_expires: resetTokenExpires
    });

    // TODO: Send reset token via SMS

    res.status(200).json({
      status: 'success',
      message: 'Password reset instructions sent to your phone'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_token_expires: {
          [db.Sequelize.Op.gt]: new Date()
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    await user.update({
      password: hashedPassword,
      reset_token: null,
      reset_token_expires: null
    });

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};