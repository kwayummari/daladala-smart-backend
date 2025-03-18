const db = require('../models');
const User = db.User;
const bcrypt = require('bcrypt');

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      attributes: { exclude: ['password', 'verification_token', 'reset_token', 'reset_token_expires'] },
      include: [{
        model: db.UserRole,
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

    res.status(200).json({
      status: 'success',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
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

    // Update fields
    const updateData = {};
    
    if (req.body.first_name) updateData.first_name = req.body.first_name;
    if (req.body.last_name) updateData.last_name = req.body.last_name;
    if (req.body.email) updateData.email = req.body.email;
    if (req.body.profile_picture) updateData.profile_picture = req.body.profile_picture;

    await user.update(updateData);

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        profile_picture: user.profile_picture
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Check current password
    const passwordIsValid = await bcrypt.compare(current_password, user.password);

    if (!passwordIsValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    await user.update({
      password: hashedPassword
    });

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Delete account
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Soft delete by updating status
    await user.update({
      status: 'deleted'
    });

    res.status(200).json({
      status: 'success',
      message: 'Account deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await db.Notification.findAll({
      where: {
        user_id: req.userId
      },
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      status: 'success',
      data: notifications
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Mark notification as read
// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
    try {
      const { notification_id } = req.params;
  
      const notification = await db.Notification.findOne({
        where: {
          notification_id,
          user_id: req.userId
        }
      });
  
      if (!notification) {
        return res.status(404).json({
          status: 'error',
          message: 'Notification not found'
        });
      }
  
      await notification.update({
        is_read: true,
        read_at: new Date()
      });
  
      res.status(200).json({
        status: 'success',
        message: 'Notification marked as read'
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  };
  
  // Mark all notifications as read
  exports.markAllNotificationsAsRead = async (req, res) => {
    try {
      await db.Notification.update(
        {
          is_read: true,
          read_at: new Date()
        },
        {
          where: {
            user_id: req.userId,
            is_read: false
          }
        }
      );
  
      res.status(200).json({
        status: 'success',
        message: 'All notifications marked as read'
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  };