// tools/stop.js
// Graceful shutdown client invoked by '2 STOP OpsDesk.bat'.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const portFile = path.join(__dirname, '..', 'data', 'port.txt');
const pidFile = path.join(__dirname, '..', 'data', 'pid.txt');
const tokenFile = path.join(__dirname, '..', 'data', 'shutdown.token');

if (!fs.existsSync(portFile) || !fs.existsSync(tokenFile)) {
  console.log('OpsDesk is not currently running (no active port/token file found).');
  process.exit(0);
}

const port = fs.readFileSync(portFile, 'utf8').trim();
const token = fs.readFileSync(tokenFile, 'utf8').trim();

const req = http.request({
  hostname: '127.0.0.1',
  port: parseInt(port, 10),
  path: '/api/admin/shutdown',
  method: 'POST',
  headers: {
    'X-Shutdown-Token': token,
    'Content-Type': 'application/json'
  },
  timeout: 3000
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('OpsDesk stopped gracefully.');
    try { if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile); } catch (e) {}
    try { if (fs.existsSync(portFile)) fs.unlinkSync(portFile); } catch (e) {}
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.log('Graceful stop request could not connect. Server might already be stopped.');
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();
