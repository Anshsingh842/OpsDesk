// server/http/router.js
// High-performance, zero-dependency REST router with CSRF defense, Request ID, and safe error handling.

const crypto = require('node:crypto');
const { applySecurityHeaders } = require('./security_headers');
const { parseCookie, validateSession } = require('../auth/sessions');
const { checkApiRateLimit } = require('../auth/rate_limit');

class Router {
  constructor(db) {
    this.db = db;
    this.routes = [];
  }

  add(method, pathPattern, ...handlers) {
    // Convert path pattern like /api/tickets/:id to regex and param names
    const paramNames = [];
    const regexSource = '^' + pathPattern.replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    }) + '$';

    this.routes.push({
      method: method.toUpperCase(),
      regex: new RegExp(regexSource),
      paramNames,
      handlers
    });
  }

  get(path, ...handlers) { this.add('GET', path, ...handlers); }
  post(path, ...handlers) { this.add('POST', path, ...handlers); }
  put(path, ...handlers) { this.add('PUT', path, ...handlers); }
  patch(path, ...handlers) { this.add('PATCH', path, ...handlers); }
  delete(path, ...handlers) { this.add('DELETE', path, ...handlers); }

  async handle(req, res) {
    const requestId = crypto.randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    applySecurityHeaders(res);

    const clientIp = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress || '127.0.0.1';
    req.clientIp = clientIp;

    // Rate limiting on API routes
    if (req.url.startsWith('/api/')) {
      const rateCheck = checkApiRateLimit(clientIp);
      if (!rateCheck.allowed) {
        res.writeHead(429, {
          'Content-Type': 'application/json; charset=utf-8',
          'Retry-After': String(rateCheck.retryAfterSec)
        });
        res.end(JSON.stringify({
          error: true,
          message: 'Rate limit exceeded. Please slow down.',
          requestId
        }));
        return;
      }
    }

    // CSRF Defense for state-changing HTTP methods
    const method = req.method.toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      // Exempt login and shutdown
      const urlPath = req.url.split('?')[0];
      const isExempt = urlPath === '/api/auth/login' || urlPath === '/api/admin/shutdown';

      if (!isExempt) {
        const customHeader = req.headers['x-opsdesk-request'] || req.headers['x-requested-with'];
        if (!customHeader) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            error: true,
            message: 'CSRF Defense: Missing required X-OpsDesk-Request security header.',
            requestId
          }));
          return;
        }

        // Validate Origin / Host if Origin is present
        const origin = req.headers.origin;
        const host = req.headers.host;
        if (origin && host) {
          try {
            const originHost = new URL(origin).host;
            if (originHost !== host) {
              res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({
                error: true,
                message: 'CSRF Defense: Cross-origin state mutation forbidden.',
                requestId
              }));
              return;
            }
          } catch (e) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: true, message: 'Invalid Origin header.', requestId }));
            return;
          }
        }
      }
    }

    // Authenticate session if present
    const rawToken = parseCookie(req) || (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
    if (rawToken) {
      try {
        const session = validateSession(this.db, rawToken);
        if (session) {
          req.session = session;
          req.user = {
            id: session.user_id,
            tenant_id: session.tenant_id,
            email: session.email,
            name: session.name,
            role: session.role,
            agency_id: session.agency_id,
            agency_name: session.agency_name,
            agency_code: session.agency_code,
            region: session.region,
            rank: session.rank,
            skills: session.skills,
            is_available: session.is_available
          };
        }
      } catch (err) {
        console.error('Session validation error:', err.message);
      }
    }

    const [urlPath, queryString] = req.url.split('?');
    req.path = urlPath;
    req.query = Object.fromEntries(new URLSearchParams(queryString || ''));

    // Match route
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = urlPath.match(route.regex);
      if (match) {
        req.params = {};
        route.paramNames.forEach((name, i) => {
          req.params[name] = decodeURIComponent(match[i + 1]);
        });

        // Execute handler chain
        try {
          for (const handler of route.handlers) {
            let nextCalled = false;
            const next = () => { nextCalled = true; };
            await handler(req, res, next);
            if (!nextCalled) break;
          }
        } catch (err) {
          console.error(`[REQUEST_ERROR] ${requestId} ${method} ${urlPath}:`, err.message);
          if (!res.headersSent) {
            const statusCode = err.status || 500;
            res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: true,
              message: err.message || 'An unexpected error occurred',
              requestId
            }));
          }
        }
        return true;
      }
    }

    return false; // Route not matched
  }
}

// Authorization middleware helpers
function requireAuth(req, res, next) {
  if (!req.user) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: true,
      message: 'Authentication required. Please log in.',
      requestId: req.id
    }));
    return;
  }
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: true, message: 'Authentication required', requestId: req.id }));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: true,
        message: `Forbidden: This action requires one of the following roles: ${allowedRoles.join(', ')}`,
        requestId: req.id
      }));
      return;
    }
    next();
  };
}

module.exports = {
  Router,
  requireAuth,
  requireRole
};
