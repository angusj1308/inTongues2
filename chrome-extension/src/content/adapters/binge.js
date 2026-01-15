/**
 * Binge (Australia) Adapter
 *
 * Handles Binge.com.au video player and subtitle interception.
 * Binge is an Australian streaming service owned by Foxtel.
 */

import { BaseAdapter } from './base.js';

export class BingeAdapter extends BaseAdapter {
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

    // Binge likely uses a standard HTML5 video player
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

    // Binge CDN patterns (needs research)
    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'binge',
      patterns: ['*://*.binge.com.au/*', '*://*.foxtel.com.au/*'],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'binge') {
        const subtitles = this.parseWebVTT(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  hideNativeSubtitles() {
    // TODO: Research Binge's subtitle container
  }

  showNativeSubtitles() {
    // TODO: Restore Binge subtitles
  }
}
