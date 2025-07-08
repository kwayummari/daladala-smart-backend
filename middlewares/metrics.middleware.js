// middleware/metrics.middleware.js
/**
 * Request Metrics Middleware
 * Tracks API request metrics for monitoring and performance analysis
 */

// In-memory storage for metrics (in production, consider using Redis or a proper metrics store)
const metrics = {
    requests: {
        total: 0,
        byMethod: {},
        byRoute: {},
        byStatus: {}
    },
    responseTime: {
        total: 0,
        average: 0,
        min: Infinity,
        max: 0,
        samples: []
    },
    errors: {
        total: 0,
        byStatus: {},
        recent: []
    },
    startTime: Date.now()
};

/**
 * Request metrics tracking middleware
 */
const trackMetrics = (req, res, next) => {
    const startTime = Date.now();

    // Skip health check endpoints from metrics
    if (req.path.startsWith('/api/health') || req.path === '/health') {
        return next();
    }

    // Track request start
    metrics.requests.total++;

    // Track by method
    const method = req.method;
    metrics.requests.byMethod[method] = (metrics.requests.byMethod[method] || 0) + 1;

    // Track by route pattern (remove IDs for better grouping)
    const routePattern = req.route ? req.route.path : req.path;
    const cleanRoute = routePattern.replace(/\/:\w+/g, '/:id'); // Replace :param with :id
    metrics.requests.byRoute[cleanRoute] = (metrics.requests.byRoute[cleanRoute] || 0) + 1;

    // Override res.end to capture response metrics
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
        const responseTime = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Track response time
        metrics.responseTime.total += responseTime;
        metrics.responseTime.min = Math.min(metrics.responseTime.min, responseTime);
        metrics.responseTime.max = Math.max(metrics.responseTime.max, responseTime);

        // Keep last 100 response time samples for percentile calculations
        metrics.responseTime.samples.push(responseTime);
        if (metrics.responseTime.samples.length > 100) {
            metrics.responseTime.samples.shift();
        }

        // Calculate average
        metrics.responseTime.average = metrics.responseTime.total / metrics.requests.total;

        // Track by status code
        metrics.requests.byStatus[statusCode] = (metrics.requests.byStatus[statusCode] || 0) + 1;

        // Track errors (4xx and 5xx)
        if (statusCode >= 400) {
            metrics.errors.total++;
            metrics.errors.byStatus[statusCode] = (metrics.errors.byStatus[statusCode] || 0) + 1;

            // Keep recent errors (last 50)
            metrics.errors.recent.push({
                timestamp: new Date().toISOString(),
                method,
                path: req.path,
                statusCode,
                responseTime,
                userAgent: req.get('User-Agent'),
                ip: req.ip || req.connection.remoteAddress
            });

            if (metrics.errors.recent.length > 50) {
                metrics.errors.recent.shift();
            }
        }

        // Add response time header
        res.set('X-Response-Time', `${responseTime}ms`);

        // Call original end method
        originalEnd.call(this, chunk, encoding);
    };

    next();
};

/**
 * Get current metrics
 */
const getMetrics = () => {
    const uptime = Date.now() - metrics.startTime;
    const uptimeSeconds = Math.floor(uptime / 1000);

    // Calculate percentiles from samples
    const sortedSamples = [...metrics.responseTime.samples].sort((a, b) => a - b);
    const percentiles = {};

    if (sortedSamples.length > 0) {
        percentiles.p50 = getPercentile(sortedSamples, 0.5);
        percentiles.p90 = getPercentile(sortedSamples, 0.9);
        percentiles.p95 = getPercentile(sortedSamples, 0.95);
        percentiles.p99 = getPercentile(sortedSamples, 0.99);
    }

    // Calculate requests per second
    const requestsPerSecond = uptimeSeconds > 0 ? (metrics.requests.total / uptimeSeconds).toFixed(2) : 0;

    // Calculate error rate
    const errorRate = metrics.requests.total > 0 ?
        ((metrics.errors.total / metrics.requests.total) * 100).toFixed(2) : 0;

    return {
        uptime: {
            milliseconds: uptime,
            seconds: uptimeSeconds,
            human: formatUptime(uptimeSeconds)
        },
        requests: {
            total: metrics.requests.total,
            perSecond: parseFloat(requestsPerSecond),
            byMethod: metrics.requests.byMethod,
            byRoute: metrics.requests.byRoute,
            byStatus: metrics.requests.byStatus
        },
        responseTime: {
            average: Math.round(metrics.responseTime.average),
            min: metrics.responseTime.min === Infinity ? 0 : metrics.responseTime.min,
            max: metrics.responseTime.max,
            percentiles
        },
        errors: {
            total: metrics.errors.total,
            rate: parseFloat(errorRate),
            byStatus: metrics.errors.byStatus,
            recent: metrics.errors.recent.slice(-10) // Last 10 errors
        },
        timestamp: new Date().toISOString()
    };
};

/**
 * Reset metrics (useful for testing or periodic resets)
 */
const resetMetrics = () => {
    metrics.requests = {
        total: 0,
        byMethod: {},
        byRoute: {},
        byStatus: {}
    };
    metrics.responseTime = {
        total: 0,
        average: 0,
        min: Infinity,
        max: 0,
        samples: []
    };
    metrics.errors = {
        total: 0,
        byStatus: {},
        recent: []
    };
    metrics.startTime = Date.now();
};

/**
 * Helper function to calculate percentiles
 */
function getPercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;

    const index = Math.ceil(sortedArray.length * percentile) - 1;
    return sortedArray[index];
}

/**
 * Helper function to format uptime in human readable format
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
}

/**
 * Middleware to add metrics endpoint
 */
const metricsEndpoint = (req, res) => {
    try {
        const metricsData = getMetrics();

        res.status(200).json({
            status: 'success',
            data: metricsData
        });
    } catch (error) {
        console.error('❌ Metrics endpoint error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to get metrics',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Health check with metrics
 */
const healthWithMetrics = (req, res) => {
    try {
        const metricsData = getMetrics();
        const memoryUsage = process.memoryUsage();

        // Determine health status based on metrics
        let status = 'healthy';
        const issues = [];

        // Check error rate
        if (metricsData.errors.rate > 10) { // More than 10% error rate
            status = 'warning';
            issues.push(`High error rate: ${metricsData.errors.rate}%`);
        }

        // Check average response time
        if (metricsData.responseTime.average > 2000) { // More than 2 seconds
            status = 'warning';
            issues.push(`High response time: ${metricsData.responseTime.average}ms`);
        }

        // Check memory usage
        const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
        if (memoryUsagePercent > 90) {
            status = 'warning';
            issues.push(`High memory usage: ${memoryUsagePercent.toFixed(1)}%`);
        }

        const healthData = {
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            service: 'Daladala Smart API',
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            metrics: metricsData,
            memory: {
                used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                usage: `${memoryUsagePercent.toFixed(1)}%`
            },
            issues: issues.length > 0 ? issues : null
        };

        const statusCode = status === 'healthy' ? 200 :
            status === 'warning' ? 200 : 503;

        res.status(statusCode).json({
            status: 'success',
            data: healthData
        });

    } catch (error) {
        console.error('❌ Health with metrics error:', error);
        res.status(503).json({
            status: 'error',
            message: 'Health check failed',
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = {
    trackMetrics,
    getMetrics,
    resetMetrics,
    metricsEndpoint,
    healthWithMetrics
  };