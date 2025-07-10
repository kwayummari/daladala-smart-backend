
// models/bookingSeat.model.js
module.exports = (sequelize, DataTypes) => {
    const BookingSeat = sequelize.define('BookingSeat', {
        booking_seat_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        booking_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'bookings',
                key: 'booking_id'
            }
        },
        seat_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'seats',
                key: 'seat_id'
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
        passenger_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        is_occupied: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        boarded_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        alighted_at: {
            type: DataTypes.DATE,
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
        tableName: 'booking_seats',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['seat_id', 'trip_id']
            }
        ]
    });

    BookingSeat.associate = function (models) {
        BookingSeat.belongsTo(models.Booking, {
            foreignKey: 'booking_id',
            as: 'booking'
        });

        BookingSeat.belongsTo(models.Seat, {
            foreignKey: 'seat_id',
            as: 'seat'
        });

        BookingSeat.belongsTo(models.Trip, {
            foreignKey: 'trip_id',
            as: 'trip'
        });
    };

    return BookingSeat;
};