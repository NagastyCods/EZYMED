const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function getEncryptionKey() {
  const source = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'ezymed-dev-secret-change-in-production';
  return crypto.createHash('sha256').update(String(source)).digest();
}

function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(stored) {
  if (stored == null || stored === '') return stored;
  if (!isEncrypted(stored)) return stored;

  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return stored;

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivB64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptIfNeeded(value) {
  if (value == null || value === '') return value;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptIfNeeded,
};
