module.exports = (sequelize, DataTypes) => {
    const Schedule = sequelize.define('Schedule', {
      schedule_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
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
      departure_time: {
        type: DataTypes.TIME,
        allowNull: false
      },
      arrival_time: {
        type: DataTypes.TIME,
        allowNull: true
      },
      day_of_week: {
        type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'all'),
        allowNull: false,
        defaultValue: 'all'
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
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
      tableName: 'schedules',
      timestamps: false
    });
  
    return Schedule;
  };