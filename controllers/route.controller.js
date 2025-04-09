const db = require('../models');
const Route = db.Route;
const Stop = db.Stop;
const RouteStop = db.RouteStop;
const Fare = db.Fare;

// Get all routes
exports.getAllRoutes = async (req, res) => {
  try {
    const routes = await Route.findAll({
      where: {
        status: 'active'
      },
      order: [['route_name', 'ASC']]
    });

    res.status(200).json({
      status: 'success',
      data: routes
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get route by id
exports.getRouteById = async (req, res) => {
  try {
    const { id } = req.params;

    const route = await Route.findByPk(id, {
      include: [{
        model: Stop,
        through: {
          model: RouteStop,
          attributes: ['stop_order', 'distance_from_start', 'estimated_time_from_start']
        },
        attributes: ['stop_id', 'stop_name', 'latitude', 'longitude', 'address', 'is_major', 'status']
      }]
    });

    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: route
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get route stops
// Get route stops
exports.getRouteStops = async (req, res) => {
  try {
    const { id } = req.params;

    // Get the route with its stops
    const route = await Route.findByPk(id, {
      include: [{
        model: Stop,
        through: {
          model: RouteStop,
          attributes: ['stop_order', 'distance_from_start', 'estimated_time_from_start']
        }
      }]
    });

    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    // Get stops ordered by stop_order
    const routeStops = await RouteStop.findAll({
      where: {
        route_id: id
      },
      attributes: ['stop_order', 'distance_from_start', 'estimated_time_from_start'],
      order: [['stop_order', 'ASC']]
    });

    // Create response with stops and their details
    const stopsWithDetails = [];
    
    for (const routeStop of routeStops) {
      const stop = await Stop.findByPk(routeStop.stop_id);
      if (stop) {
        stopsWithDetails.push({
          ...stop.toJSON(),
          stop_order: routeStop.stop_order,
          distance_from_start: routeStop.distance_from_start,
          estimated_time_from_start: routeStop.estimated_time_from_start
        });
      }
    }

    res.status(200).json({
      status: 'success',
      data: stopsWithDetails
    });
  } catch (error) {
    console.error('Error fetching route stops:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get route fares
exports.getRouteFares = async (req, res) => {
  try {
    const { id } = req.params;
    const { fare_type } = req.query;

    const whereClause = {
      route_id: id,
      is_active: true
    };

    if (fare_type) {
      whereClause.fare_type = fare_type;
    }

    const fares = await Fare.findAll({
      where: whereClause,
      include: [{
        model: Stop,
        as: 'startStop',
        attributes: ['stop_id', 'stop_name']
      }, {
        model: Stop,
        as: 'endStop',
        attributes: ['stop_id', 'stop_name']
      }]
    });

    res.status(200).json({
      status: 'success',
      data: fares
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Search routes
exports.searchRoutes = async (req, res) => {
  try {
    const { start_point, end_point } = req.query;

    let whereClause = {
      status: 'active'
    };

    if (start_point) {
      whereClause.start_point = {
        [db.Sequelize.Op.like]: `%${start_point}%`
      };
    }

    if (end_point) {
      whereClause.end_point = {
        [db.Sequelize.Op.like]: `%${end_point}%`
      };
    }

    const routes = await Route.findAll({
      where: whereClause,
      order: [['route_name', 'ASC']]
    });

    res.status(200).json({
      status: 'success',
      data: routes
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get fare between stops
exports.getFareBetweenStops = async (req, res) => {
  try {
    const { route_id, start_stop_id, end_stop_id, fare_type = 'standard' } = req.query;

    if (!route_id || !start_stop_id || !end_stop_id) {
      return res.status(400).json({
        status: 'error',
        message: 'route_id, start_stop_id, and end_stop_id are required'
      });
    }

    const fare = await Fare.findOne({
      where: {
        route_id,
        start_stop_id,
        end_stop_id,
        fare_type,
        is_active: true
      }
    });

    if (!fare) {
      return res.status(404).json({
        status: 'error',
        message: 'Fare not found for the specified route and stops'
      });
    }

    res.status(200).json({
      status: 'success',
      data: fare
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};