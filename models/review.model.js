module.exports = (sequelize, DataTypes) => {
    const Review = sequelize.define('Review', {
      review_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      trip_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      driver_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      rating: {
        type: DataTypes.DECIMAL(3, 2),
        allowNull: false
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      review_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      is_anonymous: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
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
      tableName: 'reviews',
      timestamps: false
    });
  
    return Review;
  };