/**
 * Base Adapter Class
 *
 * All platform adapters must implement this interface.
 * Each streaming service has different DOM structures and subtitle formats,
 * so each adapter handles the platform-specific details.
 */

export class BaseAdapter {
  constructor() {
    this.videoElement = null;
    this.subtitleCallback = null;
    this.subtitles = [];
  }

  /**
   * Check if the video player is ready
   * @returns {boolean}
   */
  isVideoReady() {
    throw new Error('isVideoReady() must be implemented');
  }

  /**
   * Get the video element
   * @returns {HTMLVideoElement|null}
   */
  getVideoElement() {
    throw new Error('getVideoElement() must be implemented');
  }

  /**
   * Get the container element where we should inject our UI
   * @returns {HTMLElement|null}
   */
  getVideoContainer() {
    throw new Error('getVideoContainer() must be implemented');
  }

  /**
   * Start intercepting subtitles from the platform
   * @param {Function} callback Called with subtitle data when received
   */
  async interceptSubtitles(callback) {
    throw new Error('interceptSubtitles() must be implemented');
  }

  /**
   * Hide the platform's native subtitle display
   */
  hideNativeSubtitles() {
    throw new Error('hideNativeSubtitles() must be implemented');
  }

  /**
   * Show the platform's native subtitles again
   */
  showNativeSubtitles() {
    throw new Error('showNativeSubtitles() must be implemented');
  }

  /**
   * Get current playback time in seconds
   * @returns {number}
   */
  getCurrentTime() {
    const video = this.getVideoElement();
    return video ? video.currentTime : 0;
  }

  /**
   * Get video duration in seconds
   * @returns {number}
   */
  getDuration() {
    const video = this.getVideoElement();
    return video ? video.duration : 0;
  }

  /**
   * Play the video
   */
  play() {
    const video = this.getVideoElement();
    if (video) video.play();
  }

  /**
   * Pause the video
   */
  pause() {
    const video = this.getVideoElement();
    if (video) video.pause();
  }

  /**
   * Check if video is playing
   * @returns {boolean}
   */
  isPlaying() {
    const video = this.getVideoElement();
    return video ? !video.paused : false;
  }

  /**
   * Seek to a specific time
   * @param {number} time Time in seconds
   */
  seek(time) {
    const video = this.getVideoElement();
    if (video) video.currentTime = time;
  }

  /**
   * Skip forward/backward by seconds
   * @param {number} seconds Positive to skip forward, negative to skip back
   */
  skip(seconds) {
    const video = this.getVideoElement();
    if (video) {
      video.currentTime = Math.max(0, video.currentTime + seconds);
    }
  }

  /**
   * Set playback rate
   * @param {number} rate Playback rate (1.0 = normal)
   */
  setPlaybackRate(rate) {
    const video = this.getVideoElement();
    if (video) video.playbackRate = rate;
  }

  /**
   * Get current playback rate
   * @returns {number}
   */
  getPlaybackRate() {
    const video = this.getVideoElement();
    return video ? video.playbackRate : 1;
  }

  /**
   * Parse subtitle data from platform-specific format
   * @param {string} data Raw subtitle data
   * @param {string} format Subtitle format (webvtt, ttml, dfxp, srt)
   * @returns {Array} Parsed subtitle segments
   */
  parseSubtitles(data, format) {
    switch (format.toLowerCase()) {
      case 'webvtt':
      case 'vtt':
        return this.parseWebVTT(data);
      case 'ttml':
      case 'dfxp':
        return this.parseTTML(data);
      case 'srt':
        return this.parseSRT(data);
      default:
        console.warn(`[inTongues] Unknown subtitle format: ${format}`);
        return [];
    }
  }

  /**
   * Parse WebVTT format subtitles
   * @param {string} data WebVTT content
   * @returns {Array} Parsed segments
   */
  parseWebVTT(data) {
    const segments = [];
    const lines = data.split('\n');
    let i = 0;

    // Skip header
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();

      // Look for timestamp line
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim());
        const startTime = this.parseTimestamp(startStr);
        const endTime = this.parseTimestamp(endStr);

