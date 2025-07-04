// controllers/auth.controller.js
const db = require('../models');
const User = db.User;
const UserRole = db.UserRole;
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');
const { sendSMS } = require('../services/sms.service');
const { sendEmail } = require('../services/email.service');
const crypto = require('crypto');
const { Op } = require('sequelize');

function formatPhoneForSMS(phone) {
  if (phone.startsWith('0')) {
    return '255' + phone.slice(1);
  }
  return phone;
}


// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Register new user
exports.register = async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    // Check if phone already exists
    const existingPhone = await User.findOne({
      where: { phone: phone }
    });

    if (existingPhone) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number is already registered'
      });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({
      where: { email: email }
    });

    if (existingEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'Email address is already registered'
      });
    }

    // Find default role (passenger)
    const passengerRole = await UserRole.findOne({
      where: { role_name: 'passenger' }
    });

    if (!passengerRole) {
      return res.status(500).json({
        status: 'error',
        message: 'Default user role not found'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification codes
    const phoneVerificationCode = generateVerificationCode();
    const emailVerificationCode = generateVerificationCode();

    // Create user
    const user = await User.create({
      role_id: passengerRole.role_id,
      first_name: '',
      last_name: '', 
      phone: phone,
      email: email,
      password: hashedPassword,
      phone_verification_code: phoneVerificationCode,
      email_verification_code: emailVerificationCode,
      phone_verified: false,
      email_verified: false,
      is_verified: false,
      status: 'pending', // User status pending until verified
      verification_code_expires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });

    // Send SMS verification
    try {
      await sendSMS({
        phone: formatPhoneForSMS(phone),
        message: `Your Daladala Smart verification code is: ${phoneVerificationCode}. Valid for 10 minutes.`
      });
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      // Continue with registration even if SMS fails
    }

    // Send Email verification
    try {
      await sendEmail({
        to: email,
        subject: 'Verify Your Daladala Smart Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c5530;">Welcome to Daladala Smart!</h2>
            <p>Thank you for registering with Daladala Smart. Please verify your email address to complete your registration.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <h3 style="color: #2c5530; margin: 0;">Your Verification Code</h3>
              <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 10px 0;">${emailVerificationCode}</h1>
              <p style="color: #6c757d; margin: 0;">This code expires in 10 minutes</p>
            </div>
            
            <p>If you didn't create this account, please ignore this email.</p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #dee2e6;">
            <p style="color: #6c757d; font-size: 12px;">
              This is an automated message from Daladala Smart. Please do not reply to this email.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue with registration even if email fails
    }

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please check your phone and email for verification codes.',
      data: {
        user_id: user.user_id,
        phone: user.phone,
        email: user.email,
        verification_required: true
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Registration failed. Please try again.'
    });
  }
};

// Verify phone number
exports.verifyPhone = async (req, res) => {
  try {
    const { phone, code } = req.body;

    const user = await User.findOne({
      where: {
        phone: phone,
        phone_verification_code: code
      }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid verification code'
      });
    }

    // Check if code is expired
    if (user.verification_code_expires < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification code has expired'
      });
    }

    // Update user
    await user.update({
      phone_verified: true,
      phone_verification_code: null,
      is_verified: user.email_verified, // Only fully verified if both are verified
      status: user.email_verified ? 'active' : 'pending'
    });

    res.status(200).json({
      status: 'success',
      message: 'Phone number verified successfully',
      data: {
        phone_verified: true,
        fully_verified: user.email_verified
      }
    });

  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Verification failed. Please try again.'
    });
  }
};

// Verify email
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({
      where: {
        email: email,
        email_verification_code: code
      }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid verification code'
      });
    }

    // Check if code is expired
    if (user.verification_code_expires < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification code has expired'
      });
    }

    // Update user
    await user.update({
      email_verified: true,
      email_verification_code: null,
      is_verified: user.phone_verified, // Only fully verified if both are verified
      status: user.phone_verified ? 'active' : 'pending'
    });

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully',
      data: {
        email_verified: true,
        fully_verified: user.phone_verified
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Verification failed. Please try again.'
    });
  }
};

