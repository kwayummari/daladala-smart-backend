module.exports = (sequelize, DataTypes) => {
  const Vehicle = sequelize.define('Vehicle', {
    vehicle_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    driver_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'drivers',
        key: 'driver_id'
      }
    },
    plate_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },
    model: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    seat_capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    color: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'retired'),
      allowNull: false,
      defaultValue: 'active'
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
    tableName: 'vehicles',
    timestamps: false,
    indexes: [
      {
        fields: ['status']
      }
    ]
  });

  Vehicle.associate = function (models) {
    Vehicle.belongsTo(models.Driver, {
      foreignKey: 'driver_id',
      as: 'driver'
    });

    Vehicle.hasMany(models.Trip, {
      foreignKey: 'vehicle_id',
      as: 'trips'
    });

    Vehicle.hasMany(models.Seat, {
      foreignKey: 'vehicle_id',
      as: 'seats'
    });

    Vehicle.hasMany(models.VehicleLocation, {
      foreignKey: 'vehicle_id',
      as: 'locations'
    });

    Vehicle.hasMany(models.OnDemandRequest, {
      foreignKey: 'vehicle_id',
      as: 'on_demand_requests'
    });
  };

  return Vehicle;
};