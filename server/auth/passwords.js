// server/auth/passwords.js
// S2: Cryptographic password management using Node.js native crypto.scrypt.
// Stored format: scrypt$N=16384,r=8,p=1$<salt_hex>$<hash_hex>

const crypto = require('node:crypto');

const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LEN = 64;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, KEY_LEN, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P
  });

  return `scrypt$N=${DEFAULT_N},r=${DEFAULT_R},p=${DEFAULT_P}$${salt}$${derivedKey.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    return false;
  }

  // Parse parameters: N=16384,r=8,p=1
  const paramPairs = parts[1].split(',');
  const params = {};
  for (const pair of paramPairs) {
    const [k, v] = pair.split('=');
    params[k] = parseInt(v, 10);
  }

  const salt = parts[2];
  const expectedHashBuf = Buffer.from(parts[3], 'hex');

  try {
    const actualKeyBuf = crypto.scryptSync(password, salt, expectedHashBuf.length, {
      N: params.N || DEFAULT_N,
      r: params.r || DEFAULT_R,
      p: params.p || DEFAULT_P
    });

    return crypto.timingSafeEqual(expectedHashBuf, actualKeyBuf);
  } catch (err) {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword
};
