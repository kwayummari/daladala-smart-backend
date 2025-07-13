// models/seat.model.js
module.exports = (sequelize, DataTypes) => {
    const Seat = sequelize.define('Seat', {
        seat_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        vehicle_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        seat_number: {
            type: DataTypes.STRING(10),
            allowNull: false
        },
        seat_type: {
            type: DataTypes.STRING(20),
            defaultValue: 'standard'
        },
        is_available: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        },
        booking_date: {
            type: DataTypes.DATEONLY,
            allowNull: true
        },
        booking_reference: {
            type: DataTypes.STRING(50),
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
        tableName: 'seats',
        timestamps: false
    });

    return Seat;
  };