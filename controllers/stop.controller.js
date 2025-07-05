// controllers/stop.controller.js
const db = require('../models');
const { Op } = require('sequelize');
const Stop = db.Stop;
const Route = db.Route;
const RouteStop = db.RouteStop;

// Get all stops
exports.getAllStops = async (req, res) => {
    try {
        const { is_major, status = 'active', limit = 50, offset = 0 } = req.query;

        let whereClause = { status };

        if (is_major !== undefined) {
            whereClause.is_major = is_major === 'true';
        }

        const stops = await Stop.findAll({
            where: whereClause,
            order: [['stop_name', 'ASC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.status(200).json({
            status: 'success',
            data: stops
        });
    } catch (error) {
        console.error('Error fetching stops:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// Get nearby stops based on location
exports.getNearbyStops = async (req, res) => {
    try {
        const { latitude, longitude, radius = 2000, limit = 10 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                status: 'error',
                message: 'Latitude and longitude are required'
            });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        const radiusInKm = parseFloat(radius) / 1000; // Convert meters to kilometers

        // Using Haversine formula for distance calculation
        const stops = await Stop.findAll({
            where: {
                status: 'active',
                latitude: {
                    [Op.between]: [lat - 0.02, lat + 0.02] // Rough bounding box for optimization
                },
                longitude: {
                    [Op.between]: [lng - 0.02, lng + 0.02]
                }
            },
            attributes: [
                'stop_id',
                'stop_name',
                'latitude',
                'longitude',
                'address',
                'is_major',
                'status',
                // Calculate distance using Haversine formula
                [
                    db.sequelize.literal(`
            (6371 * acos(
              cos(radians(${lat})) * 
              cos(radians(latitude)) * 
              cos(radians(longitude) - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians(latitude))
            ))
          `),
                    'distance'
                ]
            ],
            having: db.sequelize.literal(`distance <= ${radiusInKm}`),
            order: [[db.sequelize.literal('distance'), 'ASC']],
            limit: parseInt(limit)
        });

        // Get route information for each stop
        const stopsWithRoutes = await Promise.all(
            stops.map(async (stop) => {
                const routes = await Route.findAll({
                    include: [{
                        model: Stop,
                        through: { model: RouteStop },
                        where: { stop_id: stop.stop_id },
                        attributes: []
                    }],
                    attributes: ['route_id', 'route_number', 'route_name', 'start_point', 'end_point'],
                    limit: 3 // Show max 3 routes per stop
                });

                return {
                    ...stop.toJSON(),
                    routes: routes.map(route => route.toJSON())
                };
            })
        );

        res.status(200).json({
            status: 'success',
            data: stopsWithRoutes
        });
    } catch (error) {
        console.error('Error fetching nearby stops:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// Get stop details by ID
exports.getStopById = async (req, res) => {
    try {
        const { id } = req.params;

        const stop = await Stop.findByPk(id, {
            include: [{
                model: Route,
                through: {
                    model: RouteStop,
                    attributes: ['stop_order', 'distance_from_start', 'estimated_time_from_start']
                },
                attributes: ['route_id', 'route_number', 'route_name', 'start_point', 'end_point']
            }]
        });

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
        console.error('Error fetching stop details:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// Search stops by name or address
exports.searchStops = async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                status: 'error',
                message: 'Search query must be at least 2 characters long'
            });
        }

        const searchTerm = q.trim();

        const stops = await Stop.findAll({
            where: {
                status: 'active',
                [Op.or]: [
                    {
                        stop_name: {
                            [Op.iLike]: `%${searchTerm}%`
                        }
                    },
                    {
                        address: {
                            [Op.iLike]: `%${searchTerm}%`
                        }
                    }
                ]
            },
            order: [
                // Prioritize exact matches in stop name
                [db.sequelize.literal(`
          CASE 
            WHEN LOWER(stop_name) = LOWER('${searchTerm}') THEN 1
            WHEN LOWER(stop_name) LIKE LOWER('${searchTerm}%') THEN 2
            WHEN LOWER(stop_name) LIKE LOWER('%${searchTerm}%') THEN 3
            ELSE 4
          END
        `), 'ASC'],
                ['is_major', 'DESC'],
                ['stop_name', 'ASC']
            ],
            limit: parseInt(limit)
        });

        res.status(200).json({
            status: 'success',
            data: stops
        });
    } catch (error) {
        console.error('Error searching stops:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};

// Get major stops only
exports.getMajorStops = async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const stops = await Stop.findAll({
            where: {
                is_major: true,
                status: 'active'
            },
            include: [{
                model: Route,
                through: { model: RouteStop },
                attributes: ['route_id', 'route_number', 'route_name'],
                limit: 5 // Show max 5 routes per major stop
            }],
            order: [['stop_name', 'ASC']],
            limit: parseInt(limit)
        });

        res.status(200).json({
            status: 'success',
            data: stops
        });
    } catch (error) {
        console.error('Error fetching major stops:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
};