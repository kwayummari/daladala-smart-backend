const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Database connection
const sequelize = require('./config/db.config');

const swaggerUi = require('swagger-ui-express');
let swaggerFile;

try {
  swaggerFile = require('../swagger-output.json');
} catch (error) {
  console.warn('Swagger file not found. API documentation will not be available.');
  swaggerFile = { info: { title: 'API Documentation not available' } };
}

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test database connection
async function testDbConnection() {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
}

testDbConnection();

// Simple test route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Daladala Smart API' });
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/routes', require('./routes/route.routes'));
app.use('/api/stops', require('./routes/stop.routes'));
app.use('/api/vehicles', require('./routes/vehicle.routes'));
app.use('/api/trips', require('./routes/trip.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/payments', require('./routes/payment.routes'));
app.use('/api/drivers', require('./routes/driver.routes'));
app.use('/api/schedules', require('./routes/schedule.routes'));
app.use('/api/reviews', require('./routes/review.routes'));
app.use('/api/wallet', require('./routes/wallet.routes'));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});