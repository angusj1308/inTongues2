/**
 * Amazon Prime Video Adapter
 *
 * Handles Prime Video player and subtitle interception.
 * Prime Video uses WebVTT format for subtitles.
 */

import { BaseAdapter } from './base.js';

export class PrimeVideoAdapter extends BaseAdapter {
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

    // Prime Video video element selectors
    this.videoElement =
      document.querySelector('.webPlayerElement video') ||
      document.querySelector('[data-testid="video-player"] video') ||
      document.querySelector('video.webPlayerElement') ||
      document.querySelector('video');

    return this.videoElement;
  }

  getVideoContainer() {
    return (
      document.querySelector('.webPlayerUIContainer') ||
      document.querySelector('.rendererContainer') ||
      document.querySelector('[data-testid="video-player"]') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    // Prime Video serves WebVTT subtitles via CloudFront
    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'prime',
      patterns: [
        '*://*.cloudfront.net/*',
        '*://*.media-amazon.com/*',
        '*://*.pv-cdn.net/*',
      ],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'prime') {
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
      document.querySelector('.atvwebplayersdk-captions-text') ||
      document.querySelector('[data-testid="subtitles-container"]');

    if (subtitleContainer) {
      this.nativeSubtitleStyle = subtitleContainer.style.cssText;
      subtitleContainer.style.opacity = '0';
      subtitleContainer.style.visibility = 'hidden';
    }
  }

  showNativeSubtitles() {
    const subtitleContainer =
      document.querySelector('.atvwebplayersdk-captions-text') ||
      document.querySelector('[data-testid="subtitles-container"]');

    if (subtitleContainer && this.nativeSubtitleStyle) {
      subtitleContainer.style.cssText = this.nativeSubtitleStyle;
    }
  }
}
