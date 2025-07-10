// controllers/auth.controller.js - FIXED VERSION with SMS/Email
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../models');
const config = require('../config/auth.config');
const crypto = require('crypto');
const { Op } = require('sequelize');

// Import your existing SMS and Email services
const { sendSMS } = require('../services/sms.service');
const { sendEmail } = require('../services/email.service');

const User = db.User;
const UserRole = db.UserRole;
const Driver = db.Driver;

// Use your existing phone formatting function
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

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.user_id,
      phone: user.phone,
      email: user.email,
      role: user.role?.role_name || 'passenger'
    },
    config.secret,
    { expiresIn: config.jwtExpiration }
  );
};

// Enhanced register with national ID requirement + SMS/Email
exports.register = async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      email,
      phone,
      password,
      role = 'passenger',
      national_id // Required field
    } = req.body;

    // Validate national ID
    if (!national_id || national_id.length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'National ID is required and must be at least 10 characters'
      });
    }

    // Check if user already exists (phone, email, or national_id)
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { phone: phone },
          email ? { email: email } : {},
          { national_id: national_id }
        ]
      }
    });

    if (existingUser) {
      let conflictField = 'phone number';
      if (existingUser.email === email) conflictField = 'email';
      if (existingUser.national_id === national_id) conflictField = 'national ID';

      return res.status(409).json({
        status: 'error',
        message: `User with this ${conflictField} already exists`
      });
    }

    // Get role ID
    const userRole = await UserRole.findOne({ where: { role_name: role } });
    if (!userRole) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid role specified'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate verification code (single code for both SMS and email)
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = await User.create({
      role_id: userRole.role_id,
      first_name: first_name || '',
      last_name: last_name || '',
      email,
      phone,
      password: hashedPassword,
      national_id,
      verification_code: verificationCode,
      verification_code_expires: verificationExpires,
      is_verified: false,
      status: 'pending' // User pending until verified
    });

    // Send SMS verification
    try {
      const formattedPhone = formatPhoneForSMS(phone);
      await sendSMS({
        phone: formattedPhone,
        message: `${verificationCode} is your Daladala Smart verification code. Valid for 10 minutes.`
      });
      console.log('✅ SMS sent successfully to:', formattedPhone);
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      // Continue with registration even if SMS fails
    }

    // Send Email verification (same code) if email provided
    if (email) {
      try {
        await sendEmail({
          to: email,
          subject: 'Verify Your Daladala Smart Account',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5530;">Welcome to Daladala Smart!</h2>
              <p>Thank you for registering with Daladala Smart. Please verify your account with the code below.</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                <h3 style="color: #2c5530; margin: 0;">Your Verification Code</h3>
                <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 10px 0;">${verificationCode}</h1>
                <p style="color: #6c757d; margin: 0;">Enter this code in the app to verify your account</p>
                <p style="color: #6c757d; margin: 5px 0 0 0; font-size: 14px;">Code expires in 10 minutes</p>
              </div>
              
              <div style="background-color: #e7f3ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="color: #0066cc; margin: 0; font-size: 14px;">
                  📱 <strong>Note:</strong> The same code was sent to your phone ${phone} via SMS for your convenience.
                </p>
              </div>
              
              <p>If you didn't create this account, please ignore this email.</p>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d; font-size: 12px;">
                This is an automated message from Daladala Smart. Please do not reply to this email.
              </p>
            </div>
          `
        });
        console.log('✅ Email sent successfully to:', email);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Continue with registration even if email fails
      }
    }

    res.status(201).json({
      status: 'success',
      message: 'Registration successful. Please check your phone and email for the verification code.',
      data: {
        user_id: user.user_id,
        phone: user.phone,
        email: user.email,
        requires_verification: true,
        verification_sent_to: email ? 'Both phone and email' : 'Phone only'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Enhanced login supporting both phone and email
exports.login = async (req, res) => {
  try {
    const { identifier, password, remember_me = false } = req.body;
    // identifier can be phone or email

    if (!identifier || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone/email and password are required'
      });
    }

    // Find user by phone or email
    const whereCondition = identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier };

    const user = await User.findOne({
      where: whereCondition,
      include: [
        {
          model: UserRole,
          as: 'role',
          attributes: ['role_name']
        }
      ]
    });

    console.log(user, "=============");

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
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
        message: 'Please verify your account first. Check your phone and email for verification code.',
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

    // Update last login
    await user.update({ last_login: new Date() });

    // Generate JWT token
    const token = generateToken(user);

    // Get additional info if user is a driver
    let driverInfo = null;
    if (user.role.role_name === 'driver') {
      driverInfo = await Driver.findOne({
        where: { user_id: user.user_id },
        attributes: ['driver_id', 'license_number', 'rating', 'is_available', 'status']
      });
    }

    // Set token expiration based on remember_me
    const tokenExpiration = remember_me ? '30d' : '24h';

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        accessToken: token,
        tokenType: 'Bearer',
        expiresIn: tokenExpiration,
        user: {
          id: user.user_id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          profile_picture: user.profile_picture,
          role: user.role.role_name,
          is_verified: user.is_verified,
          national_id: user.national_id,
          created_at: user.created_at,
          last_login: user.last_login
        },
        driver_info: driverInfo
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify account with code (enhanced)
exports.verifyAccount = async (req, res) => {
  try {
    const { identifier, code } = req.body; // identifier can be phone or email

    // Find user by phone or email with matching verification code
    const whereCondition = identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier };

    const user = await User.findOne({
      where: {
        ...whereCondition,
        verification_code: code
      },
      include: [
        {
          model: UserRole,
          as: 'role',
          attributes: ['role_name']
        }
      ]
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid verification code'
      });
    }

    // Check if code is expired
    if (user.verification_code_expires && user.verification_code_expires < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Verification code has expired. Please request a new one.'
      });
    }

    // Update user status and clear verification code
    await user.update({
      is_verified: true,
      status: 'active',
      verification_code: null,
      verification_code_expires: null
    });

    // Generate token for immediate login after verification
    const token = generateToken(user);

    // Send welcome notification
    try {
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: 'Welcome to Daladala Smart! Account Verified',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5530;">Welcome to Daladala Smart!</h2>
              <p>Congratulations! Your account has been successfully verified.</p>
              
              <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #155724; margin: 0;">Your Account is Ready!</h3>
                <p style="margin: 10px 0;">You can now enjoy all features of Daladala Smart:</p>
                <ul style="color: #155724;">
                  <li>Book trips with seat selection</li>
                  <li>Track your rides in real-time</li>
                  <li>Access digital tickets and receipts</li>
                  <li>Pre-book trips up to 30 days in advance</li>
                </ul>
              </div>
              
              <p>Thank you for choosing Daladala Smart for your transportation needs!</p>
            </div>
          `
        });
      }

      const formattedPhone = formatPhoneForSMS(user.phone);
      await sendSMS({
        phone: formattedPhone,
        message: `Welcome to Daladala Smart! Your account is now verified and ready to use. Start booking your trips now!`
      });
    } catch (notificationError) {
      console.error('Welcome notification failed:', notificationError);
      // Don't fail verification if notifications fail
    }

    res.status(200).json({
      status: 'success',
      message: 'Account verified successfully! Welcome to Daladala Smart!',
      data: {
        accessToken: token,
        tokenType: 'Bearer',
        user: {
          id: user.user_id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          profile_picture: user.profile_picture,
          role: user.role.role_name,
          is_verified: true,
          national_id: user.national_id,
          created_at: user.created_at
        }
      }
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error during verification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Resend verification code (enhanced)
exports.resendVerificationCode = async (req, res) => {
  try {
    const { identifier } = req.body; // phone or email

    const whereCondition = identifier.includes('@')
      ? { email: identifier }
      : { phone: identifier };

    const user = await User.findOne({ where: whereCondition });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    if (user.status === 'active' && user.is_verified) {
      return res.status(400).json({
        status: 'error',
        message: 'Account is already verified'
      });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await user.update({
      verification_code: verificationCode,
      verification_code_expires: verificationExpires
    });

    // Send SMS
    try {
      const formattedPhone = formatPhoneForSMS(user.phone);
      await sendSMS({
        phone: formattedPhone,
        message: `${verificationCode} is your new Daladala Smart verification code. Valid for 10 minutes.`
      });
      console.log('✅ SMS resent successfully');
    } catch (smsError) {
      console.error('SMS resend failed:', smsError);
    }

    // Send Email if available
    if (user.email) {
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
                <h1 style="color: #007bff; font-size: 32px; letter-spacing: 5px; margin: 10px 0;">${verificationCode}</h1>
                <p style="color: #6c757d; margin: 0;">Code expires in 10 minutes</p>
              </div>
              
              <p>If you didn't request this, please ignore this email.</p>
            </div>
          `
        });
        console.log('✅ Email resent successfully');
      } catch (emailError) {
        console.error('Email resend failed:', emailError);
      }
    }

    res.status(200).json({
      status: 'success',
      message: user.email
        ? 'New verification code sent to both your phone and email'
        : 'New verification code sent to your phone'
    });

  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Request password reset (enhanced)
exports.requestPasswordReset = async (req, res) => {
  try {
    const { phone } = req.body; // This can be phone or email

    const whereCondition = phone.includes('@')
      ? { email: phone }
      : { phone: phone };

    const user = await User.findOne({ where: whereCondition });

    if (!user) {
      // Don't reveal if user exists or not for security
      return res.status(200).json({
        status: 'success',
        message: 'If your phone/email is registered, you will receive a password reset code'
      });
    }

    // Generate reset code
    const resetCode = generateVerificationCode();
    const resetExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await user.update({
      verification_code: resetCode,
      verification_code_expires: resetExpires
    });

    // Send reset code via SMS
    try {
      const formattedPhone = formatPhoneForSMS(user.phone);
      await sendSMS({
        phone: formattedPhone,
        message: `Your Daladala Smart password reset code is: ${resetCode}. Valid for 30 minutes. Do not share this code.`
      });
      console.log('✅ Password reset SMS sent');
    } catch (smsError) {
      console.error('SMS sending failed:', smsError);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to send reset code. Please try again.'
      });
    }

    // Send reset code via email if available
    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Password Reset Code - Daladala Smart',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5530;">Password Reset Request</h2>
              <p>You requested to reset your Daladala Smart account password.</p>
              
              <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 1px solid #ffeaa7;">
                <h3 style="color: #856404; margin: 0;">Your Password Reset Code</h3>
                <h1 style="color: #e17055; font-size: 32px; letter-spacing: 5px; margin: 10px 0;">${resetCode}</h1>
                <p style="color: #856404; margin: 0;">Code expires in 30 minutes</p>
              </div>
              
              <div style="background-color: #f8d7da; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #f5c6cb;">
                <p style="color: #721c24; margin: 0; font-size: 14px;">
                  <strong>Security Notice:</strong> Do not share this code with anyone. If you didn't request this, please ignore this email and your password will remain unchanged.
                </p>
              </div>
              
              <p>Enter this code in the app along with your new password to complete the reset.</p>
            </div>
          `
        });
        console.log('✅ Password reset email sent');
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Password reset code sent to your phone' + (user.email ? ' and email' : '')
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Reset password with code (enhanced)
exports.resetPassword = async (req, res) => {
  try {
    const { phone, code, new_password } = req.body;

    const whereCondition = phone.includes('@')
      ? { email: phone }
      : { phone: phone };

    const user = await User.findOne({
      where: {
        ...whereCondition,
        verification_code: code
      }
    });

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid reset code'
      });
    }

    // Check if code is expired
    if (user.verification_code_expires && user.verification_code_expires < new Date()) {
      return res.status(400).json({
        status: 'error',
        message: 'Reset code has expired. Please request a new one.'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(new_password, salt);

    // Update password and clear reset code
    await user.update({
      password: hashedPassword,
      verification_code: null,
      verification_code_expires: null
    });

    // Send confirmation notifications
    try {
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: 'Password Changed Successfully - Daladala Smart',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2c5530;">Password Changed Successfully</h2>
              
              <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #c3e6cb;">
                <p style="color: #155724; margin: 0;">
                  Your Daladala Smart account password has been successfully changed.
                </p>
              </div>
              
              <p>If you didn't make this change, please contact our support team immediately.</p>
              
              <p>For your security:</p>
              <ul>
                <li>Use a strong, unique password</li>
                <li>Don't share your password with anyone</li>
                <li>Log out from shared devices</li>
              </ul>
            </div>
          `
        });
      }

      const formattedPhone = formatPhoneForSMS(user.phone);
      await sendSMS({
        phone: formattedPhone,
        message: `Your Daladala Smart password has been changed successfully. If you didn't make this change, contact support immediately.`
      });
    } catch (notificationError) {
      console.error('Password change notification failed:', notificationError);
      // Don't fail password reset if notifications fail
    }

    res.status(200).json({
      status: 'success',
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get current user profile
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: [
        {
          model: UserRole,
          as: 'role',
          attributes: ['role_name']
        }
      ],
      attributes: { exclude: ['password', 'verification_code', 'reset_token'] }
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Get driver info if applicable
    let driverInfo = null;
    if (user.role.role_name === 'driver') {
      driverInfo = await Driver.findOne({
        where: { user_id: user.user_id },
        attributes: ['driver_id', 'license_number', 'rating', 'is_available', 'status', 'experience_years']
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user.user_id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
          national_id: user.national_id,
          profile_picture: user.profile_picture,
          role: user.role.role_name,
          is_verified: user.is_verified,
          created_at: user.created_at,
          last_login: user.last_login
        },
        driver_info: driverInfo
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};