
// models/onDemandParticipant.model.js
module.exports = (sequelize, DataTypes) => {
    const OnDemandParticipant = sequelize.define('OnDemandParticipant', {
        participant_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        request_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'on_demand_requests',
                key: 'request_id'
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
        passenger_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1
        },
        fare_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('joined', 'confirmed', 'cancelled'),
            allowNull: false,
            defaultValue: 'joined'
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
        tableName: 'on_demand_participants',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['request_id', 'user_id']
            }
        ]
    });

    OnDemandParticipant.associate = function (models) {
        OnDemandParticipant.belongsTo(models.OnDemandRequest, {
            foreignKey: 'request_id',
            as: 'request'
        });

        OnDemandParticipant.belongsTo(models.User, {
            foreignKey: 'user_id',
            as: 'user'
        });
    };

    return OnDemandParticipant;
};
