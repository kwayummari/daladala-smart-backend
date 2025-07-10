module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define('Booking', {
    booking_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    trip_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'trips',
        key: 'trip_id'
      }
    },
    pickup_stop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stops',
        key: 'stop_id'
      }
    },
    dropoff_stop_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'stops',
        key: 'stop_id'
      }
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
    seat_numbers: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    booking_type: {
      type: DataTypes.ENUM('regular', 'pre_booking', 'on_demand', 'business'),
      allowNull: false,
      defaultValue: 'regular'
    },
    booking_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
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
    timestamps: false,
    indexes: [
      {
        fields: ['booking_date']
      },
      {
        fields: ['booking_type']
      }
    ]
  });

  Booking.associate = function (models) {
    Booking.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    Booking.belongsTo(models.Trip, {
      foreignKey: 'trip_id',
      as: 'trip'
    });

    Booking.belongsTo(models.Stop, {
      foreignKey: 'pickup_stop_id',
      as: 'pickup_stop'
    });

    Booking.belongsTo(models.Stop, {
      foreignKey: 'dropoff_stop_id',
      as: 'dropoff_stop'
    });

    Booking.hasMany(models.BookingSeat, {
      foreignKey: 'booking_id',
      as: 'seat_assignments'
    });

    Booking.hasMany(models.Payment, {
      foreignKey: 'booking_id',
      as: 'payments'
    });

    Booking.hasMany(models.BusinessBooking, {
      foreignKey: 'booking_id',
      as: 'business_bookings'
    });

    Booking.hasMany(models.PreBooking, {
      foreignKey: 'booking_id',
      as: 'pre_bookings'
    });
  };

  return Booking;
};