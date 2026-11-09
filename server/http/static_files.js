// server/http/static_files.js
// High-performance, zero-dependency static file server with path traversal protection.

const path = require('node:path');
const fs = require('node:fs');
const { WEB_DIR } = require('../config');
const { applySecurityHeaders } = require('./security_headers');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  // Normalize path and strip query params
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\' || safePath === '') {
    safePath = '/index.html';
  }

  const filePath = path.join(WEB_DIR, safePath);

  // Security check: Path traversal prevention
  if (!filePath.startsWith(WEB_DIR)) {
    applySecurityHeaders(res);
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Access Denied');
    return true;
  }

  // Check if file exists and is a regular file
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return serveStatic(req, res, path.join(pathname, 'index.html'));
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    applySecurityHeaders(res);

    // Cache font files and immutable assets for 1 day, HTML/JS/CSS no-cache for instant development updates
    if (ext === '.woff2' || ext === '.woff' || ext === '.ttf') {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // Not a static file, let router handle or 404
    }
    applySecurityHeaders(res);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
    return true;
  }
}

module.exports = {
  serveStatic
};
