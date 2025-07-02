
// models/wallet-transaction.model.js
module.exports = (sequelize, DataTypes) => {
    const WalletTransaction = sequelize.define('WalletTransaction', {
        transaction_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        wallet_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        type: {
            type: DataTypes.ENUM('topup', 'payment', 'refund', 'transfer_in', 'transfer_out', 'cashback'),
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            validate: {
                min: 0
            }
        },
        currency: {
            type: DataTypes.STRING(3),
            allowNull: false,
            defaultValue: 'TZS'
        },
        balance_before: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        balance_after: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        reference_type: {
            type: DataTypes.ENUM('payment', 'booking', 'topup', 'refund'),
            allowNull: true
        },
        reference_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        external_reference: {
            type: DataTypes.STRING(100),
            allowNull: true
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'completed', 'failed', 'cancelled'),
            allowNull: false,
            defaultValue: 'completed'
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
        tableName: 'wallet_transactions',
        timestamps: false
    });

    return WalletTransaction;
};