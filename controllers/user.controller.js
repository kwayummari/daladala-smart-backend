// controllers/user.controller.js
const db = require('../models');
const User = db.User;
const UserRole = db.UserRole;
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// const { optimizeImage } = require('./../middleware/image.middleware');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/profiles';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: {
        exclude: ['password', 'verification_token', 'reset_token', 'reset_token_expires', 'verification_code']
      },
      include: [{
        model: UserRole,
        as: 'role',
        attributes: ['role_id', 'role_name']
      }]
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Format profile picture URL if exists
    const userData = user.toJSON();
    if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
      userData.profile_picture = `${process.env.APP_URL || 'http://localhost:3000'}/uploads/profiles/${userData.profile_picture}`;
    }

    // 🔥 FIX: Return user data in correct format for mobile app
    res.status(200).json({
      status: 'success',
      data: {
        id: userData.user_id,
        first_name: userData.first_name || '',  // ✅ Include first_name
        last_name: userData.last_name || '',    // ✅ Include last_name
        phone: userData.phone,
        email: userData.email,
        profile_picture: userData.profile_picture,
        role: userData.role.role_name,
        is_verified: userData.is_verified,
        created_at: userData.created_at,
        last_login: userData.last_login
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: {
        exclude: ['password', 'verification_token', 'reset_token', 'reset_token_expires', 'verification_code']
      },
      include: [{
        model: UserRole,
        as: 'role',
        attributes: ['role_id', 'role_name']
      }]
    });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Format profile picture URL if exists
    const userData = user.toJSON();
    if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
      userData.profile_picture = `${process.env.APP_URL || 'http://localhost:3000'}/uploads/profiles/${userData.profile_picture}`;
    }

    res.status(200).json({
      status: 'success',
      data: userData
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Validate and sanitize input data
    const { first_name, last_name, email, profile_picture } = req.body;

    // Validation rules
    if (first_name !== undefined) {
      if (typeof first_name !== 'string' || first_name.trim().length < 2 || first_name.trim().length > 50) {
        return res.status(400).json({
          status: 'error',
          message: 'First name must be between 2 and 50 characters'
        });
      }
    }

    if (last_name !== undefined) {
      if (typeof last_name !== 'string' || last_name.trim().length < 2 || last_name.trim().length > 50) {
        return res.status(400).json({
          status: 'error',
          message: 'Last name must be between 2 and 50 characters'
        });
      }
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !isValidEmail(email)) {
        return res.status(400).json({
          status: 'error',
          message: 'Please provide a valid email address'
        });
      }

      // Check if email is already taken by another user
      if (email !== user.email) {
        const existingUser = await User.findOne({
          where: {
            email: email.toLowerCase(),
            user_id: { [db.Sequelize.Op.ne]: req.userId }
          }
        });

        if (existingUser) {
          return res.status(400).json({
            status: 'error',
            message: 'This email address is already registered to another account'
          });
        }
      }
    }

    // Prepare update data
    const updateData = {};

    if (first_name !== undefined) {
      updateData.first_name = first_name.trim();
    }
    if (last_name !== undefined) {
      updateData.last_name = last_name.trim();
    }
    if (email !== undefined) {
      updateData.email = email.trim().toLowerCase();
    }
    if (profile_picture !== undefined) {
      updateData.profile_picture = profile_picture;
    }

    // Update user
    await user.update(updateData);

    // Fetch updated user with role
    const updatedUser = await User.findByPk(req.userId, {
      attributes: {
        exclude: ['password', 'verification_token', 'reset_token', 'reset_token_expires', 'verification_code']
      },
      include: [{
        model: UserRole,
        as: 'role',
        attributes: ['role_id', 'role_name']
      }]
    });

    // Format profile picture URL
    const userData = updatedUser.toJSON();
    if (userData.profile_picture && !userData.profile_picture.startsWith('http')) {
      userData.profile_picture = `${process.env.APP_URL || 'http://localhost:3000'}/uploads/profiles/${userData.profile_picture}`;
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: userData
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Upload profile picture
exports.uploadAvatar = [
  upload.single('avatar'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No file uploaded'
        });
      }

      const user = await User.findByPk(req.userId);
      if (!user) {
        // Delete uploaded file if user not found
        fs.unlinkSync(req.file.path);
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // Delete old profile picture if exists
      if (user.profile_picture && !user.profile_picture.startsWith('http')) {
        const oldImagePath = path.join(__dirname, '../uploads/profiles', user.profile_picture);
        if (fs.existsSync(oldImagePath)) {
          try {
            fs.unlinkSync(oldImagePath);
          } catch (err) {
            console.warn('Failed to delete old profile picture:', err);
          }
        }
      }

      // Update user with new profile picture
      const filename = req.file.filename;
      await user.update({ profile_picture: filename });

      const profilePictureUrl = `${process.env.APP_URL || 'http://localhost:3000'}/uploads/profiles/${filename}`;

      res.status(200).json({
        status: 'success',
        message: 'Profile picture uploaded successfully',
        data: {
          profile_picture: profilePictureUrl
        }
      });
    } catch (error) {
      console.error('Upload avatar error:', error);

      // Delete uploaded file if error occurs
      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.warn('Failed to cleanup uploaded file:', err);
        }
      }

      if (error.message === 'Only image files are allowed!') {
        return res.status(400).json({
          status: 'error',
          message: 'Only image files are allowed'
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Failed to upload profile picture'
      });
    }
  }
];

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    // Validation
    if (!current_password || !new_password) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password and new password are required'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(current_password, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(new_password, 10);

    // Update password
    await user.update({ password: hashedNewPassword });

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        status: 'error',
        message: 'Password is required to delete account'
      });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Incorrect password'
      });
    }

    // Delete profile picture if exists
    if (user.profile_picture && !user.profile_picture.startsWith('http')) {
      const imagePath = path.join(__dirname, '../uploads/profiles', user.profile_picture);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (err) {
          console.warn('Failed to delete profile picture:', err);
        }
      }
    }

    // Instead of deleting, mark as deleted (soft delete)
    await user.update({
      status: 'deleted',
      email: null,
      profile_picture: null,
      first_name: 'Deleted',
      last_name: 'User'
    });

    res.status(200).json({
      status: 'success',
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Get notifications (placeholder)
exports.getNotifications = async (req, res) => {
  try {
    // This would typically fetch from a notifications table
    // For now, return empty array
    res.status(200).json({
      status: 'success',
      data: []
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Mark notification as read (placeholder)
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { notification_id } = req.params;

    // This would typically update a notifications table
    // For now, just return success
    res.status(200).json({
      status: 'success',
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Mark all notifications as read (placeholder)
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    // This would typically update a notifications table
    // For now, just return success
    res.status(200).json({
      status: 'success',
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

// Helper function to validate email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  getProfile: exports.getProfile,
  getCurrentUser: exports.getCurrentUser,
  updateProfile: exports.updateProfile,
  uploadAvatar: exports.uploadAvatar,
  changePassword: exports.changePassword,
  deleteAccount: exports.deleteAccount,
  getNotifications: exports.getNotifications,
  markNotificationAsRead: exports.markNotificationAsRead,
  markAllNotificationsAsRead: exports.markAllNotificationsAsRead
};