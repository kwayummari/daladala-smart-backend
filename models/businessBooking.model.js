
// models/businessBooking.model.js
module.exports = (sequelize, DataTypes) => {
    const BusinessBooking = sequelize.define('BusinessBooking', {
        business_booking_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        business_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'business_accounts',
                key: 'business_id'
            }
        },
        booking_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'bookings',
                key: 'booking_id'
            }
        },
        employee_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        employee_id: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        department: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        approved_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'user_id'
            }
        },
        approval_status: {
            type: DataTypes.ENUM('pending', 'approved', 'rejected'),
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
        tableName: 'business_bookings',
        timestamps: false
    });

    BusinessBooking.associate = function (models) {
        BusinessBooking.belongsTo(models.BusinessAccount, {
            foreignKey: 'business_id',
            as: 'business'
        });

        BusinessBooking.belongsTo(models.Booking, {
            foreignKey: 'booking_id',
            as: 'booking'
        });

        BusinessBooking.belongsTo(models.User, {
            foreignKey: 'approved_by',
            as: 'approver'
        });
    };

    return BusinessBooking;
};