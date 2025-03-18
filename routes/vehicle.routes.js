const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin, isOperator } = require('../middlewares/auth.middleware');

// Define the vehicle controller
const vehicleController = {
  getAllVehicles: async (req, res) => {
    try {
      const vehicles = await db.Vehicle.findAll({
        include: [{
          model: db.Driver,
          include: [{
            model: db.User,
            attributes: ['first_name', 'last_name']
          }]
        }],
        order: [['vehicle_id', 'ASC']]
      });
  
      res.status(200).json({
        status: 'success',
        data: vehicles
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  getVehicleById: async (req, res) => {
    try {
      const { id } = req.params;
  
      const vehicle = await db.Vehicle.findByPk(id, {
        include: [{
          model: db.Driver,
          include: [{
            model: db.User,
            attributes: ['first_name', 'last_name', 'phone']
          }]
        }]
      });
  
      if (!vehicle) {
        return res.status(404).json({
          status: 'error',
          message: 'Vehicle not found'
        });
      }
  
      res.status(200).json({
        status: 'success',
        data: vehicle
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  getVehicleLocation: async (req, res) => {
    try {
      const { id } = req.params;
  
      const location = await db.VehicleLocation.findOne({
        where: {
          vehicle_id: id
        },
        order: [['recorded_at', 'DESC']]
      });
  
      if (!location) {
        return res.status(404).json({
          status: 'error',
          message: 'Vehicle location not found'
        });
      }
  
      res.status(200).json({
        status: 'success',
        data: location
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }
};

// Public routes
// Get all vehicles
router.get('/', vehicleController.getAllVehicles);

// Get vehicle by id
router.get('/:id', vehicleController.getVehicleById);

// Get current vehicle location
router.get('/:id/location', vehicleController.getVehicleLocation);

// Admin and operator routes
router.use('/manage', verifyToken);

// Additional routes for vehicle management would go here

module.exports = router;