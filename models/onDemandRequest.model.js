
// models/onDemandRequest.model.js
module.exports = (sequelize, DataTypes) => {
    const OnDemandRequest = sequelize.define('OnDemandRequest', {
        request_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        requested_by: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'user_id'
            }
        },
        pickup_location: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        pickup_latitude: {
            type: DataTypes.DECIMAL(10, 8),
            allowNull: true
        },
        pickup_longitude: {
            type: DataTypes.DECIMAL(11, 8),
            allowNull: true
        },
        destination_location: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        destination_latitude: {
            type: DataTypes.DECIMAL(10, 8),
            allowNull: true
        },
        destination_longitude: {
            type: DataTypes.DECIMAL(11, 8),
            allowNull: true
        },
        passenger_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        estimated_fare: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: true
        },
        distance_km: {
            type: DataTypes.DECIMAL(8, 2),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'collecting_passengers', 'driver_assigned', 'in_progress', 'completed', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending'
        },
        minimum_passengers: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 10
        },
        current_passengers: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        driver_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'drivers',
                key: 'driver_id'
            }
        },
        vehicle_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'vehicles',
                key: 'vehicle_id'
            }
        },
        trip_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'trips',
                key: 'trip_id'
            }
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
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
        tableName: 'on_demand_requests',
        timestamps: false,
        indexes: [
            {
                fields: ['status']
            },
            {
                fields: ['expires_at']
            }
        ]
    });

    OnDemandRequest.associate = function (models) {
        OnDemandRequest.belongsTo(models.User, {
            foreignKey: 'requested_by',
            as: 'requester'
        });

        OnDemandRequest.belongsTo(models.Driver, {
            foreignKey: 'driver_id',
            as: 'driver'
        });

        OnDemandRequest.belongsTo(models.Vehicle, {
            foreignKey: 'vehicle_id',
            as: 'vehicle'
        });

        OnDemandRequest.belongsTo(models.Trip, {
            foreignKey: 'trip_id',
            as: 'trip'
        });

        OnDemandRequest.hasMany(models.OnDemandParticipant, {
            foreignKey: 'request_id',
            as: 'participants'
        });
    };

    return OnDemandRequest;
};
