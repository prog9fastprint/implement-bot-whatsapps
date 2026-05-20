import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Migration script to initialize the PostgreSQL database schema.
 * Reads database/init.sql and executes it against the configured database.
 */
async function migrate() {
  const sqlPath = path.join(__dirname, '../../database/init.sql');
  
  try {
    logger.info('Starting database migration...');

    // Step 1: Connect to default 'postgres' database to ensure our target DB exists
    const adminClient = new pg.Client({
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: 'postgres',
    });

    await adminClient.connect();
    
    const dbCheck = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [config.POSTGRES_DB]
    );

    if (dbCheck.rowCount === 0) {
      logger.info(`Database "${config.POSTGRES_DB}" not found. Creating it...`);
      // CREATE DATABASE cannot be run in a transaction, and we're using a simple query here
      await adminClient.query(`CREATE DATABASE ${config.POSTGRES_DB}`);
      logger.info(`✅ Database "${config.POSTGRES_DB}" created.`);
    }
    
    await adminClient.end();

    // Step 2: Connect to the target database and run the schema
    const targetClient = new pg.Client({
      host: config.POSTGRES_HOST,
      port: config.POSTGRES_PORT,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      database: config.POSTGRES_DB,
    });

    await targetClient.connect();

    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Migration file not found at: ${sqlPath}`);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    logger.info('Applying schema from init.sql...');
    await targetClient.query(sql);
    
    await targetClient.end();
    
    logger.info('✅ Database migration completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Database migration failed:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Run the migration
migrate();
