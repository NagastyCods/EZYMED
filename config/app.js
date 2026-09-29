function getAppUrl() {
  const url = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return url.replace(/\/$/, '');
}

function getAllowedOrigins() {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV === 'production') {
    return [getAppUrl()];
  }
  return '*';
}

module.exports = { getAppUrl, getAllowedOrigins };