        // Collect text lines until empty line or next timestamp
        const textLines = [];
        i++;
        while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
          textLines.push(lines[i].trim());
          i++;
        }

        if (textLines.length > 0) {
          segments.push({
            startTime,
            endTime,
            text: this.cleanSubtitleText(textLines.join(' ')),
          });
        }
      } else {
        i++;
      }
    }

    return segments;
  }

  /**
   * Parse TTML/DFXP format subtitles (used by Netflix)
   * @param {string} data TTML/DFXP XML content
   * @returns {Array} Parsed segments
   */
  parseTTML(data) {
    const segments = [];

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(data, 'text/xml');
      const paragraphs = doc.querySelectorAll('p');

      paragraphs.forEach((p) => {
        const begin = p.getAttribute('begin');
        const end = p.getAttribute('end');

        if (begin && end) {
          const startTime = this.parseTimestamp(begin);
          const endTime = this.parseTimestamp(end);
          const text = this.cleanSubtitleText(p.textContent);

          if (text) {
            segments.push({ startTime, endTime, text });
          }
        }
      });
    } catch (error) {
      console.error('[inTongues] Failed to parse TTML:', error);
    }

    return segments;
  }

  /**
   * Parse SRT format subtitles
   * @param {string} data SRT content
   * @returns {Array} Parsed segments
   */
  parseSRT(data) {
    const segments = [];
    const blocks = data.trim().split(/\n\n+/);

    blocks.forEach((block) => {
      const lines = block.split('\n');
      if (lines.length < 3) return;

      // Line 0: sequence number (ignored)
      // Line 1: timestamps
      const timestampLine = lines[1];
      const match = timestampLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

      if (match) {
        const startTime = this.parseTimestamp(match[1].replace(',', '.'));
        const endTime = this.parseTimestamp(match[2].replace(',', '.'));
        const text = this.cleanSubtitleText(lines.slice(2).join(' '));

        if (text) {
          segments.push({ startTime, endTime, text });
        }
      }
    });

    return segments;
  }

  /**
   * Parse timestamp string to seconds
   * @param {string} timestamp Timestamp string (00:00:00.000 or similar)
   * @returns {number} Time in seconds
   */
  parseTimestamp(timestamp) {
    // Handle various timestamp formats
    // HH:MM:SS.mmm, HH:MM:SS:FF, MM:SS.mmm, etc.
    const cleaned = timestamp.trim().replace(',', '.');

    // Try HH:MM:SS.mmm format
    let match = cleaned.match(/(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const ms = match[4] ? parseInt(match[4].padEnd(3, '0').slice(0, 3), 10) : 0;
      return hours * 3600 + minutes * 60 + seconds + ms / 1000;
    }

    // Try MM:SS.mmm format
    match = cleaned.match(/(\d+):(\d{2})(?:\.(\d+))?/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      return minutes * 60 + seconds + ms / 1000;
    }

    // Try seconds.mmm format
    match = cleaned.match(/(\d+)(?:\.(\d+))?/);
    if (match) {
      const seconds = parseInt(match[1], 10);
      const ms = match[2] ? parseInt(match[2].padEnd(3, '0').slice(0, 3), 10) : 0;
      return seconds + ms / 1000;
    }

    return 0;
  }

  /**
   * Clean subtitle text by removing HTML tags and normalizing whitespace
   * @param {string} text Raw subtitle text
   * @returns {string} Cleaned text
   */
  cleanSubtitleText(text) {
    return text
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/\{[^}]+\}/g, '') // Remove SSA/ASS style codes
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Clean up when extension is disabled
   */
  destroy() {
    this.showNativeSubtitles();
    this.subtitleCallback = null;
    this.subtitles = [];
  }
}
