/**
 * HBO Max / Max Adapter
 *
 * Handles HBO Max (now Max) video player and subtitle interception.
 * HBO uses WebVTT format for subtitles.
 */

import { BaseAdapter } from './base.js';

export class HBOAdapter extends BaseAdapter {
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

    // HBO Max video element selectors
    this.videoElement =
      document.querySelector('video[src]') ||
      document.querySelector('.default-player video') ||
      document.querySelector('video');

    return this.videoElement;
  }

  getVideoContainer() {
    return (
      document.querySelector('.default-player') ||
      document.querySelector('[data-testid="player"]') ||
      document.querySelector('.player-container') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    // HBO serves WebVTT subtitles
    // TODO: Implement network interception for HBO subtitle files
    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'hbo',
      patterns: ['*://*.hbomaxcdn.com/*', '*://*.max.com/*'],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'hbo') {
        const subtitles = this.parseWebVTT(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  hideNativeSubtitles() {
    // TODO: Find HBO's subtitle container and hide it
    const subtitleContainer = document.querySelector('.player-timedtext');
    if (subtitleContainer) {
      this.nativeSubtitleStyle = subtitleContainer.style.cssText;
      subtitleContainer.style.opacity = '0';
    }
  }

  showNativeSubtitles() {
    const subtitleContainer = document.querySelector('.player-timedtext');
    if (subtitleContainer && this.nativeSubtitleStyle) {
      subtitleContainer.style.cssText = this.nativeSubtitleStyle;
    }
  }
}
