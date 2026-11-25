const { randomBytes, scryptSync, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scryptAsync = promisify(scrypt);

const SCRYPT_PARAMS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 64 });
const DUMMY_PASSWORD_HASH = buildHash('invalid-password-for-constant-time-compare', {
  salt: Buffer.alloc(16, 7),
});

function buildHash(password, { salt = randomBytes(16) } = {}) {
  const derived = scryptSync(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  });
  return [
    'scrypt',
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

function assertPasswordShape(password, minLength) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('A password is required.');
  }
  if (password.length > 256) {
    throw new TypeError('Password is too long.');
  }
  if (Number.isInteger(minLength) && password.length < minLength) {
    const error = new TypeError(`Password must be at least ${minLength} characters long.`);
    error.code = 'PASSWORD_TOO_SHORT';
    throw error;
  }
}

async function hashPassword(password, { minLength = 12 } = {}) {
  assertPasswordShape(password, minLength);
  return buildHash(password);
}

async function verifyPassword(password, storedHash) {
  if (typeof password !== 'string' || password.length > 256) return false;
  if (typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    // Still perform work so unknown/malformed hashes do not reveal account existence.
    await scryptAsync(password, Buffer.alloc(16, 7), SCRYPT_PARAMS.keyLength, SCRYPT_PARAMS);
    return false;
  }

  const [, n, r, p, saltText, hashText] = parts;
  const parameters = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  };
  if (
    !Number.isInteger(parameters.N) ||
    !Number.isInteger(parameters.r) ||
    !Number.isInteger(parameters.p) ||
    parameters.N < 1024 ||
    parameters.N > 1048576
  ) {
    return false;
  }

  let salt;
  let expected;
  try {
    salt = Buffer.from(saltText, 'base64url');
    expected = Buffer.from(hashText, 'base64url');
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const actual = await scryptAsync(password, salt, expected.length, parameters);
  return timingSafeEqual(actual, expected);
}

async function verifyDummyPassword(password) {
  return verifyPassword(password, DUMMY_PASSWORD_HASH);
}

module.exports = {
  SCRYPT_PARAMS,
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
};
