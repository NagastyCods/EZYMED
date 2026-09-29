const logger = require('../services/logger');

function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Resource not found' });
}

function errorHandler(err, _req, res, _next) {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled request error');

  const status = err.status || err.statusCode || 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';

  res.status(status).json({ message, code: err.code });
}

module.exports = { notFoundHandler, errorHandler };
