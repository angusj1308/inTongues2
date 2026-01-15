/**
 * Disney+ Adapter
 *
 * Handles Disney+ video player and subtitle interception.
 */

import { BaseAdapter } from './base.js';

export class DisneyPlusAdapter extends BaseAdapter {
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
      document.querySelector('[data-testid="web-player"]') ||
      document.querySelector('.btm-media-player') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'disney',
      patterns: ['*://*.bamgrid.com/*', '*://*.disney-plus.net/*'],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'disney') {
        const subtitles = this.parseWebVTT(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  hideNativeSubtitles() {
    // TODO: Identify Disney+ subtitle container
  }

  showNativeSubtitles() {
    // TODO: Restore Disney+ subtitles
  }
}
