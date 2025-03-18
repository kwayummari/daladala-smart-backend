const swaggerAutogen = require('swagger-autogen')();

// Swagger document options
const doc = {
  info: {
    title: 'K-Structure Learning Platform API',
    description: 'API documentation for K-Structure Learning Platform',
    version: '1.0.0',
    contact: {
      name: 'K-Structure Tanzania',
      email: 'info@K-Structure.co.tz',
      url: 'https://K-Structure.co.tz'
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
      username: 'johnsmith',
      full_name: 'John Smith',
      email: 'john@example.com',
      phone: '255712345678',
      status: 'active',
      created_at: '2023-01-01T00:00:00.000Z',
      updated_at: '2023-01-01T00:00:00.000Z'
    },
  },
  // Global security - all endpoints require JWT unless specified otherwise
  security: [{ bearerAuth: [] }]
};

// Output swagger.json file
const outputFile = './docs/swagger.json';

// Array of routes files to scan
const routes = [
  './server.js',
  './routes/auth.routes.js',
  './routes/category.routes.js',
  './routes/course.routes.js.js',
  './routes/enrollment.routes.js',
  './routes/lesson.routes.js',
  './routes/module.routes.js',
  './routes/user.routes.js'
];

// Generate swagger.json
swaggerAutogen(outputFile, routes, doc).then(() => {
  console.log('Swagger documentation generated');
});