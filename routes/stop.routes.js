const express = require('express');
const router = express.Router();
const stopController = require('../controllers/stop.controller');

// Create the stop controller
const stopController = {
  getAllStops: async (req, res) => {
    try {
      const stops = await db.Stop.findAll({
        where: {
          status: 'active'
        },
        order: [['stop_name', 'ASC']]
      });
  
      res.status(200).json({
        status: 'success',
        data: stops
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  getStopById: async (req, res) => {
    try {
      const { id } = req.params;
  
      const stop = await db.Stop.findByPk(id);
  
      if (!stop) {
        return res.status(404).json({
          status: 'error',
          message: 'Stop not found'
        });
      }
  
      res.status(200).json({
        status: 'success',
        data: stop
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  },

  searchStops: async (req, res) => {
    try {
      const { query } = req.query;
  
      if (!query) {
        return res.status(400).json({
          status: 'error',
          message: 'Search query is required'
        });
      }
  
      const stops = await db.Stop.findAll({
        where: {
          stop_name: {
            [db.Sequelize.Op.like]: `%${query}%`
          },
          status: 'active'
        },
        order: [['stop_name', 'ASC']]
      });
  
      res.status(200).json({
        status: 'success',
        data: stops
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
// Get all stops
router.get('/', stopController.getAllStops);

// Get stop by id
router.get('/:id', stopController.getStopById);

// Search stops
router.get('/search', stopController.searchStops);

module.exports = router;