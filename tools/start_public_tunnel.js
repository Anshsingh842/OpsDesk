// tools/start_public_tunnel.js
// Launches Cloudflare tunnel using bundled node.exe and cloudflared.exe (Zero external dependencies).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const baseDir = path.resolve(__dirname, '..');
const cfExe = path.join(baseDir, 'tools', 'cloudflared.exe');
const dataDir = path.join(baseDir, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const portFile = path.join(dataDir, 'port.txt');
const urlFile = path.join(dataDir, 'public_url.txt');

let port = 4173;
if (fs.existsSync(portFile)) {
  port = parseInt(fs.readFileSync(portFile, 'utf8').trim(), 10);
}

console.log(`Connecting tunnel to local port ${port}...`);

const proc = spawn(cfExe, ['tunnel', '--url', `http://127.0.0.1:${port}`]);

let foundUrl = false;

function scanOutput(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);

  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !foundUrl) {
    foundUrl = true;
    const publicUrl = match[0];
    fs.writeFileSync(urlFile, publicUrl, 'utf8');

    console.log('\n============================================================');
    console.log('  OPSDESK LIVE PUBLIC LINK:');
    console.log('  ' + publicUrl);
    console.log('============================================================\n');
    console.log('Share this link with hackathon judges or open on your phone!');
    console.log('Keep this console window open while sharing the link.\n');

    // Open default browser on the live link
    spawn('cmd.exe', ['/c', 'start', publicUrl]);
  }
}

proc.stdout.on('data', scanOutput);
proc.stderr.on('data', scanOutput);

proc.on('close', (code) => {
  console.log('Public tunnel closed.');
  try { if (fs.existsSync(urlFile)) fs.unlinkSync(urlFile); } catch (e) {}
  process.exit(code || 0);
});
