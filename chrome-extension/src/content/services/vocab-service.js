/**
 * Vocabulary Service
 *
 * Manages vocabulary status locally and syncs with inTongues backend.
 * Uses chrome.storage for local caching.
 */

export class VocabService {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.vocab = new Map(); // word -> { status, translation, ... }
    this.language = null;
    this.userId = null;
    this.pendingUpdates = [];
    this.syncInterval = null;
  }

  /**
   * Initialize vocab service with user data
   */
  async init(userId, language) {
    this.userId = userId;
    this.language = language;

    // Load from local storage first (fast)
    await this.loadFromLocalStorage();

    // Then sync with server (background)
    this.syncWithServer();

    // Set up periodic sync
    this.syncInterval = setInterval(() => this.syncWithServer(), 60000);
  }

  /**
   * Load vocabulary from local storage
   */
  async loadFromLocalStorage() {
    try {
      const key = `vocab_${this.language}`;
      const result = await chrome.storage.local.get(key);

      if (result[key]) {
        this.vocab = new Map(Object.entries(result[key]));
      }
    } catch (error) {
      console.error('[inTongues] Failed to load vocab from storage:', error);
    }
  }

  /**
   * Save vocabulary to local storage
   */
  async saveToLocalStorage() {
    try {
      const key = `vocab_${this.language}`;
      const data = Object.fromEntries(this.vocab);
      await chrome.storage.local.set({ [key]: data });
    } catch (error) {
      console.error('[inTongues] Failed to save vocab to storage:', error);
    }
  }

  /**
   * Sync with server
   */
  async syncWithServer() {
    if (!this.userId) return;

    try {
      // Push pending updates
      if (this.pendingUpdates.length > 0) {
        await this.apiClient.request('/vocab/batch', {
          method: 'POST',
          body: JSON.stringify({
            updates: this.pendingUpdates,
            language: this.language,
          }),
        });
        this.pendingUpdates = [];
      }

      // Pull latest vocab (optional - could be expensive)
      // For now, we trust local state and push-only sync
    } catch (error) {
      console.error('[inTongues] Vocab sync failed:', error);
      // Keep pending updates for next sync
    }
  }

  /**
   * Get word status
   */
  getWordStatus(word) {
    const cleanWord = word.toLowerCase().trim();
    const entry = this.vocab.get(cleanWord);
    return entry?.status || 'unknown';
  }

  /**
   * Update word status
   */
  async updateWordStatus(word, status) {
    const cleanWord = word.toLowerCase().trim();

    // Update local state immediately
    const existing = this.vocab.get(cleanWord) || {};
    this.vocab.set(cleanWord, {
      ...existing,
      status,
      updatedAt: Date.now(),
    });

    // Save to local storage
    await this.saveToLocalStorage();

    // Queue for server sync
    this.pendingUpdates.push({
      word: cleanWord,
      status,
      timestamp: Date.now(),
    });

    // Trigger immediate sync if we have auth
    if (this.userId) {
      this.syncWithServer();
    }
  }

  /**
   * Batch load vocab entries
   */
  async loadVocabForWords(words) {
    const uncached = words.filter((w) => !this.vocab.has(w.toLowerCase()));

    if (uncached.length === 0) return;

    try {
      const result = await this.apiClient.request('/vocab/batch', {
        method: 'GET',
        body: JSON.stringify({
          words: uncached,
          language: this.language,
        }),
      });

      if (result.entries) {
        Object.entries(result.entries).forEach(([word, entry]) => {
          this.vocab.set(word, entry);
        });
        await this.saveToLocalStorage();
      }
    } catch (error) {
      console.error('[inTongues] Failed to load vocab entries:', error);
    }
  }

  /**
   * Get all vocab entries
   */
  getAllEntries() {
    return Object.fromEntries(this.vocab);
  }

  /**
   * Clean up
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    // Final sync attempt
    this.syncWithServer();
  }
}
