
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    user_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    first_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    last_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.STRING(15),
      allowNull: false,
      unique: true
    },
    national_id: {
      type: DataTypes.STRING(30),
      allowNull: true,
      unique: true
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    profile_picture: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    verification_token: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    reset_token: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    reset_token_expires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    },
    verification_code: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    verification_code_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended', 'deleted', 'pending'),
      allowNull: false,
      defaultValue: 'pending'
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
    tableName: 'users',
    timestamps: false,
    indexes: [
      {
        fields: ['phone']
      },
      {
        fields: ['national_id']
      }
    ]
  });

  User.associate = function (models) {
    User.belongsTo(models.UserRole, {
      foreignKey: 'role_id',
      as: 'role'
    });

    User.hasOne(models.Driver, {
      foreignKey: 'user_id',
      as: 'driver_profile'
    });

    User.hasMany(models.Booking, {
      foreignKey: 'user_id',
      as: 'bookings'
    });

    User.hasMany(models.PreBooking, {
      foreignKey: 'user_id',
      as: 'pre_bookings'
    });

    User.hasMany(models.OnDemandRequest, {
      foreignKey: 'requested_by',
      as: 'on_demand_requests'
    });

    User.hasMany(models.BusinessAccount, {
      foreignKey: 'user_id',
      as: 'business_accounts'
    });

    User.hasMany(models.Receipt, {
      foreignKey: 'user_id',
      as: 'receipts'
    });
  };

  return User;
};