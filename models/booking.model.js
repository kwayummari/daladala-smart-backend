module.exports = (sequelize, DataTypes) => {
    const Booking = sequelize.define('Booking', {
      booking_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      trip_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      pickup_stop_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      dropoff_stop_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      booking_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      fare_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      passenger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      payment_status: {
        type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
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
      tableName: 'bookings',
      timestamps: false
    });
  
    return Booking;
  };