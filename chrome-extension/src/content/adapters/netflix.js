/**
 * Netflix Adapter
 *
 * Handles Netflix-specific video player and subtitle interception.
 * Netflix uses TTML/DFXP format for subtitles.
 */

import { BaseAdapter } from './base.js';

export class NetflixAdapter extends BaseAdapter {
  constructor() {
    super();
    this.nativeSubtitleStyle = null;
    this.subtitleObserver = null;
  }

  isVideoReady() {
    const video = this.getVideoElement();
    return video && video.readyState >= 2;
  }

  getVideoElement() {
    if (this.videoElement && document.contains(this.videoElement)) {
      return this.videoElement;
    }

    // Netflix video element selector
    this.videoElement = document.querySelector('video');
    return this.videoElement;
  }

  getVideoContainer() {
    // Netflix player container
    return (
      document.querySelector('.watch-video--player-view') ||
      document.querySelector('.VideoContainer') ||
      document.querySelector('.nf-player-container') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    // Method 1: Intercept network requests for subtitle files
    this.interceptNetworkSubtitles();

    // Method 2: Observe DOM for subtitle text changes (fallback)
    this.observeSubtitleChanges();

    // Method 3: Try to get subtitles from Netflix's internal player API
    this.tryGetNetflixAPI();
  }

  interceptNetworkSubtitles() {
    // We need to intercept requests to Netflix's subtitle CDN
    // This requires the webRequest permission in manifest
    // The actual interception happens in the background service worker

    // Send message to background to start intercepting
    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'netflix',
      patterns: [
        '*://assets.nflxext.com/*',
        '*://ipv4_1-*.1.nflxso.net/*',
      ],
    });

    // Listen for subtitle data from background
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'netflix') {
        const subtitles = this.parseTTML(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  observeSubtitleChanges() {
    // Fallback: observe the DOM for Netflix's native subtitle rendering
    const checkForSubtitleContainer = () => {
      const container =
        document.querySelector('.player-timedtext') ||
        document.querySelector('[data-uia="player-timedtext"]');

      if (container) {
        this.setupSubtitleObserver(container);
        return true;
      }
      return false;
    };

    if (!checkForSubtitleContainer()) {
      // Wait for subtitle container to appear
      const bodyObserver = new MutationObserver(() => {
        if (checkForSubtitleContainer()) {
          bodyObserver.disconnect();
        }
      });

      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  setupSubtitleObserver(container) {
    // Observe changes to Netflix's subtitle display
    // This gives us real-time subtitle text as it's displayed
    this.subtitleObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const text = container.textContent?.trim();
          if (text) {
            // We're seeing subtitles in real-time
            // This is a fallback if we can't intercept the full subtitle file
            console.log('[inTongues/Netflix] Subtitle text:', text);
          }
        }
      }
    });

    this.subtitleObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  tryGetNetflixAPI() {
    // Netflix has an internal player API that we might be able to access
    // This is fragile and may break with Netflix updates
    try {
      const videoPlayer = window.netflix?.appContext?.state?.playerApp?.getAPI?.();
      if (videoPlayer) {
        console.log('[inTongues/Netflix] Found Netflix player API');
        // Try to get subtitle tracks
        const sessionId = videoPlayer.getSessionIds?.()?.[0];
        if (sessionId) {
          const player = videoPlayer.getVideoPlayerBySessionId?.(sessionId);
          if (player) {
            const textTracks = player.getTextTrackList?.();
            console.log('[inTongues/Netflix] Text tracks:', textTracks);
          }
        }
      }
    } catch (error) {
      // Expected to fail - Netflix obfuscates their API
      console.log('[inTongues/Netflix] Could not access Netflix API (expected)');
    }
  }

  hideNativeSubtitles() {
    const subtitleContainer =
      document.querySelector('.player-timedtext') ||
      document.querySelector('[data-uia="player-timedtext"]');

    if (subtitleContainer) {
      this.nativeSubtitleStyle = subtitleContainer.style.cssText;
      subtitleContainer.style.opacity = '0';
      subtitleContainer.style.visibility = 'hidden';
    }
  }

  showNativeSubtitles() {
    const subtitleContainer =
      document.querySelector('.player-timedtext') ||
      document.querySelector('[data-uia="player-timedtext"]');

    if (subtitleContainer && this.nativeSubtitleStyle !== null) {
      subtitleContainer.style.cssText = this.nativeSubtitleStyle;
    } else if (subtitleContainer) {
      subtitleContainer.style.opacity = '1';
      subtitleContainer.style.visibility = 'visible';
    }
  }

  /**
   * Get available subtitle languages from Netflix
   * @returns {Array} Available subtitle languages
   */
  getAvailableLanguages() {
    const languages = [];

    try {
      // Try to find the audio/subtitle menu
      const trackItems = document.querySelectorAll('[data-uia^="track-item-"]');
      trackItems.forEach((item) => {
        const lang = item.getAttribute('data-uia')?.replace('track-item-', '');
        if (lang) {
          languages.push(lang);
        }
      });
    } catch (error) {
      console.error('[inTongues/Netflix] Failed to get languages:', error);
    }

    return languages;
  }

  /**
   * Select a specific subtitle language
   * @param {string} languageCode Language code to select
   */
  selectSubtitleLanguage(languageCode) {
    // This would require clicking through Netflix's UI
    // Not implemented yet - would need to simulate user interaction
    console.log(`[inTongues/Netflix] Language selection not yet implemented: ${languageCode}`);
  }

  destroy() {
    super.destroy();
    if (this.subtitleObserver) {
      this.subtitleObserver.disconnect();
      this.subtitleObserver = null;
    }
  }
}
