// server/http/request_body.js
// S6 & S14: Safe request body streaming with strict size limits and robust error handling.

const MAX_BODY_SIZE = 1024 * 1024; // 1MB maximum payload

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let totalSize = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error('Payload Too Large: Maximum allowed body size is 1MB'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        return resolve({});
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(new Error('Invalid JSON: Root must be a JSON object'));
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error('Malformed JSON payload'));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  parseJsonBody,
  MAX_BODY_SIZE
};
