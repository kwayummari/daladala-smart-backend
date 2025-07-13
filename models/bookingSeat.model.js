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
            allowNull: false
        },
        seat_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        trip_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        booking_date: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        booking_reference: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        passenger_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        is_occupied: {
            type: DataTypes.BOOLEAN,
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
        timestamps: false
    });

    return BookingSeat;
  };