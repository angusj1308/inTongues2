/**
 * inTongues Chrome Extension - Main Content Script
 *
 * This script runs on streaming platforms and:
 * 1. Detects which platform we're on
 * 2. Initializes the appropriate adapter
 * 3. Injects the UI overlay
 * 4. Handles subtitle interception and display
 */

import { detectPlatform, getAdapter } from './adapters/index.js';
import { SubtitleOverlay } from './ui/subtitle-overlay.js';
import { TranscriptPanel } from './ui/transcript-panel.js';
import { WordPopup } from './ui/word-popup.js';
import { VocabService } from './services/vocab-service.js';
import { ApiClient } from './services/api-client.js';

class InTonguesExtension {
  constructor() {
    this.platform = null;
    this.adapter = null;
    this.subtitleOverlay = null;
    this.transcriptPanel = null;
    this.wordPopup = null;
    this.vocabService = null;
    this.apiClient = null;
    this.isActive = false;
    this.settings = {
      textDisplayMode: 'subtitles', // 'off' | 'subtitles' | 'transcript'
      showWordStatus: true,
      darkMode: true,
      targetLanguage: null,
      nativeLanguage: 'english',
    };
  }

  async init() {
    // Detect which streaming platform we're on
    this.platform = detectPlatform();

    if (!this.platform) {
      console.log('[inTongues] No supported platform detected');
      return;
    }

    console.log(`[inTongues] Detected platform: ${this.platform}`);

    // Get the appropriate adapter for this platform
    this.adapter = getAdapter(this.platform);

    if (!this.adapter) {
      console.log(`[inTongues] No adapter available for ${this.platform}`);
      return;
    }

    // Initialize services
    this.apiClient = new ApiClient();
    this.vocabService = new VocabService(this.apiClient);

    // Load user settings from storage
    await this.loadSettings();

    // Wait for video player to be available
    this.waitForVideoPlayer();
  }

  async loadSettings() {
    try {
      const stored = await chrome.storage.sync.get([
        'textDisplayMode',
        'showWordStatus',
        'darkMode',
        'targetLanguage',
        'nativeLanguage',
      ]);

      this.settings = { ...this.settings, ...stored };
    } catch (error) {
      console.error('[inTongues] Failed to load settings:', error);
    }
  }

