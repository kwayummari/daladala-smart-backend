// controllers/schedule.controller.js
const db = require('../models');
const Schedule = db.Schedule;

// Get schedules by route
exports.getSchedulesByRoute = async (req, res) => {
  try {
    const { route_id } = req.params;
    const { day_of_week } = req.query;

    let whereClause = {
      route_id,
      is_active: true
    };

    if (day_of_week) {
      whereClause.day_of_week = day_of_week;
    }

    const schedules = await Schedule.findAll({
      where: whereClause,
      include: [
        {
          model: db.Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'capacity', 'is_air_conditioned']
        },
        {
          model: db.Driver,
          include: [{
            model: db.User,
            attributes: ['first_name', 'last_name']
          }],
          attributes: ['driver_id', 'rating', 'total_ratings']
        },
        {
          model: db.Route,
          attributes: ['route_id', 'route_name', 'start_point', 'end_point']
        }
      ],
      order: [['departure_time', 'ASC']]
    });

    res.status(200).json({
      status: 'success',
      data: schedules
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get schedule by ID
exports.getScheduleById = async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await Schedule.findByPk(id, {
      include: [
        {
          model: db.Vehicle,
          attributes: ['vehicle_id', 'plate_number', 'vehicle_type', 'capacity', 'is_air_conditioned']
        },
        {
          model: db.Driver,
          include: [{
            model: db.User,
            attributes: ['first_name', 'last_name']
          }],
          attributes: ['driver_id', 'rating', 'total_ratings']
        },
        {
          model: db.Route,
          include: [{
            model: db.Stop,
            through: {
              attributes: ['stop_order', 'distance_from_start', 'estimated_time_from_start']
            }
          }]
        }
      ]
    });

    if (!schedule) {
      return res.status(404).json({
        status: 'error',
        message: 'Schedule not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: schedule
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};