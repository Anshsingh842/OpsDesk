// tools/wait_ready.js
// Health check waiter invoked by '1 START OpsDesk.bat'.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const portFile = path.join(__dirname, '..', 'data', 'port.txt');

async function check() {
  for (let i = 0; i < 30; i++) {
    if (fs.existsSync(portFile)) {
      const port = fs.readFileSync(portFile, 'utf8').trim();
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (res) => {
            if (res.statusCode === 200) resolve();
            else reject(new Error('Status ' + res.statusCode));
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        console.log(`READY:${port}`);
        process.exit(0);
      } catch (e) {
        // keep waiting
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.error('TIMED_OUT');
  process.exit(1);
}

check();