  waitForVideoPlayer() {
    // Check if video player is already available
    if (this.adapter.isVideoReady()) {
      this.onVideoReady();
      return;
    }

    // Otherwise, observe DOM for video player
    const observer = new MutationObserver(() => {
      if (this.adapter.isVideoReady()) {
        observer.disconnect();
        this.onVideoReady();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      observer.disconnect();
    }, 30000);
  }

  async onVideoReady() {
    console.log('[inTongues] Video player ready');

    // Initialize UI components
    this.initializeUI();

    // Start intercepting subtitles
    await this.adapter.interceptSubtitles((subtitles) => {
      this.onSubtitlesReceived(subtitles);
    });

    // Hide native subtitles (we'll render our own)
    this.adapter.hideNativeSubtitles();

    // Start tracking playback
    this.startPlaybackTracking();

    this.isActive = true;
    console.log('[inTongues] Extension active');
  }

  initializeUI() {
    const videoContainer = this.adapter.getVideoContainer();

    if (!videoContainer) {
      console.error('[inTongues] Could not find video container');
      return;
    }

    // Create subtitle overlay
    this.subtitleOverlay = new SubtitleOverlay({
      container: videoContainer,
      onWordClick: (word, rect) => this.onWordClick(word, rect),
      onPhraseSelect: (phrase, rect) => this.onPhraseSelect(phrase, rect),
      getWordStatus: (word) => this.vocabService.getWordStatus(word),
      showWordStatus: this.settings.showWordStatus,
      darkMode: this.settings.darkMode,
    });

    // Create transcript panel
    this.transcriptPanel = new TranscriptPanel({
      container: document.body,
      onWordClick: (word, rect) => this.onWordClick(word, rect),
      onPhraseSelect: (phrase, rect) => this.onPhraseSelect(phrase, rect),
      getWordStatus: (word) => this.vocabService.getWordStatus(word),
      showWordStatus: this.settings.showWordStatus,
      darkMode: this.settings.darkMode,
    });

    // Create word popup
    this.wordPopup = new WordPopup({
      container: document.body,
      onStatusChange: (word, status) => this.onWordStatusChange(word, status),
      onPlayPronunciation: (word) => this.playPronunciation(word),
      darkMode: this.settings.darkMode,
    });

    // Apply initial display mode
    this.updateTextDisplayMode(this.settings.textDisplayMode);
  }

  onSubtitlesReceived(subtitles) {
    // Store subtitles for transcript panel
    this.currentSubtitles = subtitles;

    // Update transcript panel with full subtitle list
    if (this.transcriptPanel) {
      this.transcriptPanel.setSubtitles(subtitles);
    }

    // Pre-fetch translations for all words
    this.prefetchTranslations(subtitles);
  }

  async prefetchTranslations(subtitles) {
    if (!this.settings.targetLanguage) return;

    const allText = subtitles.map(s => s.text).join(' ');
    const words = this.extractWords(allText);

    try {
      await this.apiClient.prefetchTranslations(
        words,
        this.settings.targetLanguage,
        this.settings.nativeLanguage
      );
    } catch (error) {
      console.error('[inTongues] Failed to prefetch translations:', error);
    }
  }

  extractWords(text) {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  startPlaybackTracking() {
    // Update subtitle display based on current playback time
    setInterval(() => {
      if (!this.isActive || !this.currentSubtitles) return;

      const currentTime = this.adapter.getCurrentTime();
      const activeSubtitle = this.findActiveSubtitle(currentTime);

      if (this.subtitleOverlay && this.settings.textDisplayMode === 'subtitles') {
        this.subtitleOverlay.updateActiveSubtitle(activeSubtitle, currentTime);
      }

      if (this.transcriptPanel && this.settings.textDisplayMode === 'transcript') {
        this.transcriptPanel.highlightActiveSubtitle(activeSubtitle);
      }
    }, 100); // Update every 100ms
  }

  findActiveSubtitle(currentTime) {
    if (!this.currentSubtitles) return null;

    return this.currentSubtitles.find(
      sub => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
  }

  async onWordClick(word, rect) {
    const cleanWord = word.toLowerCase().replace(/[^\p{L}]/gu, '');

    if (!cleanWord) return;

    // Show loading state
    this.wordPopup.show(rect, {
      word: cleanWord,
      translation: 'Loading...',
      isLoading: true,
    });

    try {
      // Get translation
      const translation = await this.apiClient.translateWord(
        cleanWord,
        this.settings.targetLanguage,
        this.settings.nativeLanguage
      );

      // Get current status
      const status = await this.vocabService.getWordStatus(cleanWord);

      // Update popup with full data
      this.wordPopup.update({
        word: cleanWord,
        translation: translation.text,
        pronunciation: translation.pronunciation,
        status: status,
        isLoading: false,
      });
    } catch (error) {
      console.error('[inTongues] Translation failed:', error);
      this.wordPopup.update({
        word: cleanWord,
        translation: 'Translation failed',
        isLoading: false,
      });
    }
  }

  async onPhraseSelect(phrase, rect) {
    const cleanPhrase = phrase.trim();

    if (!cleanPhrase || cleanPhrase.split(/\s+/).length < 2) return;

    // Show loading state
    this.wordPopup.show(rect, {
      word: cleanPhrase,
      translation: 'Loading...',
      isLoading: true,
      isPhrase: true,
    });

    try {
      const translation = await this.apiClient.translatePhrase(
        cleanPhrase,
        this.settings.targetLanguage,
        this.settings.nativeLanguage
      );

      this.wordPopup.update({
        word: cleanPhrase,
        translation: translation.text,
        isLoading: false,
        isPhrase: true,
      });
    } catch (error) {
      console.error('[inTongues] Phrase translation failed:', error);
      this.wordPopup.update({
        word: cleanPhrase,
        translation: 'Translation failed',
        isLoading: false,
        isPhrase: true,
      });
    }
  }

  async onWordStatusChange(word, status) {
    try {
      await this.vocabService.updateWordStatus(word, status);

      // Re-render subtitles to reflect new status
      if (this.subtitleOverlay) {
        this.subtitleOverlay.refresh();
      }
      if (this.transcriptPanel) {
        this.transcriptPanel.refresh();
      }
    } catch (error) {
      console.error('[inTongues] Failed to update word status:', error);
    }
  }

  async playPronunciation(word) {
    try {
      const audioUrl = await this.apiClient.getPronunciation(
        word,
        this.settings.targetLanguage
      );

      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play();
      }
    } catch (error) {
      console.error('[inTongues] Failed to play pronunciation:', error);
    }
  }

  updateTextDisplayMode(mode) {
    this.settings.textDisplayMode = mode;

    if (this.subtitleOverlay) {
      this.subtitleOverlay.setVisible(mode === 'subtitles');
    }

    if (this.transcriptPanel) {
      this.transcriptPanel.setVisible(mode === 'transcript');
    }

    // Save to storage
    chrome.storage.sync.set({ textDisplayMode: mode });
  }

  toggleWordStatus() {
    this.settings.showWordStatus = !this.settings.showWordStatus;

    if (this.subtitleOverlay) {
      this.subtitleOverlay.setShowWordStatus(this.settings.showWordStatus);
    }

    if (this.transcriptPanel) {
      this.transcriptPanel.setShowWordStatus(this.settings.showWordStatus);
    }

    chrome.storage.sync.set({ showWordStatus: this.settings.showWordStatus });
  }

  destroy() {
    this.isActive = false;
    this.subtitleOverlay?.destroy();
    this.transcriptPanel?.destroy();
    this.wordPopup?.destroy();
  }
}

// Initialize when DOM is ready
const extension = new InTonguesExtension();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => extension.init());
} else {
  extension.init();
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SET_TEXT_MODE':
      extension.updateTextDisplayMode(message.mode);
      sendResponse({ success: true });
      break;
    case 'TOGGLE_WORD_STATUS':
      extension.toggleWordStatus();
      sendResponse({ success: true });
      break;
    case 'GET_STATUS':
      sendResponse({
        isActive: extension.isActive,
        platform: extension.platform,
        settings: extension.settings,
      });
      break;
  }
  return true;
});
