module.exports = (sequelize, DataTypes) => {
    const RouteTracking = sequelize.define('RouteTracking', {
      tracking_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      trip_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      stop_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      arrival_time: {
        type: DataTypes.DATE,
        allowNull: true
      },
      departure_time: {
        type: DataTypes.DATE,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('pending', 'arrived', 'departed', 'skipped'),
        allowNull: false,
        defaultValue: 'pending'
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
      tableName: 'route_tracking',
      timestamps: false
    });
  
    return RouteTracking;
  };