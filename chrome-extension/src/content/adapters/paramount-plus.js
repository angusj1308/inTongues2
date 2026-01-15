/**
 * Paramount+ Adapter
 *
 * Handles Paramount+ video player and subtitle interception.
 */

import { BaseAdapter } from './base.js';

export class ParamountPlusAdapter extends BaseAdapter {
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
      document.querySelector('.video-player-container') ||
      document.querySelector('[data-testid="video-player"]') ||
      this.getVideoElement()?.parentElement
    );
  }

  async interceptSubtitles(callback) {
    this.subtitleCallback = callback;

    chrome.runtime.sendMessage({
      type: 'INTERCEPT_SUBTITLES',
      platform: 'paramount',
      patterns: ['*://*.cbsaavideo.com/*', '*://*.cbsi.com/*'],
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SUBTITLE_DATA' && message.platform === 'paramount') {
        const subtitles = this.parseWebVTT(message.data);
        this.subtitles = subtitles;
        if (this.subtitleCallback) {
          this.subtitleCallback(subtitles);
        }
      }
    });
  }

  hideNativeSubtitles() {
    // TODO: Identify Paramount+ subtitle container
  }

  showNativeSubtitles() {
    // TODO: Restore Paramount+ subtitles
  }
}
