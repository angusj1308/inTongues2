/**
 * Floating Transcript Panel Component
 *
 * A draggable, resizable panel showing the full transcript
 * with the current subtitle highlighted.
 *
 * Mirrors functionality from: src/components/cinema/FloatingTranscriptPanel.jsx
 */

import { getWordColor } from '../utils/highlight-colors.js';
import { tokenizeText } from '../utils/text-utils.js';

export class TranscriptPanel {
  constructor(options) {
    this.container = options.container;
    this.onWordClick = options.onWordClick;
    this.onPhraseSelect = options.onPhraseSelect;
    this.getWordStatus = options.getWordStatus;
    this.showWordStatus = options.showWordStatus ?? true;
    this.darkMode = options.darkMode ?? true;

    this.element = null;
    this.subtitles = [];
    this.activeIndex = -1;
    this.isVisible = false;
    this.isDragging = false;
    this.isMinimized = false;

    // Position state
    this.position = { x: 20, y: 20 };
    this.size = { width: 350, height: 400 };

    this.create();
  }

  create() {
    this.element = document.createElement('div');
    this.element.className = 'intongues-transcript-panel';
    this.element.innerHTML = `
      <div class="intongues-transcript-header">
        <span class="intongues-transcript-title">Transcript</span>
        <div class="intongues-transcript-controls">
          <button class="intongues-btn-minimize" title="Minimize">−</button>
          <button class="intongues-btn-close" title="Close">×</button>
        </div>
      </div>
      <div class="intongues-transcript-content">
        <div class="intongues-transcript-lines"></div>
      </div>
    `;

    // Apply initial styles
    this.applyPosition();
    this.applySize();

    // Add to container (document body)
    this.container.appendChild(this.element);

    // Set up event listeners
    this.setupEventListeners();

    // Initially hidden
    this.setVisible(false);
  }

  setupEventListeners() {
    const header = this.element.querySelector('.intongues-transcript-header');
    const content = this.element.querySelector('.intongues-transcript-content');
    const minimizeBtn = this.element.querySelector('.intongues-btn-minimize');
    const closeBtn = this.element.querySelector('.intongues-btn-close');

    // Drag handling
    header.addEventListener('mousedown', (e) => this.startDrag(e));
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.endDrag());

    // Control buttons
    minimizeBtn.addEventListener('click', () => this.toggleMinimize());
    closeBtn.addEventListener('click', () => this.setVisible(false));

    // Word clicks in transcript
    content.addEventListener('click', (e) => {
      const wordEl = e.target.closest('.intongues-word');
      if (wordEl) {
        const word = wordEl.dataset.word;
        const rect = wordEl.getBoundingClientRect();
        this.onWordClick?.(word, rect);
      }
    });

    // Phrase selection
    content.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && selectedText.includes(' ')) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        this.onPhraseSelect?.(selectedText, rect);
      }
    });
  }

  startDrag(e) {
    if (e.target.closest('button')) return;

    this.isDragging = true;
    this.dragOffset = {
      x: e.clientX - this.position.x,
      y: e.clientY - this.position.y,
    };

    this.element.classList.add('intongues-dragging');
  }

  onDrag(e) {
    if (!this.isDragging) return;

    this.position = {
      x: e.clientX - this.dragOffset.x,
      y: e.clientY - this.dragOffset.y,
    };

    this.applyPosition();
  }

  endDrag() {
    this.isDragging = false;
    this.element.classList.remove('intongues-dragging');
  }

  applyPosition() {
    this.element.style.left = `${this.position.x}px`;
    this.element.style.top = `${this.position.y}px`;
  }

  applySize() {
    this.element.style.width = `${this.size.width}px`;
    this.element.style.height = `${this.size.height}px`;
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.element.classList.toggle('intongues-minimized', this.isMinimized);

    const btn = this.element.querySelector('.intongues-btn-minimize');
    btn.textContent = this.isMinimized ? '+' : '−';
  }

  setSubtitles(subtitles) {
    this.subtitles = subtitles;
    this.render();
  }

  render() {
    const linesContainer = this.element.querySelector('.intongues-transcript-lines');

    const html = this.subtitles
      .map((subtitle, index) => {
        const isActive = index === this.activeIndex;
        const tokens = tokenizeText(subtitle.text);

        const wordsHtml = tokens
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
              return `<span class="intongues-punctuation">${token.original}</span>`;
            }
          })
          .join('');

        return `
          <div
            class="intongues-transcript-line ${isActive ? 'intongues-transcript-line--active' : ''}"
            data-index="${index}"
            data-start="${subtitle.startTime}"
          >
            <span class="intongues-timestamp">${this.formatTime(subtitle.startTime)}</span>
            <span class="intongues-line-text">${wordsHtml}</span>
          </div>
        `;
      })
      .join('');

    linesContainer.innerHTML = html;
  }

  highlightActiveSubtitle(subtitle) {
    if (!subtitle) {
      this.activeIndex = -1;
      this.updateActiveHighlight();
      return;
    }

    const newIndex = this.subtitles.findIndex(
      (s) => s.startTime === subtitle.startTime && s.text === subtitle.text
    );

    if (newIndex !== this.activeIndex) {
      this.activeIndex = newIndex;
      this.updateActiveHighlight();
      this.scrollToActive();
    }
  }

  updateActiveHighlight() {
    const lines = this.element.querySelectorAll('.intongues-transcript-line');
    lines.forEach((line, index) => {
      line.classList.toggle('intongues-transcript-line--active', index === this.activeIndex);
    });
  }

  scrollToActive() {
    const activeLine = this.element.querySelector('.intongues-transcript-line--active');
    if (activeLine) {
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  setVisible(visible) {
    this.isVisible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }

  setShowWordStatus(show) {
    this.showWordStatus = show;
    this.render();
  }

  refresh() {
    this.render();
  }

  destroy() {
    this.element?.remove();
    this.element = null;
  }
}
