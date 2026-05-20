import pg from 'pg';
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

const { Pool } = pg;

// Create a new pool using the configuration from env.js
const pool = new Pool({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  // Recommended production settings
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

/**
 * Executes a parameterized SQL query.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<object>} - Query result
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed PostgreSQL query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('PostgreSQL Query Error', { text, error: error.message });
    throw error;
  }
}

/**
 * Gets a client from the pool for transactions.
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default {
  query,
  getClient,
  pool,
};
