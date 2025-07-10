
// models/preBooking.model.js
module.exports = (sequelize, DataTypes) => {
    const PreBooking = sequelize.define('PreBooking', {
        pre_booking_id: {
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
        route_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'routes',
                key: 'route_id'
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
        travel_date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        preferred_time: {
            type: DataTypes.TIME,
            allowNull: true
        },
        passenger_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        fare_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        seat_numbers: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('active', 'completed', 'cancelled', 'expired'),
            allowNull: false,
            defaultValue: 'active'
        },
        booking_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'bookings',
                key: 'booking_id'
            }
        },
        trip_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'trips',
                key: 'trip_id'
            }
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
        tableName: 'pre_bookings',
        timestamps: false,
        indexes: [
            {
                fields: ['travel_date']
            },
            {
                fields: ['status']
            }
        ]
    });

    PreBooking.associate = function (models) {
        PreBooking.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });

        PreBooking.belongsTo(models.Route, {
            foreignKey: 'route_id',
            as: 'route'
        });

        PreBooking.belongsTo(models.Stop, {
            foreignKey: 'pickup_stop_id',
            as: 'pickup_stop'
        });

        PreBooking.belongsTo(models.Stop, {
            foreignKey: 'dropoff_stop_id',
            as: 'dropoff_stop'
        });

        PreBooking.belongsTo(models.Booking, {
            foreignKey: 'booking_id',
            as: 'booking'
        });

        PreBooking.belongsTo(models.Trip, {
            foreignKey: 'trip_id',
            as: 'trip'
        });
    };

    return PreBooking;
};
