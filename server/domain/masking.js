// server/domain/masking.js
// S9: Sensitive data masking before storage.
// Detects and redacts payment card numbers (with Luhn check) and credential patterns (OTP, CVV, password).
// Transparently catches known patterns to ensure sensitive credentials are never persisted in plain text.

function luhnCheck(numStr) {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function maskCardNumbers(text) {
  if (!text || typeof text !== 'string') return text;

  // Match sequences of digits grouped with spaces or hyphens (13 to 19 digits)
  const cardRegex = /\b(?:\d[ -]*?){13,19}\b/g;

  return text.replace(cardRegex, (match) => {
    const rawDigits = match.replace(/[\s-]/g, '');
    if (rawDigits.length >= 13 && rawDigits.length <= 19 && luhnCheck(rawDigits)) {
      const lastFour = rawDigits.slice(-4);
      return `XXXX-XXXX-XXXX-${lastFour}`;
    }
    return match;
  });
}

function maskCredentials(text) {
  if (!text || typeof text !== 'string') return text;

  // Detect words like OTP, CVV, CVC, PIN, password, pwd followed by delimiters and values
  const credRegex = /\b(otp|cvv|cvc|password|pwd|pin)\b\s*[:=]\s*([^\s,;]+)/gi;

  return text.replace(credRegex, (match, prefix, value) => {
    return `${prefix}: [REDACTED]`;
  });
}

function maskSensitiveData(text) {
  if (!text || typeof text !== 'string') return text;
  let sanitized = maskCardNumbers(text);
  sanitized = maskCredentials(sanitized);
  return sanitized;
}

module.exports = {
  luhnCheck,
  maskCardNumbers,
  maskCredentials,
  maskSensitiveData
};
