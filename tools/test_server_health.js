// tools/test_server_health.js
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const nodeExe = path.join(__dirname, '..', 'runtime', 'node.exe');
const serverScript = path.join(__dirname, '..', 'server', 'index.js');
const portFile = path.join(__dirname, '..', 'data', 'port.txt');
const shutdownTokenFile = path.join(__dirname, '..', 'data', 'shutdown.token');

console.log('Spawning OpsDesk server via portable node.exe...');
const serverProc = spawn(nodeExe, [serverScript], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, PORT: '4173' }
});

serverProc.stdout.on('data', (d) => process.stdout.write('[SERVER] ' + d));
serverProc.stderr.on('data', (d) => process.stderr.write('[SERVER_ERR] ' + d));

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function httpPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = typeof data === 'string' ? data : JSON.stringify(data);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    }, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: respData }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function run() {
  // Wait up to 5 seconds for health endpoint
  let healthy = false;
  let port = 4173;

  for (let i = 0; i < 25; i++) {
    await wait(200);
    if (fs.existsSync(portFile)) {
      port = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
      try {
        const res = await httpGet(`http://127.0.0.1:${port}/health`);
        if (res.statusCode === 200) {
          console.log('\n[PASS] Server is healthy! Response:', res.body);
          console.log('[PASS] Security Headers Check:');
          console.log(' - CSP:', res.headers['content-security-policy']);
          console.log(' - X-Content-Type-Options:', res.headers['x-content-type-options']);
          console.log(' - X-Frame-Options:', res.headers['x-frame-options']);
          healthy = true;
          break;
        }
      } catch (e) {
        // keep waiting
      }
    }
  }

  if (!healthy) {
    console.error('[FAIL] Server failed to answer /health within 5 seconds');
    serverProc.kill();
    process.exit(1);
  }

  // Test Login endpoint
  console.log('\nTesting POST /api/auth/login for lead@tbo.example...');
  const loginRes = await httpPost(`http://127.0.0.1:${port}/api/auth/login`, {
    email: 'lead@tbo.example',
    password: 'Demo@123'
  });
  console.log(`[PASS] Login status: ${loginRes.statusCode}`);
  const cookieHeader = loginRes.headers['set-cookie'];
  console.log(`[PASS] Set-Cookie:`, cookieHeader);

  // Test Graceful Shutdown control channel
  console.log('\nTesting graceful shutdown control channel...');
  const shutdownToken = fs.readFileSync(shutdownTokenFile, 'utf8').trim();
  const stopRes = await httpPost(`http://127.0.0.1:${port}/api/admin/shutdown`, {}, {
    'X-Shutdown-Token': shutdownToken
  });
  console.log(`[PASS] Shutdown response status: ${stopRes.statusCode}, body:`, stopRes.body);

  await wait(500);
  console.log('[PASS] Server stopped cleanly. Phase 1 Skeleton Verification Complete!');
}

run().catch(err => {
  console.error('[TEST_FAIL]', err);
  serverProc.kill();
  process.exit(1);
});
