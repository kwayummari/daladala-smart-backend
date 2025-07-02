module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    payment_id: {
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
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'user_id'
      }
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
        isDecimal: true
      }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'TZS',
      validate: {
        isIn: [['TZS', 'USD', 'KES']]
      }
    },
    payment_method: {
      type: DataTypes.ENUM('cash', 'mobile_money', 'card', 'wallet', 'bank_transfer'),
      allowNull: false
    },
    payment_provider: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Payment provider like ZenoPay, Stripe, etc.'
    },
    transaction_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      comment: 'External transaction ID from payment provider'
    },
    internal_reference: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      comment: 'Internal reference for tracking'
    },
    payment_time: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Actual payment completion time'
    },
    initiated_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Payment initiation time'
    },
    status: {
      type: DataTypes.ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled', 'expired'),
      allowNull: false,
      defaultValue: 'pending'
    },
    failure_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for payment failure'
    },
    payment_details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional payment details and metadata'
    },
    webhook_data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Webhook data received from payment provider'
    },
    refund_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    refund_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    commission_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: 0
      },
      comment: 'Commission charged by payment provider'
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
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['booking_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['transaction_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['payment_method']
      },
      {
        fields: ['created_at']
      }
    ],
    hooks: {
      beforeUpdate: (payment, options) => {
        payment.updated_at = new Date();
      }
    }
  });

  // Instance methods
  Payment.prototype.isCompleted = function () {
    return this.status === 'completed';
  };

  Payment.prototype.isPending = function () {
    return this.status === 'pending';
  };

  Payment.prototype.isFailed = function () {
    return ['failed', 'cancelled', 'expired'].includes(this.status);
  };

  Payment.prototype.canRefund = function () {
    return this.status === 'completed' && this.refund_amount < this.amount;
  };

  // Class methods
  Payment.findByTransactionId = function (transactionId) {
    return this.findOne({
      where: { transaction_id: transactionId }
    });
  };

  Payment.findByBookingId = function (bookingId) {
    return this.findOne({
      where: { booking_id: bookingId }
    });
  };

  Payment.getTotalRevenue = async function (startDate, endDate) {
    const { Op } = require('sequelize');
    const result = await this.findOne({
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_revenue'],
        [sequelize.fn('COUNT', sequelize.col('payment_id')), 'total_transactions']
      ],
      where: {
        status: 'completed',
        payment_time: {
          [Op.between]: [startDate, endDate]
        }
      }
    });
    return result;
  };

  return Payment;
};