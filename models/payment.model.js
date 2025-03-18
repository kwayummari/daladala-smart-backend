module.exports = (sequelize, DataTypes) => {
    const Payment = sequelize.define('Payment', {
      payment_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      booking_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'TZS'
      },
      payment_method: {
        type: DataTypes.ENUM('cash', 'mobile_money', 'card', 'wallet'),
        allowNull: false
      },
      transaction_id: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      payment_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded'),
        allowNull: false,
        defaultValue: 'pending'
      },
      payment_details: {
        type: DataTypes.JSON,
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
      tableName: 'payments',
      timestamps: false
    });
  
    return Payment;
  };