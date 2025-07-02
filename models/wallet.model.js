// models/wallet.model.js
module.exports = (sequelize, DataTypes) => {
    const Wallet = sequelize.define('Wallet', {
        wallet_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        },
        balance: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0.00,
            validate: {
                min: 0
            }
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'TZS'
        },
        status: {
            type: DataTypes.ENUM('active', 'suspended', 'closed'),
            allowNull: false,
            defaultValue: 'active'
        },
        daily_limit: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            defaultValue: 1000000.00
        },
        monthly_limit: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true,
            defaultValue: 5000000.00
        },
        last_activity: {
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
        tableName: 'wallets',
        timestamps: false
    });

    return Wallet;
};