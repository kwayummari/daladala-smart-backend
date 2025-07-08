const db = require('../models');
const Route = db.Route;
const Stop = db.Stop;
const RouteStop = db.RouteStop;
const Fare = db.Fare;
const { Sequelize, Op } = require('sequelize');

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

// Get route stops - FIXED VERSION
exports.getRouteStops = async (req, res) => {
  try {
    const { id } = req.params;

    // First check if route exists
    const route = await Route.findByPk(id);
    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    // Get route stops using raw SQL query approach
    const routeStops = await db.sequelize.query(`
      SELECT 
        rs.route_stop_id,
        rs.stop_order,
        rs.distance_from_start,
        rs.estimated_time_from_start,
        s.stop_id,
        s.stop_name,
        s.latitude,
        s.longitude,
        s.address,
        s.is_major,
        s.status
      FROM route_stops rs
      INNER JOIN stops s ON rs.stop_id = s.stop_id
      WHERE rs.route_id = :routeId 
        AND s.status = 'active'
      ORDER BY rs.stop_order ASC
    `, {
      replacements: { routeId: id },
      type: db.sequelize.QueryTypes.SELECT
    });

    // Format the response
    const stopsWithDetails = routeStops.map(stop => ({
      route_stop_id: stop.route_stop_id,
      stop_id: stop.stop_id,
      stop_name: stop.stop_name,
      latitude: parseFloat(stop.latitude),
      longitude: parseFloat(stop.longitude),
      address: stop.address,
      is_major: stop.is_major,
      status: stop.status,
      stop_order: stop.stop_order,
      distance_from_start: stop.distance_from_start ? parseFloat(stop.distance_from_start) : null,
      estimated_time_from_start: stop.estimated_time_from_start
    }));

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
    console.error('Error fetching route fares:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Search routes by start and end points
exports.searchRoutes = async (req, res) => {
  try {
    const { start_point, end_point, limit = 20, offset = 0 } = req.query;

    // Build where clause
    let whereClause = {
      status: 'active'
    };

    // If both start and end points are provided, search for routes that match
    if (start_point && end_point) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          {
            start_point: {
              [Op.iLike]: `%${start_point}%`
            },
            end_point: {
              [Op.iLike]: `%${end_point}%`
            }
          },
          {
            route_name: {
              [Op.iLike]: `%${start_point}%`
            }
          },
          {
            route_name: {
              [Op.iLike]: `%${end_point}%`
            }
          }
        ]
      };
    } else if (start_point) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          {
            start_point: {
              [Op.iLike]: `%${start_point}%`
            }
          },
          {
            route_name: {
              [Op.iLike]: `%${start_point}%`
            }
          }
        ]
      };
    } else if (end_point) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          {
            end_point: {
              [Op.iLike]: `%${end_point}%`
            }
          },
          {
            route_name: {
              [Op.iLike]: `%${end_point}%`
            }
          }
        ]
      };
    }

    const routes = await Route.findAll({
      where: whereClause,
      attributes: [
        'route_id',
        'route_number',
        'route_name',
        'start_point',
        'end_point',
        'distance',
        'estimated_duration',
        'base_fare',
        'description',
        'status'
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['route_name', 'ASC']]
    });

    // If searching with specific start/end points, also search through stops
    let routesFromStops = [];
    if (start_point && end_point) {
      const routeStops = await RouteStop.findAll({
        include: [
          {
            model: Stop,
            where: {
              [Op.or]: [
                {
                  stop_name: {
                    [Op.iLike]: `%${start_point}%`
                  }
                },
                {
                  stop_name: {
                    [Op.iLike]: `%${end_point}%`
                  }
                }
              ],
              status: 'active'
            }
          },
          {
            model: Route,
            where: {
              status: 'active'
            },
            attributes: [
              'route_id',
              'route_number',
              'route_name',
              'start_point',
              'end_point',
              'distance',
              'estimated_duration',
              'base_fare',
              'description',
              'status'
            ]
          }
        ]
      });

      // Extract unique routes from stop matches
      const uniqueRouteIds = new Set();
      routesFromStops = routeStops
        .filter(rs => {
          if (uniqueRouteIds.has(rs.Route.route_id)) {
            return false;
          }
          uniqueRouteIds.add(rs.Route.route_id);
          return true;
        })
        .map(rs => rs.Route);
    }

    // Combine and deduplicate results
    const allRoutes = [...routes];
    routesFromStops.forEach(route => {
      if (!allRoutes.find(r => r.route_id === route.route_id)) {
        allRoutes.push(route);
      }
    });

    res.status(200).json({
      status: 'success',
      data: allRoutes,
      pagination: {
        total: allRoutes.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error searching routes:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

// Get fare between specific stops
exports.getFareBetweenStops = async (req, res) => {
  try {
    const { route_id, start_stop_id, end_stop_id, fare_type = 'standard' } = req.query;

    // Validate required parameters
    if (!route_id || !start_stop_id || !end_stop_id) {
      return res.status(400).json({
        status: 'error',
        message: 'route_id, start_stop_id, and end_stop_id are required'
      });
    }

    // Check if route exists
    const route = await Route.findByPk(route_id);
    if (!route) {
      return res.status(404).json({
        status: 'error',
        message: 'Route not found'
      });
    }

    // Get fare information
    const fare = await Fare.findOne({
      where: {
        route_id: parseInt(route_id),
        start_stop_id: parseInt(start_stop_id),
        end_stop_id: parseInt(end_stop_id),
        fare_type: fare_type,
        is_active: true
      },
      include: [
        {
          model: Stop,
          as: 'startStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        },
        {
          model: Stop,
          as: 'endStop',
          attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
        }
      ]
    });

    if (!fare) {
      // If no specific fare found, calculate based on distance or use base fare
      // Get stop order information
      const startStopInfo = await RouteStop.findOne({
        where: {
          route_id: parseInt(route_id),
          stop_id: parseInt(start_stop_id)
        }
      });

      const endStopInfo = await RouteStop.findOne({
        where: {
          route_id: parseInt(route_id),
          stop_id: parseInt(end_stop_id)
        }
      });

      if (!startStopInfo || !endStopInfo) {
        return res.status(404).json({
          status: 'error',
          message: 'One or both stops are not part of this route'
        });
      }

      // Calculate fare based on distance or number of stops
      const stopDifference = Math.abs(endStopInfo.stop_order - startStopInfo.stop_order);
      const estimatedFare = route.base_fare + (stopDifference * 200); // 200 TZS per stop difference

      // Get stop details
      const startStop = await Stop.findByPk(start_stop_id, {
        attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
      });
      const endStop = await Stop.findByPk(end_stop_id, {
        attributes: ['stop_id', 'stop_name', 'latitude', 'longitude']
      });

      return res.status(200).json({
        status: 'success',
        data: {
          fare_id: null,
          route_id: parseInt(route_id),
          start_stop_id: parseInt(start_stop_id),
          end_stop_id: parseInt(end_stop_id),
          fare_type: fare_type,
          amount: estimatedFare,
          currency: 'TZS',
          is_estimated: true,
          startStop: startStop,
          endStop: endStop,
          stop_difference: stopDifference
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        ...fare.toJSON(),
        is_estimated: false
      }
    });
  } catch (error) {
    console.error('Error getting fare between stops:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};


/**
 * Get popular routes based on booking count
 */
exports.getPopularRoutes = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const popularRoutes = await db.sequelize.query(`
      SELECT 
        r.route_id,
        r.route_number,
        r.route_name,
        r.start_point,
        r.end_point,
        r.distance_km,
        r.estimated_time_minutes as estimated_duration,
        r.status,
        COUNT(b.booking_id) as booking_count,
        AVG(b.fare_amount) as base_fare,
        AVG(CAST(rev.rating AS DECIMAL(3,2))) as average_rating
      FROM routes r
      LEFT JOIN trips t ON r.route_id = t.route_id
      LEFT JOIN bookings b ON t.trip_id = b.trip_id 
        AND b.status IN ('confirmed', 'completed')
      LEFT JOIN reviews rev ON r.route_id = rev.route_id
      WHERE r.status = 'active'
      GROUP BY r.route_id, r.route_number, r.route_name, r.start_point, 
               r.end_point, r.distance_km, r.estimated_time_minutes, r.status
      ORDER BY booking_count DESC, average_rating DESC
      LIMIT ?
    `, {
      replacements: [parseInt(limit)],
      type: db.sequelize.QueryTypes.SELECT
    });

    // Format the response to match frontend expectations
    const formattedRoutes = popularRoutes.map(route => ({
      route_id: route.route_id,
      route_number: route.route_number,
      route_name: route.route_name,
      start_point: route.start_point,
      end_point: route.end_point,
      distance_km: route.distance_km,
      estimated_duration: route.estimated_duration,
      status: route.status,
      booking_count: parseInt(route.booking_count) || 0,
      base_fare: route.base_fare ? parseFloat(route.base_fare) : 1000, // Default to 1000 TZS
      rating: route.average_rating ? parseFloat(route.average_rating).toFixed(1) : null,
      stops_count: null, // Will be filled if needed
      vehicle_count: null // Will be filled if needed
    }));

    res.status(200).json({
      status: 'success',
      data: formattedRoutes
    });

  } catch (error) {
    console.error('❌ Get popular routes error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch popular routes'
    });
  }
};