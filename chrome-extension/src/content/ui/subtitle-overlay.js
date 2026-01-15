/**
 * Subtitle Overlay Component
 *
 * Renders subtitles over the video player with word-level highlighting
 * based on vocabulary status (N/U/R/F/K).
 *
 * Mirrors functionality from: src/components/cinema/KaraokeSubtitles.jsx
 */

import { getWordColor, STATUS_COLORS } from '../utils/highlight-colors.js';
import { tokenizeText } from '../utils/text-utils.js';

export class SubtitleOverlay {
  constructor(options) {
    this.container = options.container;
    this.onWordClick = options.onWordClick;
    this.onPhraseSelect = options.onPhraseSelect;
    this.getWordStatus = options.getWordStatus;
    this.showWordStatus = options.showWordStatus ?? true;
    this.darkMode = options.darkMode ?? true;

    this.element = null;
    this.currentSubtitle = null;
    this.isVisible = true;

    this.create();
  }

  create() {
    // Create overlay container
    this.element = document.createElement('div');
    this.element.className = 'intongues-subtitle-overlay';
    this.element.innerHTML = `
      <div class="intongues-subtitle-container">
        <div class="intongues-subtitle-text"></div>
      </div>
    `;

    // Add to video container
    this.container.appendChild(this.element);

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    const textContainer = this.element.querySelector('.intongues-subtitle-text');

    // Handle word clicks
    textContainer.addEventListener('click', (e) => {
      const wordEl = e.target.closest('.intongues-word');
      if (wordEl) {
        const word = wordEl.dataset.word;
        const rect = wordEl.getBoundingClientRect();
        this.onWordClick?.(word, rect);
      }
    });

    // Handle phrase selection (drag select)
    textContainer.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && selectedText.includes(' ')) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.onPhraseSelect?.(selectedText, rect);
      }
    });
  }

  updateActiveSubtitle(subtitle, currentTime) {
    if (!subtitle) {
      this.clear();
      return;
    }

    // Only re-render if subtitle changed
    if (this.currentSubtitle?.text !== subtitle.text) {
      this.currentSubtitle = subtitle;
      this.render(subtitle);
    }

    // Update karaoke highlighting based on current time
    // (if word-level timing is available)
    if (subtitle.words) {
      this.updateKaraokeHighlight(subtitle.words, currentTime);
    }
  }

  render(subtitle) {
    const textContainer = this.element.querySelector('.intongues-subtitle-text');

    // Tokenize the subtitle text
    const tokens = tokenizeText(subtitle.text);

    // Build HTML with word elements
    const html = tokens
      .map((token) => {
        if (token.type === 'word') {
          const status = this.showWordStatus
            ? this.getWordStatus?.(token.text) || 'unknown'
            : 'known';
          const color = getWordColor(status);

          return `<span
            class="intongues-word intongues-word--${status}"
            data-word="${token.text}"
            style="color: ${color};"
          >${token.original}</span>`;
        } else {
          // Punctuation or whitespace
          return `<span class="intongues-punctuation">${token.original}</span>`;
        }
      })
      .join('');

    textContainer.innerHTML = html;
  }

  updateKaraokeHighlight(words, currentTime) {
    // If we have word-level timing, highlight the current word
    const wordElements = this.element.querySelectorAll('.intongues-word');

    words.forEach((wordData, index) => {
      const el = wordElements[index];
      if (!el) return;

      if (currentTime >= wordData.start && currentTime <= wordData.end) {
        el.classList.add('intongues-word--active');
      } else if (currentTime > wordData.end) {
        el.classList.remove('intongues-word--active');
        el.classList.add('intongues-word--past');
      } else {
        el.classList.remove('intongues-word--active', 'intongues-word--past');
      }
    });
  }

  clear() {
    this.currentSubtitle = null;
    const textContainer = this.element.querySelector('.intongues-subtitle-text');
    if (textContainer) {
      textContainer.innerHTML = '';
    }
  }

  setVisible(visible) {
    this.isVisible = visible;
    this.element.style.display = visible ? 'block' : 'none';
  }

  setShowWordStatus(show) {
    this.showWordStatus = show;
    if (this.currentSubtitle) {
      this.render(this.currentSubtitle);
    }
  }

  refresh() {
    if (this.currentSubtitle) {
      this.render(this.currentSubtitle);
    }
  }

  destroy() {
    this.element?.remove();
    this.element = null;
  }
}
