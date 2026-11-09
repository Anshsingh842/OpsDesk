// tools/contrast_check.js
// WCAG 2.1 AA Contrast Ratio Verification Script.
// Verifies that text colors achieve at least 4.5:1 contrast against their surface backgrounds.

function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]) {
  const srgb = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const PALETTE = [
  // Light Theme Pairs
  { theme: 'Light', element: 'Main text on Surface', fg: '#0f172a', bg: '#ffffff' },
  { theme: 'Light', element: 'Muted text on Surface', fg: '#475569', bg: '#ffffff' },
  { theme: 'Light', element: 'Accent text on Accent subtle', fg: '#134e4a', bg: '#ccfbf1' },
  { theme: 'Light', element: 'Accent main button text', fg: '#ffffff', bg: '#0f766e' },
  { theme: 'Light', element: 'Status OK badge', fg: '#166534', bg: '#dcfce7' },
  { theme: 'Light', element: 'Status Risk badge', fg: '#92400e', bg: '#fef3c7' },
  { theme: 'Light', element: 'Status Breached badge', fg: '#991b1b', bg: '#fee2e2' },
  { theme: 'Light', element: 'Internal note text', fg: '#78350f', bg: '#fffbeb' },

  // Dark Theme Pairs
  { theme: 'Dark', element: 'Main text on Dark Surface', fg: '#f9fafb', bg: '#111827' },
  { theme: 'Dark', element: 'Muted text on Dark Surface', fg: '#9ca3af', bg: '#111827' },
  { theme: 'Dark', element: 'Accent text on Accent subtle', fg: '#ccfbf1', bg: '#134e4a' },
  { theme: 'Dark', element: 'Dark button text on Accent main', fg: '#0b0f19', bg: '#14b8a6' },
  { theme: 'Dark', element: 'Dark Status OK badge', fg: '#86efac', bg: '#064e3b' },
  { theme: 'Dark', element: 'Dark Status Risk badge', fg: '#fde68a', bg: '#78350f' },
  { theme: 'Dark', element: 'Dark Status Breached badge', fg: '#fca5a5', bg: '#7f1d1d' },
  { theme: 'Dark', element: 'Dark Internal note text', fg: '#fef3c7', bg: '#291e0a' }
];

console.log('========================================================================');
console.log('  OpsDesk Design Tokens: WCAG AA Contrast Compliance Report (>= 4.5:1)');
console.log('========================================================================\n');

let allPassed = true;

for (const pair of PALETTE) {
  const ratio = contrastRatio(pair.fg, pair.bg);
  const passed = ratio >= 4.5;
  if (!passed) allPassed = false;

  const status = passed ? '[PASS]' : '[FAIL]';
  console.log(`${status} [${pair.theme}] ${pair.element.padEnd(34)}: ${ratio.toFixed(2)}:1  (${pair.fg} on ${pair.bg})`);
}

console.log('\n------------------------------------------------------------------------');
if (allPassed) {
  console.log('RESULT: 100% of tested design token pairs satisfy WCAG 2.1 AA (4.5:1).');
} else {
  console.log('RESULT: One or more pairs failed WCAG 2.1 AA requirement.');
  process.exit(1);
}
