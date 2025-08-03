const sequelize = require('./config/db.config');

async function runMigration() {
    try {
        console.log('Running migration to add actual_start_time and actual_end_time columns...');

        await sequelize.query(`
      ALTER TABLE trips 
      ADD COLUMN actual_start_time DATETIME NULL AFTER start_time,
      ADD COLUMN actual_end_time DATETIME NULL AFTER end_time
    `);

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        if (error.message.includes('Duplicate column name')) {
            console.log('✅ Columns already exist, skipping migration.');
            process.exit(0);
        } else {
            console.error('❌ Migration failed:', error.message);
            process.exit(1);
        }
    }
}

runMigration(); 