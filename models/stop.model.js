module.exports = (sequelize, DataTypes) => {
    const Stop = sequelize.define('Stop', {
      stop_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      stop_name: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: false
      },
      longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: false
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      is_major: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      photo: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('active', 'inactive', 'under_maintenance'),
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
      },
      location: {
        type: DataTypes.GEOMETRY('POINT'),
        allowNull: false
      }
    }, {
      tableName: 'stops',
      timestamps: false
    });
  
    return Stop;
  };