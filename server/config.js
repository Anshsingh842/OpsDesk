// server/config.js
// Centralized configuration management with safe defaults and zero external dependencies.

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const LOGS_DIR = process.env.LOGS_DIR || path.join(ROOT_DIR, 'logs');
const WEB_DIR = path.join(ROOT_DIR, 'web');

// Ensure data and logs directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Generate or load session secret securely from data directory (never hardcoded in repository)
const secretFilePath = path.join(DATA_DIR, 'session_secret.txt');
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (fs.existsSync(secretFilePath)) {
    sessionSecret = fs.readFileSync(secretFilePath, 'utf8').trim();
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFilePath, sessionSecret, { mode: 0o600 });
  }
}

// Generate local shutdown token for authenticated 127.0.0.1 termination requests
const shutdownTokenPath = path.join(DATA_DIR, 'shutdown.token');
const shutdownToken = crypto.randomBytes(24).toString('hex');
fs.writeFileSync(shutdownTokenPath, shutdownToken, { mode: 0o600 });

const IS_CLOUD = !!(process.env.RENDER || process.env.IS_CLOUD === '1' || process.env.NODE_ENV === 'production');
const HOST = process.env.HOST || (IS_CLOUD ? '0.0.0.0' : '127.0.0.1');
const PORT = parseInt(process.env.PORT || '4173', 10);
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const SEED_ON_START = process.env.SEED_ON_START !== 'false';

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  LOGS_DIR,
  WEB_DIR,
  HOST,
  PORT,
  IS_CLOUD,
  DEMO_MODE,
  SEED_ON_START,
  SESSION_SECRET: sessionSecret,
  SHUTDOWN_TOKEN: shutdownToken,
  SHUTDOWN_TOKEN_PATH: shutdownTokenPath,
  DB_PATH: path.join(DATA_DIR, 'opsdesk.sqlite3'),
  PORT_FILE: path.join(DATA_DIR, 'port.txt'),
  PID_FILE: path.join(DATA_DIR, 'pid.txt'),
  TIMEZONE: 'Asia/Kolkata'
};
