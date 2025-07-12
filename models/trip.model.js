// models/trip.model.js
module.exports = (sequelize, DataTypes) => {
  const Trip = sequelize.define('Trip', {
    trip_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    schedule_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'schedules',
        key: 'schedule_id'
      }
    },
    route_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'routes',
        key: 'route_id'
      }
    },
    vehicle_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'vehicles',
        key: 'vehicle_id'
      }
    },
    driver_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'drivers',
        key: 'driver_id'
      }
    },
    current_stop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stops',
        key: 'stop_id'
      }
    },
    next_stop_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'stops',
        key: 'stop_id'
      }
    },
    driver_latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    driver_longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    last_driver_update: {
      type: DataTypes.DATE,
      allowNull: true
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'delayed'),
      allowNull: false,
      defaultValue: 'scheduled'
    },
    // REMOVED: estimated_duration, actual_duration, trip_type
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'trips',
    timestamps: false,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['driver_latitude', 'driver_longitude']
      }
    ]
  });

  Trip.associate = function (models) {
    Trip.belongsTo(models.Route, {
      foreignKey: 'route_id',
      as: 'Route'
    });

    Trip.belongsTo(models.Vehicle, {
      foreignKey: 'vehicle_id',
      as: 'Vehicle'
    });

    Trip.belongsTo(models.Driver, {
      foreignKey: 'driver_id',
      as: 'Driver'
    });

    Trip.belongsTo(models.Schedule, {
      foreignKey: 'schedule_id',
      as: 'Schedule'
    });

    Trip.belongsTo(models.Stop, {
      foreignKey: 'current_stop_id',
      as: 'currentStop'
    });

    Trip.belongsTo(models.Stop, {
      foreignKey: 'next_stop_id',
      as: 'nextStop'
    });

    Trip.hasMany(models.Booking, {
      foreignKey: 'trip_id',
      as: 'Bookings'
    });

    Trip.hasMany(models.VehicleLocation, {
      foreignKey: 'trip_id',
      as: 'VehicleLocations'
    });
  };

  return Trip;
};