module.exports = (sequelize, DataTypes) => {
    const Route = sequelize.define('Route', {
      route_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      route_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true
      },
      route_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      start_point: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      end_point: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      distance_km: {
        type: DataTypes.DECIMAL(8, 2),
        allowNull: true
      },
      estimated_time_minutes: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'under_maintenance'),
        allowNull: false,
        defaultValue: 'active'
      },
      polyline: {
        type: DataTypes.TEXT,
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
      tableName: 'routes',
      timestamps: false
    });
  
    return Route;
  };