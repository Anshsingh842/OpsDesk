// web/js/api.js
// Client API layer with automated CSRF protection and centralized error handling.

export async function apiRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Accept': 'application/json',
    'X-OpsDesk-Request': '1', // S4 CSRF header
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const fetchOptions = {
    method,
    headers,
    credentials: 'same-origin',
    ...options
  };

  try {
    const res = await fetch(endpoint, fetchOptions);

    // If 401 Unauthorized, redirect to login unless already on login
    if (res.status === 401 && !endpoint.includes('/api/auth/me') && !endpoint.includes('/api/auth/login')) {
      window.location.hash = '#login';
      throw new Error('Your session has expired. Please sign in again.');
    }

    // Check for downloadable files (e.g. CSV export)
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      return res.blob();
    }

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.message || `Request failed with status ${res.status}`;
      const err = new Error(errorMsg);
      err.status = res.status;
      err.requestId = data.requestId;
      throw err;
    }

    return data;
  } catch (err) {
    console.error(`API Error on ${method} ${endpoint}:`, err);
    throw err;
  }
}