// Resend verification codes
exports.resendVerificationCode = async (req, res) => {
  try {
    const { phone, email, type } = req.body; // type: 'phone' or 'email'

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { phone: phone },
          { email: email }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Generate new verification code
    const newCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    if (type === 'phone') {
      await user.update({
        phone_verification_code: newCode,
        verification_code_expires: expiresAt
      });

      // Send SMS
      try {
        await sendSMS({
          phone: formatPhoneForSMS(user.phone),
          message: `Your new Daladala Smart verification code is: ${newCode}. Valid for 10 minutes.`
        });
      } catch (smsError) {
        console.error('SMS resend failed:', smsError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to send SMS. Please try again.'
        });
      }

    } else if (type === 'email') {
      await user.update({
        email_verification_code: newCode,
        verification_code_expires: expiresAt
      });

      // Send Email
      try {
        await sendEmail({
          to: user.email,
          subject: 'New Verification Code - Daladala Smart',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5530;">New Verification Code</h2>
              <p>You requested a new verification code for your Daladala Smart account.</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <h3 style="color: #2c5530; margin: 0;">Your New Verification Code</h3>
                <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 10px 0;">${newCode}</h1>
                <p style="color: #6c757d; margin: 0;">This code expires in 10 minutes</p>
              </div>
              
              <p>If you didn't request this, please ignore this email.</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Email resend failed:', emailError);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to send email. Please try again.'
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: `New verification code sent to your ${type}`
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to resend verification code'
    });
  }
};

// Login user (updated to check verification)
exports.login = async (req, res) => {
  try {
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { phone: req.body.phone },
          { email: req.body.phone } // Allow login with email or phone
        ]
      },
      include: ['role']
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
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

    // Check if user is verified
    if (!user.is_verified) {
      return res.status(403).json({
        status: 'error',
        message: 'Account not verified. Please verify your phone and email first.',
        data: {
          phone_verified: user.phone_verified,
          email_verified: user.email_verified,
          requires_verification: true
        }
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        status: 'error',
        message: 'Account is not active'
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
        phone: user.phone,
        email: user.email,
        role: user.role.role_name,
        profile_picture: user.profile_picture,
        phone_verified: user.phone_verified,
        email_verified: user.email_verified,
        accessToken: token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
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
        [Op.or]: [
          { phone: phone },
          { email: phone } // Allow email or phone
        ]
      }
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        status: 'success',
        message: 'If your phone/email is registered, you will receive a password reset code'
      });
    }

    // Generate password reset code
    const resetCode = generateVerificationCode();
    const resetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Update user with reset code
    await user.update({
      phone_verification_code: resetCode, // Reuse the phone verification field
      verification_code_expires: resetExpires
    });

    // Send reset code via SMS
    try {
      await sendSMS({
        phone: user.phone,
        message: `Your Daladala Smart password reset code is: ${resetCode}. Valid for 30 minutes.`
      });
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send reset code. Please try again.'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Password reset code sent to your phone'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to process password reset request'
    });
  }
};

// Reset password with code
exports.resetPassword = async (req, res) => {
  try {
    const { phone, code, new_password } = req.body;

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { phone: phone },
          { email: phone }
        ],
        phone_verification_code: code
      }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid reset code'
      });
    }

    // Check if code is expired
    if (user.verification_code_expires < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Reset code has expired'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update user password and clear reset code
    await user.update({
      password: hashedPassword,
      phone_verification_code: null,
      verification_code_expires: null
    });

    res.status(200).json({
      status: 'success',
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to reset password'
    });
  }
};

// Verify user (if you still need this for backward compatibility)
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
      verification_token: null,
      status: 'active'
    });

    res.status(200).json({
      status: 'success',
      message: 'Account verified successfully'
    });
  } catch (error) {
    console.error('User verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Verification failed'
    });
  }
};