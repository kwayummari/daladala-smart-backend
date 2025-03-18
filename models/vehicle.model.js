module.exports = (sequelize, DataTypes) => {
    const Vehicle = sequelize.define('Vehicle', {
      vehicle_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      driver_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      plate_number: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true
      },
      vehicle_type: {
        type: DataTypes.ENUM('daladala', 'bus', 'minibus'),
        allowNull: false,
        defaultValue: 'daladala'
      },
      model: {
        type: DataTypes.STRING(50),
        allowNull: true
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      color: {
        type: DataTypes.STRING(30),
        allowNull: true
      },
      photo: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      is_air_conditioned: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      status: {
        type: DataTypes.ENUM('active', 'maintenance', 'inactive'),
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
      timestamps: false
    });
  
    return Vehicle;
  };