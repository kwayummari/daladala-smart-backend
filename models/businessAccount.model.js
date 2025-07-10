// models/businessAccount.model.js
module.exports = (sequelize, DataTypes) => {
    const BusinessAccount = sequelize.define('BusinessAccount', {
        business_id: {
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
        business_name: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        business_registration_number: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true
        },
        tax_id: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        contact_person: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        business_email: {
            type: DataTypes.STRING(100),
            allowNull: true,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        business_phone: {
            type: DataTypes.STRING(15),
            allowNull: false
        },
        address: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive', 'pending_approval', 'suspended'),
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
        tableName: 'business_accounts',
        timestamps: false
    });

    BusinessAccount.associate = function (models) {
        BusinessAccount.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'admin'
        });

        BusinessAccount.hasMany(models.BusinessBooking, {
            foreignKey: 'business_id',
            as: 'bookings'
        });
    };

    return BusinessAccount;
};