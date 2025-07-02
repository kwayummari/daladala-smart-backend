// migrations/YYYYMMDD-create-payments-table.js
'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('payments', {
            payment_id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                allowNull: false
            },
            booking_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'bookings',
                    key: 'booking_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'user_id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false
            },
            currency: {
                type: Sequelize.STRING(3),
                allowNull: false,
                defaultValue: 'TZS'
            },
            payment_method: {
                type: Sequelize.ENUM('cash', 'mobile_money', 'card', 'wallet', 'bank_transfer'),
                allowNull: false
            },
            payment_provider: {
                type: Sequelize.STRING(50),
                allowNull: true
            },
            transaction_id: {
                type: Sequelize.STRING(100),
                allowNull: true,
                unique: true
            },
            internal_reference: {
                type: Sequelize.STRING(50),
                allowNull: true,
                unique: true
            },
            payment_time: {
                type: Sequelize.DATE,
                allowNull: true
            },
            initiated_time: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            status: {
                type: Sequelize.ENUM('pending', 'completed', 'failed', 'refunded', 'cancelled', 'expired'),
                allowNull: false,
                defaultValue: 'pending'
            },
            failure_reason: {
                type: Sequelize.TEXT,
                allowNull: true
            },
            payment_details: {
                type: Sequelize.JSON,
                allowNull: true
            },
            webhook_data: {
                type: Sequelize.JSON,
                allowNull: true
            },
            refund_amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
                defaultValue: 0
            },
            refund_time: {
                type: Sequelize.DATE,
                allowNull: true
            },
            commission_amount: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
                defaultValue: 0
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.NOW
            }
        });

        // Add indexes for better performance
        await queryInterface.addIndex('payments', ['booking_id']);
        await queryInterface.addIndex('payments', ['user_id']);
        await queryInterface.addIndex('payments', ['transaction_id']);
        await queryInterface.addIndex('payments', ['status']);
        await queryInterface.addIndex('payments', ['payment_method']);
        await queryInterface.addIndex('payments', ['created_at']);
        await queryInterface.addIndex('payments', ['payment_time']);
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('payments');
    }
};