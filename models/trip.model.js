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
    estimated_duration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    actual_duration: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    trip_type: {
      type: DataTypes.ENUM('scheduled', 'on_demand'),
      allowNull: false,
      defaultValue: 'scheduled'
    },
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
    Trip.belongsTo(models.Schedule, {
      foreignKey: 'schedule_id',
      as: 'schedule'
    });

    Trip.belongsTo(models.Route, {
      foreignKey: 'route_id',
      as: 'route'
    });

    Trip.belongsTo(models.Vehicle, {
      foreignKey: 'vehicle_id',
      as: 'vehicle'
    });

    Trip.belongsTo(models.Driver, {
      foreignKey: 'driver_id',
      as: 'driver'
    });

    Trip.belongsTo(models.Stop, {
      foreignKey: 'current_stop_id',
      as: 'current_stop'
    });

    Trip.belongsTo(models.Stop, {
      foreignKey: 'next_stop_id',
      as: 'next_stop'
    });

    Trip.hasMany(models.Booking, {
      foreignKey: 'trip_id',
      as: 'bookings'
    });

    Trip.hasMany(models.BookingSeat, {
      foreignKey: 'trip_id',
      as: 'seat_bookings'
    });

    Trip.hasMany(models.VehicleLocation, {
      foreignKey: 'trip_id',
      as: 'location_history'
    });

    Trip.hasMany(models.OnDemandRequest, {
      foreignKey: 'trip_id',
      as: 'on_demand_requests'
    });

    Trip.hasMany(models.PreBooking, {
      foreignKey: 'trip_id',
      as: 'pre_bookings'
    });
  };

  return Trip;
};