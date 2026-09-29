const crypto = require('crypto');

const DEV_JWT_SECRET = 'ezymed-dev-secret-change-in-production';
const isProduction = process.env.NODE_ENV === 'production';

function validateSecretsOnStartup() {
  if (!isProduction) return;

  const missing = [];
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.ENCRYPTION_KEY) missing.push('ENCRYPTION_KEY');

  if (missing.length) {
    console.error(`Production startup blocked: missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction) {
    throw new Error('JWT_SECRET is not configured');
  }
  return DEV_JWT_SECRET;
}

function getEncryptionKey() {
  const source = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (source) {
    return crypto.createHash('sha256').update(String(source)).digest();
  }
  if (isProduction) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  return crypto.createHash('sha256').update(DEV_JWT_SECRET).digest();
}

module.exports = {
  validateSecretsOnStartup,
  getJwtSecret,
  getEncryptionKey,
  isProduction,
};
