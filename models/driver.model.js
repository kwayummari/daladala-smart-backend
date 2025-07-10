module.exports = (sequelize, DataTypes) => {
  const Driver = sequelize.define('Driver', {
    driver_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    license_number: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    license_expiry: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    id_number: {
      type: DataTypes.STRING(30),
      allowNull: false
    },
    experience_years: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.00
    },
    total_ratings: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended', 'pending_approval'),
      allowNull: false,
      defaultValue: 'pending_approval'
    },
    current_latitude: {
      type: DataTypes.DECIMAL(10, 8),
      allowNull: true
    },
    current_longitude: {
      type: DataTypes.DECIMAL(11, 8),
      allowNull: true
    },
    last_location_update: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_tracking_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
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
    tableName: 'drivers',
    timestamps: false,
    indexes: [
      {
        fields: ['current_latitude', 'current_longitude']
      }
    ]
  });

  Driver.associate = function (models) {
    Driver.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    Driver.hasMany(models.Trip, {
      foreignKey: 'driver_id',
      as: 'trips'
    });

    Driver.hasMany(models.Vehicle, {
      foreignKey: 'driver_id',
      as: 'vehicles'
    });

    Driver.hasMany(models.OnDemandRequest, {
      foreignKey: 'driver_id',
      as: 'on_demand_requests'
    });
  };

  return Driver;
};

