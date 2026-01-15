/**
 * API Client Service
 *
 * Handles communication with the inTongues backend server.
 */

// TODO: Replace with your actual server URL
const API_BASE_URL = 'https://intongues2.vercel.app/api';

export class ApiClient {
  constructor() {
    this.authToken = null;
    this.translationCache = new Map();
    this.pronunciationCache = new Map();
  }

  /**
   * Set authentication token
   * @param {string} token Firebase auth token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Translate a single word
   */
  async translateWord(word, fromLang, toLang) {
    const cacheKey = `${word}_${fromLang}_${toLang}`;

    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    try {
      const result = await this.request('/translatePhrase', {
        method: 'POST',
        body: JSON.stringify({
          text: word,
          fromLang,
          toLang,
        }),
      });

      this.translationCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[inTongues] Translation failed:', error);
      throw error;
    }
  }

  /**
   * Translate a phrase
   */
  async translatePhrase(phrase, fromLang, toLang) {
    const cacheKey = `phrase_${phrase}_${fromLang}_${toLang}`;

    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    try {
      const result = await this.request('/translatePhrase', {
        method: 'POST',
        body: JSON.stringify({
          text: phrase,
          fromLang,
          toLang,
        }),
      });

      this.translationCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('[inTongues] Phrase translation failed:', error);
      throw error;
    }
  }

  /**
   * Pre-fetch translations for multiple words
   */
  async prefetchTranslations(words, fromLang, toLang) {
    const uncachedWords = words.filter(
      (w) => !this.translationCache.has(`${w}_${fromLang}_${toLang}`)
    );

    if (uncachedWords.length === 0) return;

    try {
      const result = await this.request('/batchTranslate', {
        method: 'POST',
        body: JSON.stringify({
          words: uncachedWords,
          fromLang,
          toLang,
        }),
      });

      // Cache results
      if (result.translations) {
        Object.entries(result.translations).forEach(([word, translation]) => {
          this.translationCache.set(`${word}_${fromLang}_${toLang}`, translation);
        });
      }
    } catch (error) {
      console.error('[inTongues] Batch translation failed:', error);
      // Non-critical, translations will be fetched on-demand
    }
  }

  /**
   * Get pronunciation audio URL
   */
  async getPronunciation(word, language) {
    const cacheKey = `${word}_${language}`;

    if (this.pronunciationCache.has(cacheKey)) {
      return this.pronunciationCache.get(cacheKey);
    }

    try {
      const result = await this.request('/tts', {
        method: 'POST',
        body: JSON.stringify({
          text: word,
          language,
        }),
      });

      if (result.audioUrl) {
        this.pronunciationCache.set(cacheKey, result.audioUrl);
      }

      return result.audioUrl;
    } catch (error) {
      console.error('[inTongues] TTS failed:', error);
      return null;
    }
  }

  /**
   * Get detected expressions for text
   */
  async getExpressions(text, language) {
    try {
      const result = await this.request('/detectExpressions', {
        method: 'POST',
        body: JSON.stringify({
          text,
          language,
        }),
      });

      return result.expressions || [];
    } catch (error) {
      console.error('[inTongues] Expression detection failed:', error);
      return [];
    }
  }
}
