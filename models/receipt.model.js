
module.exports = (sequelize, DataTypes) => {
    const Receipt = sequelize.define('Receipt', {
        receipt_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        receipt_number: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'user_id'
            }
        },
        receipt_type: {
            type: DataTypes.ENUM('booking', 'wallet_topup', 'wallet_transaction'),
            allowNull: false
        },
        reference_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        qr_code_data: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        receipt_data: {
            type: DataTypes.JSON,
            allowNull: false
        },
        created_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        }
    }, {
        tableName: 'receipts',
        timestamps: false,
        indexes: [
            {
                fields: ['receipt_number']
            },
            {
                fields: ['receipt_type', 'reference_id']
            }
        ]
    });

    Receipt.associate = function (models) {
        Receipt.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });
    };

    return Receipt;
};
