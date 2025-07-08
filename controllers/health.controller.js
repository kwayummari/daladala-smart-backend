// controllers/health.controller.js
const db = require('../models');
const os = require('os');
const { getMetrics, healthWithMetrics } = require('./../middlewares/metrics.middleware');

/**
 * Health Check Controller
 * Provides system health status for monitoring and frontend health checks
 */

/**
 * Simple health check endpoint
 * Returns basic API status
 */
exports.getHealth = async (req, res) => {
    try {
        const startTime = Date.now();

        // Basic health response
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            service: 'Daladala Smart API'
        };

        // Calculate response time
        const responseTime = Date.now() - startTime;

        res.set('X-Response-Time', `${responseTime}ms`);
        res.status(200).json({
            status: 'success',
            data: healthData
        });

    } catch (error) {
        console.error('❌ Health check error:', error);
        res.status(503).json({
            status: 'error',
            message: 'Service unhealthy',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Detailed health check with database and system info
 * Returns comprehensive system status
 */
exports.getDetailedHealth = async (req, res) => {
    try {
        const startTime = Date.now();
        const checks = {};

        // Database health check
        try {
            await db.sequelize.authenticate();
            const dbStartTime = Date.now();
            await db.sequelize.query('SELECT 1');
            const dbResponseTime = Date.now() - dbStartTime;

            checks.database = {
                status: 'healthy',
                message: 'Database connection successful',
                responseTime: `${dbResponseTime}ms`
            };
        } catch (dbError) {
            checks.database = {
                status: 'unhealthy',
                message: 'Database connection failed',
                error: dbError.message
            };
        }

        // Memory usage
        const memoryUsage = process.memoryUsage();
        const memoryPercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
        checks.memory = {
            status: memoryUsage.heapUsed < (512 * 1024 * 1024) ? 'healthy' : 'warning', // 512MB threshold
            used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            percentage: memoryPercent,
            external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
            arrayBuffers: `${Math.round(memoryUsage.arrayBuffers / 1024 / 1024)}MB`
        };

        // System info
        const loadAvg = os.loadavg();
        checks.system = {
            status: 'healthy',
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cpus: os.cpus().length,
            loadAverage: {
                '1m': loadAvg[0].toFixed(2),
                '5m': loadAvg[1].toFixed(2),
                '15m': loadAvg[2].toFixed(2)
            },
            freeMemory: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
            totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)}MB`,
            hostname: os.hostname(),
            uptime: `${Math.floor(os.uptime())}s`
        };

        // External services health (ZenoPay, etc.)
        checks.externalServices = {};

        // ZenoPay health check (if API key is configured)
        if (process.env.ZENOPAY_API_KEY) {
            try {
                // Simple check - just verify we have the API key
                checks.externalServices.zenopay = {
                    status: 'healthy',
                    message: 'ZenoPay service configured',
                    apiKeySet: true
                };
            } catch (zenoError) {
                checks.externalServices.zenopay = {
                    status: 'unhealthy',
                    message: 'ZenoPay service unavailable',
                    error: zenoError.message
                };
            }
        } else {
            checks.externalServices.zenopay = {
                status: 'warning',
                message: 'ZenoPay API key not configured',
                apiKeySet: false
            };
        }

        // Get request metrics if available
        try {
            const metrics = getMetrics();
            checks.metrics = {
                status: 'healthy',
                totalRequests: metrics.requests.total,
                averageResponseTime: metrics.responseTime.average,
                errorRate: metrics.errors.rate,
                uptime: metrics.uptime.human
            };
        } catch (metricsError) {
            checks.metrics = {
                status: 'warning',
                message: 'Metrics not available',
                error: metricsError.message
            };
        }

        // Overall health status
        const allStatuses = Object.values(checks).map(check =>
            typeof check.status === 'string' ? check.status : 'healthy'
        );

        let overallStatus = 'healthy';
        if (allStatuses.includes('unhealthy')) {
            overallStatus = 'unhealthy';
        } else if (allStatuses.includes('warning')) {
            overallStatus = 'warning';
        }

        const responseTime = Date.now() - startTime;

        const healthData = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            responseTime: `${responseTime}ms`,
            environment: process.env.NODE_ENV || 'development',
            version: process.env.npm_package_version || '1.0.0',
            service: 'Daladala Smart API',
            checks
        };

        res.set('X-Response-Time', `${responseTime}ms`);

        // Return appropriate HTTP status based on health
        const statusCode = overallStatus === 'healthy' ? 200 :
            overallStatus === 'warning' ? 200 : 503;

        res.status(statusCode).json({
            status: 'success',
            data: healthData
        });

    } catch (error) {
        console.error('❌ Detailed health check error:', error);
        res.status(503).json({
            status: 'error',
            message: 'Service unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
};

/**
 * Readiness check - determines if the service is ready to accept traffic
 * Checks critical dependencies
 */
exports.getReadiness = async (req, res) => {
    try {
        const startTime = Date.now();
        const readinessChecks = {};

        // Database readiness
        try {
            await db.sequelize.authenticate();
            // Try a simple query to ensure database is truly ready
            await db.sequelize.query('SELECT 1');

            readinessChecks.database = {
                status: 'ready',
                message: 'Database is ready'
            };
        } catch (dbError) {
            readinessChecks.database = {
                status: 'not_ready',
                message: 'Database not ready',
                error: dbError.message
            };
        }

        // Environment variables check
        const requiredEnvVars = [
            'JWT_SECRET',
            'DB_HOST',
            'DB_NAME',
            'DB_USER',
            'DB_PASSWORD'
        ];

        const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

        readinessChecks.environment = {
            status: missingEnvVars.length === 0 ? 'ready' : 'not_ready',
            message: missingEnvVars.length === 0 ?
                'All required environment variables are set' :
                `Missing environment variables: ${missingEnvVars.join(', ')}`,
            missingVars: missingEnvVars
        };

        // Memory check
        const memoryUsage = process.memoryUsage();
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

        readinessChecks.memory = {
            status: memoryUsagePercent < 95 ? 'ready' : 'not_ready',
            message: memoryUsagePercent < 95 ?
                'Memory usage is acceptable' :
                'Memory usage is too high',
            usage: `${memoryUsagePercent.toFixed(1)}%`
        };

        // Overall readiness
        const isReady = Object.values(readinessChecks).every(check => check.status === 'ready');

        const responseTime = Date.now() - startTime;

        const readinessData = {
            ready: isReady,
            timestamp: new Date().toISOString(),
            responseTime: `${responseTime}ms`,
            checks: readinessChecks
        };

        res.set('X-Response-Time', `${responseTime}ms`);
        res.status(isReady ? 200 : 503).json({
            status: 'success',
            data: readinessData
        });

    } catch (error) {
        console.error('❌ Readiness check error:', error);
        res.status(503).json({
            status: 'error',
            message: 'Readiness check failed',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
};

/**
 * Liveness check - simple check to see if the service is alive
 * Should be very lightweight
 */
exports.getLiveness = async (req, res) => {
    try {
        const startTime = Date.now();

        const livenessData = {
            alive: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            pid: process.pid,
            nodeVersion: process.version
        };

        const responseTime = Date.now() - startTime;
        res.set('X-Response-Time', `${responseTime}ms`);

        res.status(200).json({
            status: 'success',
            data: livenessData
        });

    } catch (error) {
        console.error('❌ Liveness check error:', error);
        res.status(503).json({
            status: 'error',
            message: 'Service not alive',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Get API metrics and statistics (delegated to metrics middleware)
 */
exports.getMetrics = healthWithMetrics;