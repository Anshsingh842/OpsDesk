// tools/capture_authenticated.js
// Uses Chrome DevTools Protocol (CDP) via native Node.js 22 WebSocket to set the session cookie
// and capture authenticated screenshots of all primary operations screens.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const baseDir = path.resolve(__dirname, '..');
const nodeExe = path.join(baseDir, 'runtime', 'node.exe');
const serverJs = path.join(baseDir, 'server', 'index.js');
const screenshotsDir = path.join(baseDir, 'docs', 'screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const browserExe = chromePaths.find(p => fs.existsSync(p));

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function httpPost(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(data);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'X-OpsDesk-Request': '1',
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
  console.log('Starting OpsDesk server...');
  const serverProc = spawn(nodeExe, ['--no-warnings', serverJs], { cwd: baseDir });

  await wait(1500);
  const portFile = path.join(baseDir, 'data', 'port.txt');
  let port = 4173;
  if (fs.existsSync(portFile)) port = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);

  console.log(`Authenticating as lead@tbo.example on port ${port}...`);
  const loginRes = await httpPost(`http://127.0.0.1:${port}/api/auth/login`, {
    email: 'lead@tbo.example',
    password: 'Demo@123'
  });

  const cookieHeader = (loginRes.headers['set-cookie'] || [])[0] || '';
  const tokenMatch = cookieHeader.match(/opsdesk_session=([^;]+)/);
  const sessionToken = tokenMatch ? tokenMatch[1] : null;
  console.log('Obtained session token:', sessionToken ? sessionToken.slice(0, 10) + '...' : 'NONE');

  // Spawn Chrome with remote debugging
  const cdpPort = 9222;
  const userDataDir = path.join(baseDir, 'data', 'chrome_cdp_profile');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  console.log('Spawning Chrome with remote debugging on port', cdpPort);
  const chromeProc = spawn(browserExe, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    'about:blank'
  ]);

  await wait(1500);

  // Fetch page websocket target from json/list
  const targets = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${cdpPort}/json/list`, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const wsUrl = pageTarget.webSocketDebuggerUrl;
  console.log('Connected to Page CDP endpoint:', wsUrl);

  const ws = new WebSocket(wsUrl);

  await new Promise(resolve => ws.onopen = resolve);

  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  };

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Set session cookie
  await sendCommand('Network.enable');
  await sendCommand('Page.enable');

  await sendCommand('Network.setCookie', {
    name: 'opsdesk_session',
    value: sessionToken,
    domain: '127.0.0.1',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict'
  });

  console.log('Session cookie configured in headless browser.');

  // Function to capture screenshot of URL
  async function capturePage(hash, filename, width = 1280, height = 850) {
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600
    });

    const targetUrl = `http://127.0.0.1:${port}/${hash}`;
    await sendCommand('Page.navigate', { url: targetUrl });
    await wait(600); // Wait for API fetch and render

    const result = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(result.data, 'base64');
    const outPath = path.join(screenshotsDir, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Captured ${filename} (${buffer.length} bytes)`);
  }

  try {
    await capturePage('#dashboard', '02_dashboard_live.png');
    await capturePage('#queues?queue=all', '03_queues_live.png');
    await capturePage('#ticket/TBO-1003', '04_ticket_detail_live.png');
    await capturePage('#new-ticket', '05_new_ticket_live.png');
    await capturePage('#insights', '06_insights_live.png');
    await capturePage('#settings', '07_settings_live.png');
    await capturePage('#queues?queue=all', '08_mobile_queues_live.png', 390, 844);
    console.log('All live authenticated screenshots captured successfully!');
  } finally {
    ws.close();
    chromeProc.kill();
    // Stop server
    const stopJs = path.join(baseDir, 'tools', 'stop.js');
    spawn(nodeExe, [stopJs], { cwd: baseDir });
  }
}

run().catch(err => {
  console.error('[CDP_ERROR]', err);
  process.exit(1);
});
