'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.addColumn('trips', 'actual_start_time', {
            type: Sequelize.DATE,
            allowNull: true,
            after: 'start_time'
        });

        await queryInterface.addColumn('trips', 'actual_end_time', {
            type: Sequelize.DATE,
            allowNull: true,
            after: 'end_time'
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.removeColumn('trips', 'actual_start_time');
        await queryInterface.removeColumn('trips', 'actual_end_time');
    }
}; 