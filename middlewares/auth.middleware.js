const jwt = require('jsonwebtoken');
const config = require('../config/auth.config');
const db = require('../models');
const User = db.User;

verifyToken = async (req, res, next) => {
  const token = req.headers['x-access-token'] || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(403).json({
      status: 'error',
      message: 'No token provided!'
    });
  }

  try {
    const decoded = jwt.verify(token, config.secret);
    req.userId = decoded.id;

    // Check if user exists and is active
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found!'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        status: 'error',
        message: 'Account is not active!'
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized!'
    });
  }
};

isAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: ['role']
    });

    if (user.role.role_name === 'admin') {
      next();
      return;
    }

    res.status(403).json({
      status: 'error',
      message: 'Require Admin Role!'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

isDriver = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: ['role']
    });

    if (user.role.role_name === 'driver') {
      next();
      return;
    }

    res.status(403).json({
      status: 'error',
      message: 'Require Driver Role!'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

isOperator = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: ['role']
    });

    if (user.role.role_name === 'operator') {
      next();
      return;
    }

    res.status(403).json({
      status: 'error',
      message: 'Require Operator Role!'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

const authMiddleware = {
  verifyToken,
  isAdmin,
  isDriver,
  isOperator
};

module.exports = authMiddleware;