const sequelize = require('../config/db.config');
const { DataTypes } = require('sequelize');

// Import models
const User = require('./user.model')(sequelize, DataTypes);
const UserRole = require('./user-role.model')(sequelize, DataTypes);
const Driver = require('./driver.model')(sequelize, DataTypes);
const Vehicle = require('./vehicle.model')(sequelize, DataTypes);
const Route = require('./route.model')(sequelize, DataTypes);
const Stop = require('./stop.model')(sequelize, DataTypes);
const RouteStop = require('./route-stop.model')(sequelize, DataTypes);
const Trip = require('./trip.model')(sequelize, DataTypes);
const Booking = require('./booking.model')(sequelize, DataTypes);
const Payment = require('./payment.model')(sequelize, DataTypes);
const Review = require('./review.model')(sequelize, DataTypes);
const Fare = require('./fare.model')(sequelize, DataTypes);
const Schedule = require('./schedule.model')(sequelize, DataTypes);
const Notification = require('./notification.model')(sequelize, DataTypes);
const VehicleLocation = require('./vehicle-location.model')(sequelize, DataTypes);
const RouteTracking = require('./route-tracking.model')(sequelize, DataTypes);

// Define relationships
// User and Role relationship
User.belongsTo(UserRole, { foreignKey: 'role_id', as: 'role' });
UserRole.hasMany(User, { foreignKey: 'role_id' });

// User and Driver relationship
User.hasOne(Driver, { foreignKey: 'user_id' });
Driver.belongsTo(User, { foreignKey: 'user_id' });

// Driver and Vehicle relationship
Driver.hasMany(Vehicle, { foreignKey: 'driver_id' });
Vehicle.belongsTo(Driver, { foreignKey: 'driver_id' });

// Route and Stop relationship (through RouteStop)
Route.belongsToMany(Stop, { through: RouteStop, foreignKey: 'route_id' });
Stop.belongsToMany(Route, { through: RouteStop, foreignKey: 'stop_id' });

// Trip relationships
Trip.belongsTo(Route, { foreignKey: 'route_id' });
Trip.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
Trip.belongsTo(Driver, { foreignKey: 'driver_id' });
Trip.belongsTo(Schedule, { foreignKey: 'schedule_id' });
Trip.belongsTo(Stop, { foreignKey: 'current_stop_id', as: 'currentStop' });
Trip.belongsTo(Stop, { foreignKey: 'next_stop_id', as: 'nextStop' });

// Booking relationships
Booking.belongsTo(User, { foreignKey: 'user_id' });
Booking.belongsTo(Trip, { foreignKey: 'trip_id' });
Booking.belongsTo(Stop, { foreignKey: 'pickup_stop_id', as: 'pickupStop' });
Booking.belongsTo(Stop, { foreignKey: 'dropoff_stop_id', as: 'dropoffStop' });

// Payment relationship
Payment.belongsTo(Booking, { foreignKey: 'booking_id' });
Payment.belongsTo(User, { foreignKey: 'user_id' });

// Review relationships
Review.belongsTo(User, { foreignKey: 'user_id' });
Review.belongsTo(Trip, { foreignKey: 'trip_id' });
Review.belongsTo(Driver, { foreignKey: 'driver_id' });
Review.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });

// Fare relationships
Fare.belongsTo(Route, { foreignKey: 'route_id' });
Fare.belongsTo(Stop, { foreignKey: 'start_stop_id', as: 'startStop' });
Fare.belongsTo(Stop, { foreignKey: 'end_stop_id', as: 'endStop' });

// Schedule relationships
Schedule.belongsTo(Route, { foreignKey: 'route_id' });
Schedule.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
Schedule.belongsTo(Driver, { foreignKey: 'driver_id' });

// Notification relationship
Notification.belongsTo(User, { foreignKey: 'user_id' });

// VehicleLocation relationships
VehicleLocation.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
VehicleLocation.belongsTo(Trip, { foreignKey: 'trip_id' });

// RouteTracking relationships
RouteTracking.belongsTo(Trip, { foreignKey: 'trip_id' });
RouteTracking.belongsTo(Stop, { foreignKey: 'stop_id' });

// Export models
const db = {
  sequelize,
  User,
  UserRole,
  Driver,
  Vehicle,
  Route,
  Stop,
  RouteStop,
  Trip,
  Booking,
  Payment,
  Review,
  Fare,
  Schedule,
  Notification,
  VehicleLocation,
  RouteTracking
};

module.exports = db;