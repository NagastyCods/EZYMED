require('dotenv').config();

const { createApp } = require('../app');
const connectDB = require('../config/db');

const app = createApp();

const DB_OPTIONAL_PATHS = [
  '/api/compliance/consent-options',
  '/api/compliance/privacy-notice',
  '/api/compliance/regulatory-info',
  '/api/health',
];

function requestPath(req) {
  return (req.url || '/').split('?')[0];
}

module.exports = async function handler(req, res) {
  const path = requestPath(req);
  const databaseOptional = DB_OPTIONAL_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

  try {
    await connectDB();
  } catch (err) {
    if (!databaseOptional) {
      const message = err.code === 'DB_NOT_CONFIGURED'
        ? 'Database is not configured. Set MONGODB_URI for this deployment.'
        : 'Could not reach the database. Check MONGODB_URI and try again.';
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message }));
      return;
    }
  }

  return app(req, res);
};
