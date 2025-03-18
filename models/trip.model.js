module.exports = (sequelize, DataTypes) => {
    const Trip = sequelize.define('Trip', {
      trip_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      schedule_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      route_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      driver_id: {
        type: DataTypes.INTEGER,
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
        type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'scheduled'
      },
      current_stop_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      next_stop_id: {
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
      tableName: 'trips',
      timestamps: false
    });
  
    return Trip;
  };