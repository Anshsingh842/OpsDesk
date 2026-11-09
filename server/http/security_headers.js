// server/http/security_headers.js
// S7: Strict security headers enforced on every HTTP response.
// Protects against XSS, clickjacking, MIME-sniffing, and data leakage.

function applySecurityHeaders(res) {
  // Strict CSP: No unsafe-inline or unsafe-eval for scripts. Only self-hosted scripts.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

module.exports = {
  applySecurityHeaders
};
