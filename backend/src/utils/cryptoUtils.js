const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
// ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') : null;
const IV_LENGTH = 16;

/**
 * Encrypts a JSON object into a securely encrypted string.
 * @param {Object} data 
 * @returns {string} iv:authTag:encryptedData in hex
 */
function encryptData(data) {
  if (!ENCRYPTION_KEY) {
    console.warn("WARNING: ENCRYPTION_KEY is not set in .env. Falling back to unencrypted storage.");
    return JSON.stringify(data);
  }
  
  const text = JSON.stringify(data);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedText
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a previously encrypted string back into a JSON object.
 * @param {string} encryptedString 
 * @returns {Object}
 */
function decryptData(encryptedString) {
  if (!ENCRYPTION_KEY) {
    // Fallback if no key is present (assuming it was saved unencrypted)
    try {
      return JSON.parse(encryptedString);
    } catch(e) {
      throw new Error("Missing ENCRYPTION_KEY, and data is not plain JSON.");
    }
  }

  // If the string doesn't have our format, maybe it's unencrypted JSON
  if (!encryptedString.includes(':')) {
    try {
      return JSON.parse(encryptedString);
    } catch(e) {
      throw new Error("Invalid encryption format.");
    }
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) throw new Error("Invalid encryption format.");
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

/**
 * Generates a SHA-256 hash for a JSON object.
 * @param {Object} data 
 * @returns {string} SHA-256 hash
 */
function generateSHA256Hash(data) {
  const hash = crypto.createHash('sha256');
  // Sort keys to ensure consistent hashing if objects are identical
  const stringified = JSON.stringify(data, Object.keys(data).sort());
  hash.update(stringified);
  return hash.digest('hex');
}

module.exports = {
  encryptData,
  decryptData,
  generateSHA256Hash
};
