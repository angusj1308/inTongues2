/**
 * Crunchyroll Adapter
 *
 * Handles Crunchyroll video player and subtitle interception.
 * Crunchyroll is popular for anime with Japanese subtitles.
 */

import { BaseAdapter } from './base.js';

export class CrunchyrollAdapter extends BaseAdapter {
  constructor() {
    super();
    this.nativeSubtitleStyle = null;
  }

  isVideoReady() {
    const video = this.getVideoElement();
    return video && video.readyState >= 2;
  }

  getVideoElement() {
    if (this.videoElement && document.contains(this.videoElement)) {
      return this.videoElement;
    }

    this.videoElement =
      document.querySelector('#player0 video') ||
      document.querySelector('[data-testid="vilos-player"] video') ||
      document.querySelector('video');

    return this.videoElement;
  }

  getVideoContainer() {
    return (
      document.querySelector('#player0') ||
      document.querySelector('[data-testid="vilos-player"]') ||
      document.querySelector('.video-player-wrapper') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'crunchyroll',
      patterns: [
        '*://*.crunchyroll.com/*',
        '*://*.vrv.co/*',
        '*://static.crunchyroll.com/*',
      ],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'crunchyroll') {
        const subtitles = this.parseWebVTT(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  hideNativeSubtitles() {
    const subtitleContainer =
      document.querySelector('.vjs-text-track-display') ||
      document.querySelector('[class*="subtitle"]');

    if (subtitleContainer) {
      this.nativeSubtitleStyle = subtitleContainer.style.cssText;
      subtitleContainer.style.opacity = '0';
    }
  }

  showNativeSubtitles() {
    const subtitleContainer =
      document.querySelector('.vjs-text-track-display') ||
      document.querySelector('[class*="subtitle"]');

    if (subtitleContainer && this.nativeSubtitleStyle) {
      subtitleContainer.style.cssText = this.nativeSubtitleStyle;
    }
  }
}
