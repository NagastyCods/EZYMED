const mongoose = require('mongoose');
const logger = require('../services/logger');

let connectionPromise;

function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (connectionPromise) return connectionPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    const err = new Error('MONGODB_URI is not configured');
    err.code = 'DB_NOT_CONFIGURED';
    return Promise.reject(err);
  }

  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  }).then(() => {
    logger.info('MongoDB connected');
    return mongoose.connection;
  }).catch((err) => {
    connectionPromise = null;
    throw err;
  });

  return connectionPromise;
}

module.exports = connectDB;
