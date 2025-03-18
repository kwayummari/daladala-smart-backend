module.exports = (sequelize, DataTypes) => {
    const RouteStop = sequelize.define('RouteStop', {
      route_stop_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      route_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      stop_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      stop_order: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      distance_from_start: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true
      },
      estimated_time_from_start: {
        type: DataTypes.INTEGER,
        allowNull: true
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
      tableName: 'route_stops',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['route_id', 'stop_id']
        }
      ]
    });
  
    return RouteStop;
  };