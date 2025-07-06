// Updated models/index.js - Fix RouteStop associations
const sequelize = require('../config/db.config');
const { DataTypes } = require('sequelize');

// Import existing models
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

// Import new wallet models
const Wallet = require('./wallet.model')(sequelize, DataTypes);
const WalletTransaction = require('./wallet-transaction.model')(sequelize, DataTypes);

// Define existing relationships
User.belongsTo(UserRole, { foreignKey: 'role_id', as: 'role' });
UserRole.hasMany(User, { foreignKey: 'role_id' });

User.hasOne(Driver, { foreignKey: 'user_id' });
Driver.belongsTo(User, { foreignKey: 'user_id' });

Driver.hasMany(Vehicle, { foreignKey: 'driver_id' });
Vehicle.belongsTo(Driver, { foreignKey: 'driver_id' });

// FIXED: Many-to-many relationship between Routes and Stops through RouteStop
Route.belongsToMany(Stop, { through: RouteStop, foreignKey: 'route_id' });
Stop.belongsToMany(Route, { through: RouteStop, foreignKey: 'stop_id' });

// ADDED: Direct associations for RouteStop to enable include queries
RouteStop.belongsTo(Route, { foreignKey: 'route_id' });
RouteStop.belongsTo(Stop, { foreignKey: 'stop_id' });
Route.hasMany(RouteStop, { foreignKey: 'route_id' });
Stop.hasMany(RouteStop, { foreignKey: 'stop_id' });

Trip.belongsTo(Route, { foreignKey: 'route_id' });
Trip.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
Trip.belongsTo(Driver, { foreignKey: 'driver_id' });
Trip.belongsTo(Schedule, { foreignKey: 'schedule_id' });
Trip.belongsTo(Stop, { foreignKey: 'current_stop_id', as: 'currentStop' });
Trip.belongsTo(Stop, { foreignKey: 'next_stop_id', as: 'nextStop' });

Booking.belongsTo(User, { foreignKey: 'user_id' });
Booking.belongsTo(Trip, { foreignKey: 'trip_id' });
Booking.belongsTo(Stop, { foreignKey: 'pickup_stop_id', as: 'pickupStop' });
Booking.belongsTo(Stop, { foreignKey: 'dropoff_stop_id', as: 'dropoffStop' });

Payment.belongsTo(Booking, { foreignKey: 'booking_id' });
Payment.belongsTo(User, { foreignKey: 'user_id' });

Review.belongsTo(User, { foreignKey: 'user_id' });
Review.belongsTo(Trip, { foreignKey: 'trip_id' });
Review.belongsTo(Driver, { foreignKey: 'driver_id' });
Review.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });

Fare.belongsTo(Route, { foreignKey: 'route_id' });
Fare.belongsTo(Stop, { foreignKey: 'start_stop_id', as: 'startStop' });
Fare.belongsTo(Stop, { foreignKey: 'end_stop_id', as: 'endStop' });

Schedule.belongsTo(Route, { foreignKey: 'route_id' });
Schedule.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
Schedule.belongsTo(Driver, { foreignKey: 'driver_id' });

Notification.belongsTo(User, { foreignKey: 'user_id' });

VehicleLocation.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });
VehicleLocation.belongsTo(Trip, { foreignKey: 'trip_id' });

RouteTracking.belongsTo(Trip, { foreignKey: 'trip_id' });
RouteTracking.belongsTo(Stop, { foreignKey: 'stop_id' });

// Define new wallet relationships
User.hasOne(Wallet, { foreignKey: 'user_id' });
Wallet.belongsTo(User, { foreignKey: 'user_id' });

Wallet.hasMany(WalletTransaction, { foreignKey: 'wallet_id' });
WalletTransaction.belongsTo(Wallet, { foreignKey: 'wallet_id' });

User.hasMany(WalletTransaction, { foreignKey: 'user_id' });
WalletTransaction.belongsTo(User, { foreignKey: 'user_id' });

// Optional: Add relationship to payments
WalletTransaction.belongsTo(Payment, { foreignKey: 'reference_id', constraints: false });
WalletTransaction.belongsTo(Booking, { foreignKey: 'reference_id', constraints: false });

// Export updated db object
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
  RouteTracking,
  Wallet,
  WalletTransaction
};

module.exports = db;