/**
 * Text Utilities
 *
 * Functions for tokenizing and processing text for display.
 */

/**
 * Tokenize text into words and non-words (punctuation, whitespace)
 * @param {string} text Text to tokenize
 * @returns {Array<{type: 'word'|'punctuation', text: string, original: string}>}
 */
export function tokenizeText(text) {
  if (!text) return [];

  const tokens = [];
  // Match words (Unicode letters) or non-words
  const regex = /(\p{L}+)|([^\p{L}]+)/gu;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      // Word
      tokens.push({
        type: 'word',
        text: match[1].toLowerCase(), // Normalized form for lookup
        original: match[1], // Original form for display
      });
    } else if (match[2]) {
      // Punctuation/whitespace
      tokens.push({
        type: 'punctuation',
        text: match[2],
        original: match[2],
      });
    }
  }

  return tokens;
}

/**
 * Clean a word for vocabulary lookup
 * @param {string} word Raw word
 * @returns {string} Cleaned word
 */
export function cleanWord(word) {
  return word
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '')
    .trim();
}

/**
 * Extract all words from text
 * @param {string} text Text to extract words from
 * @returns {string[]} Array of cleaned words
 */
export function extractWords(text) {
  return tokenizeText(text)
    .filter((t) => t.type === 'word')
    .map((t) => t.text);
}

/**
 * Normalize an expression/phrase for lookup
 * @param {string} expression Expression text
 * @returns {string} Normalized expression
 */
export function normalizeExpression(expression) {
  return expression.trim().toLowerCase();
}

/**
 * Check if text contains multiple words
 * @param {string} text Text to check
 * @returns {boolean}
 */
export function isPhrase(text) {
  const words = extractWords(text);
  return words.length > 1;
}
