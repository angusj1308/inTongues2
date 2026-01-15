/**
 * Highlight Colors Utility
 *
 * Color system for word status highlighting.
 * Mirrors: src/constants/highlightColors.js
 */

// Base highlight color (orange)
export const HIGHLIGHT_COLOR = '#FF6B35';

// Status colors for buttons and indicators
export const STATUS_COLORS = {
  new: '#FF6B35',       // Orange - brand new word
  unknown: '#FF6B35',   // Orange - seen but not learned
  recognised: '#FFA07A', // Light salmon - starting to recognize
  familiar: '#FFD700',   // Gold - becoming familiar
  known: '#4CAF50',      // Green - fully known
};

// Status labels
export const STATUS_LABELS = {
  new: 'New',
  unknown: 'Unknown',
  recognised: 'Recognised',
  familiar: 'Familiar',
  known: 'Known',
};

// Status intensity for blending with white
// Higher = more orange, lower = more white
const STATUS_INTENSITY = {
  new: 1.0,
  unknown: 1.0,
  recognised: 0.7,
  familiar: 0.4,
  known: 0,
};

/**
 * Blend a color with white based on intensity
 * @param {string} color Hex color
 * @param {number} intensity 0-1, where 1 is full color and 0 is white
 * @returns {string} Blended hex color
 */
function blendWithWhite(color, intensity) {
  // Parse hex color
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // Blend with white (255, 255, 255)
  const blendedR = Math.round(r * intensity + 255 * (1 - intensity));
  const blendedG = Math.round(g * intensity + 255 * (1 - intensity));
  const blendedB = Math.round(b * intensity + 255 * (1 - intensity));

  // Convert back to hex
  return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
}

/**
 * Get the display color for a word based on its status
 * @param {string} status Word status (new, unknown, recognised, familiar, known)
 * @returns {string} Hex color for display
 */
export function getWordColor(status) {
  if (status === 'known') {
    return '#ffffff'; // White for known words
  }

  const intensity = STATUS_INTENSITY[status] ?? 1.0;
  return blendWithWhite(HIGHLIGHT_COLOR, intensity);
}

/**
 * Get CSS class name for a status
 * @param {string} status Word status
 * @returns {string} CSS class name
 */
export function getStatusClassName(status) {
  return `intongues-word--${status || 'unknown'}`;
}
