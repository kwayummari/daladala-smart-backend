module.exports = (sequelize, DataTypes) => {
    const Fare = sequelize.define('Fare', {
      fare_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      route_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      start_stop_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      end_stop_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'TZS'
      },
      fare_type: {
        type: DataTypes.ENUM('standard', 'student', 'senior', 'special'),
        allowNull: false,
        defaultValue: 'standard'
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
      tableName: 'fares',
      timestamps: false,
      indexes: [
        {
          unique: true,
          fields: ['route_id', 'start_stop_id', 'end_stop_id', 'fare_type']
        }
      ]
    });
  
    return Fare;
  };