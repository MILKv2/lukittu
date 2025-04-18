import crypto from 'crypto';
import { logger } from '../logging/logger';

if (!process.env.ENCRYPTION_KEY) {
  logger.error('Missing ENCRYPTION_KEY in environment variables');
  throw new Error('ENCRYPTION_KEY is not set');
}

if (!process.env.HMAC_KEY) {
  logger.error('Missing HMAC_KEY in environment variables');
  throw new Error('HMAC_KEY is not set');
}

const ENCRYPTION_KEY =
  process.env.NODE_ENV === 'test'
    ? 'test-encryption-key'.padEnd(32, '0')
    : process.env.ENCRYPTION_KEY;

const HMAC_KEY =
  process.env.NODE_ENV === 'test' ? 'test-hmac-key' : process.env.HMAC_KEY;

const IV_LENGTH = 16;

export function encryptLicenseKey(licenseKey: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );

    let encrypted = cipher.update(licenseKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (error) {
    logger.error('Error occurred in encryptLicenseKey:', error);
    throw new Error('Encryption failed');
  }
}

export function decryptLicenseKey(encryptedString: string): string {
  try {
    const [ivHex, encryptedData, authTagHex] = encryptedString.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error('Error occurred in decryptLicenseKey:', error);
    throw new Error('Decryption failed');
  }
}

export function generateHMAC(licenseKey: string): string {
  try {
    return crypto
      .createHmac('sha256', HMAC_KEY)
      .update(licenseKey)
      .digest('hex');
  } catch (error) {
    logger.error('Error occurred in generateHMAC:', error);
    throw new Error('HMAC generation failed');
  }
}
