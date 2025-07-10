
module.exports = (sequelize, DataTypes) => {
    const FareCalculator = sequelize.define('FareCalculator', {
        fare_calc_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        fare_type: {
            type: DataTypes.ENUM('regular', 'on_demand'),
            allowNull: false,
            defaultValue: 'regular'
        },
        base_fare: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 2000.00
        },
        price_per_km: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 200.00
        },
        multiplier: {
            type: DataTypes.DECIMAL(3, 2),
            allowNull: false,
            defaultValue: 1.00
        },
        minimum_fare: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 500.00
        },
        maximum_fare: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        effective_from: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        effective_to: {
            type: DataTypes.DATEONLY,
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
        tableName: 'fare_calculator',
        timestamps: false,
        indexes: [
            {
                fields: ['fare_type']
            },
            {
                fields: ['is_active']
            },
            {
                fields: ['effective_from', 'effective_to']
            }
        ]
    });

    return FareCalculator;
};
