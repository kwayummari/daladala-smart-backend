module.exports = (sequelize, DataTypes) => {
    const VehicleLocation = sequelize.define('VehicleLocation', {
      location_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      trip_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false
      },
      heading: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true
      },
      speed: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true
      },
      recorded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      location: {
        type: DataTypes.GEOMETRY('POINT'),
        allowNull: false
      }
    }, {
      tableName: 'vehicle_locations',
      timestamps: false,
      updatedAt: false
    });
  
    return VehicleLocation;
  };