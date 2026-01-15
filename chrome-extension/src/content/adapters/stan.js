/**
 * Stan (Australia) Adapter
 *
 * Handles Stan.com.au video player and subtitle interception.
 * Stan is an Australian streaming service owned by Nine Entertainment.
 */

import { BaseAdapter } from './base.js';

export class StanAdapter extends BaseAdapter {
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

    this.videoElement = document.querySelector('video');
    return this.videoElement;
  }

  getVideoContainer() {
    return (
      document.querySelector('.player-container') ||
      document.querySelector('[class*="player"]') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'stan',
      patterns: ['*://*.stan.com.au/*', '*://*.stanassets.com/*'],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'stan') {
        const subtitles = this.parseWebVTT(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  hideNativeSubtitles() {
    // TODO: Research Stan's subtitle container
  }

  showNativeSubtitles() {
    // TODO: Restore Stan subtitles
  }
}
