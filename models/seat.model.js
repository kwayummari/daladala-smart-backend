module.exports = (sequelize, DataTypes) => {
    const Seat = sequelize.define('Seat', {
        seat_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        vehicle_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'vehicles',
                key: 'vehicle_id'
            }
        },
        seat_number: {
            type: DataTypes.STRING(10),
            allowNull: false
        },
        is_available: {
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
        tableName: 'seats',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['vehicle_id', 'seat_number']
            }
        ]
    });

    Seat.associate = function (models) {
        Seat.belongsTo(models.Vehicle, {
            foreignKey: 'vehicle_id',
            as: 'vehicle'
        });

        Seat.hasMany(models.BookingSeat, {
            foreignKey: 'seat_id',
            as: 'bookings'
        });
    };

    return Seat;
};