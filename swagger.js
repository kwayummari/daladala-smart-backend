const swaggerAutogen = require('swagger-autogen')();
const path = require('path');

// Swagger document options
const doc = {
  openapi: "3.1.0",
  info: {
    title: 'Daladala Smart API',
    description: 'API documentation for Daladala Smart, a public transportation app for daladala buses in Tanzania',
    version: '1.0.0',
    contact: {
      name: 'Daladala Smart Tanzania',
      email: 'info@daladala-smart.co.tz',
      url: 'https://daladala-smart.co.tz'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000/api',
      description: 'Development server'
    }
  ],
  tags: [
    {
      name: 'Auth',
      description: 'Authentication endpoints'
    },
    {
      name: 'Users',
      description: 'User management endpoints'
    },
    {
      name: 'Routes',
      description: 'Route information and management'
    },
    {
      name: 'Stops',
      description: 'Stop information and management'
    },
    {
      name: 'Trips',
      description: 'Trip scheduling and tracking'
    },
    {
      name: 'Bookings',
      description: 'Booking management'
    },
    {
      name: 'Payments',
      description: 'Payment processing'
    },
    {
      name: 'Drivers',
      description: 'Driver management and tracking'
    },
    {
      name: 'Vehicles',
      description: 'Vehicle information and management'
    },
    {
      name: 'Reviews',
      description: 'User reviews and ratings'
    },
    {
      name: 'Schedules',
      description: 'Schedule management'
    },
    {
      name: 'Notifications',
      description: 'User notifications'
    }
  ],
  securityDefinitions: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    }
  },
  definitions: {
    User: {
      user_id: 1,
      role_id: 2,
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '+255712345679',
      profile_picture: 'john_profile.jpg',
      is_verified: true,
      status: 'active',
      created_at: '2025-03-18T00:13:15.000Z',
      updated_at: '2025-03-18T00:13:15.000Z'
    },
    UserRole: {
      role_id: 2,
      role_name: 'passenger',
      description: 'Regular app user who can book trips',
      created_at: '2025-03-18T00:10:20.000Z',
      updated_at: '2025-03-18T00:10:20.000Z'
    },
    Route: {
      route_id: 1,
      route_number: 'R001',
      route_name: 'Mbezi - CBD',
      start_point: 'Mbezi Mwisho',
      end_point: 'Posta CBD',
      description: 'Route from Mbezi to City Center via Mwenge and Morocco',
      distance_km: 18.5,
      estimated_time_minutes: 45,
      status: 'active',
      created_at: '2025-03-18T00:13:15.000Z',
      updated_at: '2025-03-18T00:13:15.000Z'
    },
    Stop: {
      stop_id: 1,
      stop_name: 'Mbezi Mwisho',
      latitude: -6.74020000,
      longitude: 39.15890000,
      address: 'Mbezi Louis, Sam Nujoma Road',
      is_major: true,
      status: 'active',
      created_at: '2025-03-18T00:13:15.000Z',
      updated_at: '2025-03-18T00:13:15.000Z'
    },
    Trip: {
      trip_id: 1,
      schedule_id: 1,
      route_id: 1,
      vehicle_id: 1,
      driver_id: 1,
      start_time: '2025-03-18T06:00:00.000Z',
      end_time: null,
      status: 'in_progress',
      current_stop_id: 2,
      next_stop_id: 3,
      created_at: '2025-03-18T00:15:20.000Z',
      updated_at: '2025-03-18T00:15:20.000Z'
    },
    Booking: {
      booking_id: 1,
      user_id: 2,
      trip_id: 1,
      pickup_stop_id: 1,
      dropoff_stop_id: 4,
      booking_time: '2025-03-18T02:15:20.000Z',
      fare_amount: 1500.00,
      passenger_count: 1,
      status: 'in_progress',
      payment_status: 'paid',
      created_at: '2025-03-18T00:15:20.000Z',
      updated_at: '2025-03-18T00:15:20.000Z'
    },
    Payment: {
      payment_id: 1,
      booking_id: 1,
      user_id: 2,
      amount: 1500.00,
      currency: 'TZS',
      payment_method: 'mobile_money',
      transaction_id: 'MM123456789',
      payment_time: '2025-03-18T02:20:20.000Z',
      status: 'completed',
      created_at: '2025-03-18T00:15:20.000Z',
      updated_at: '2025-03-18T00:15:20.000Z'
    },
    Driver: {
      driver_id: 1,
      user_id: 6,
      license_number: 'DL12345678',
      license_expiry: '2025-12-31',
      id_number: 'ID12345678',
      experience_years: 5,
      rating: 4.75,
      total_ratings: 120,
      is_available: true,
      status: 'active',
      created_at: '2025-03-18T00:13:15.000Z',
      updated_at: '2025-03-18T00:13:15.000Z'
    },
    Vehicle: {
      vehicle_id: 1,
      driver_id: 1,
      plate_number: 'T123ABC',
      vehicle_type: 'daladala',
      model: 'Toyota Coaster',
      year: 2018,
      capacity: 30,
      color: 'Blue/White',
      is_air_conditioned: false,
      is_active: true,
      status: 'active',
      created_at: '2025-03-18T00:13:15.000Z',
      updated_at: '2025-03-18T00:13:15.000Z'
    },
    Review: {
      review_id: 1,
      user_id: 2,
      trip_id: 4,
      driver_id: 1,
      vehicle_id: 1,
      rating: 4.50,
      comment: 'Very punctual and safe driver',
      review_time: '2025-03-17T18:00:00.000Z',
      is_anonymous: false,
      status: 'approved',
      created_at: '2025-03-18T00:15:20.000Z',
      updated_at: '2025-03-18T00:15:20.000Z'
    },
    Notification: {
      notification_id: 1,
      user_id: 2,
      title: 'Trip Started',
      message: 'Your trip from Mbezi Mwisho to Posta CBD has started.',
      type: 'info',
      related_entity: 'trip',
      related_id: 1,
      is_read: false,
      read_at: null,
      created_at: '2025-03-18T00:15:20.000Z',
      updated_at: '2025-03-18T00:15:20.000Z'
    },
    // Request objects
    RegisterRequest: {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '+255712345679',
      password: 'password123'
    },
    LoginRequest: {
      phone: '+255712345679',
      password: 'password123'
    },
    BookingRequest: {
      trip_id: 1,
      pickup_stop_id: 1,
      dropoff_stop_id: 4,
      passenger_count: 1
    },
    PaymentRequest: {
      booking_id: 1,
      payment_method: 'mobile_money',
      transaction_id: 'MM123456789'
    }
  },
  // Global security - all endpoints require JWT unless specified otherwise
  security: [{ bearerAuth: [] }]
};

// Output swagger.json file
const outputFile = './swagger-output.json';

// Array of routes files to scan
const routes = [
  './server.js',
  './routes/auth.routes.js',
  './routes/user.routes.js',
  './routes/route.routes.js',
  './routes/stop.routes.js',
  './routes/trip.routes.js',
  './routes/booking.routes.js',
  './routes/payment.routes.js',
  './routes/driver.routes.js',
  './routes/vehicle.routes.js',
  './routes/review.routes.js',
  './routes/schedule.routes.js'
];

// Generate swagger.json
swaggerAutogen(outputFile, routes, doc).then(() => {
  console.log('Swagger documentation generated');
  // If you're running this as a part of your startup, you can require your server.js here
  // require('./server.js');
});