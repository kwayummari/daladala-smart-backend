module.exports = (sequelize, DataTypes) => {
    const Driver = sequelize.define('Driver', {
      driver_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      license_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
      },
      license_expiry: {
        type: DataTypes.DATEONLY,
        allowNull: false
      },
      id_number: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true
      },
      experience_years: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      rating: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: true,
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
      timestamps: false
    });
  
    return Driver;
  };