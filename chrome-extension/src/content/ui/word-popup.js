/**
 * Word Popup Component
 *
 * Shows translation, pronunciation, and status controls
 * when a word is clicked.
 *
 * Mirrors functionality from: src/components/cinema/CinemaWordPopup.jsx
 */

import { STATUS_COLORS, STATUS_LABELS } from '../utils/highlight-colors.js';

export class WordPopup {
  constructor(options) {
    this.container = options.container;
    this.onStatusChange = options.onStatusChange;
    this.onPlayPronunciation = options.onPlayPronunciation;
    this.darkMode = options.darkMode ?? true;

    this.element = null;
    this.currentWord = null;
    this.isVisible = false;

    this.create();
  }

  create() {
    this.element = document.createElement('div');
    this.element.className = 'intongues-word-popup';
    this.element.innerHTML = `
      <div class="intongues-popup-content">
        <div class="intongues-popup-header">
          <span class="intongues-popup-word"></span>
          <button class="intongues-popup-audio" title="Play pronunciation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </button>
        </div>
        <div class="intongues-popup-translation"></div>
        <div class="intongues-popup-status">
          <button class="intongues-status-btn" data-status="new" title="New">N</button>
          <button class="intongues-status-btn" data-status="unknown" title="Unknown">U</button>
          <button class="intongues-status-btn" data-status="recognised" title="Recognised">R</button>
          <button class="intongues-status-btn" data-status="familiar" title="Familiar">F</button>
          <button class="intongues-status-btn" data-status="known" title="Known">K</button>
        </div>
      </div>
      <div class="intongues-popup-arrow"></div>
    `;

    // Add to container
    this.container.appendChild(this.element);

    // Set up event listeners
    this.setupEventListeners();

    // Initially hidden
    this.element.style.display = 'none';
  }

  setupEventListeners() {
    // Status buttons
    const statusBtns = this.element.querySelectorAll('.intongues-status-btn');
    statusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const status = btn.dataset.status;
        if (this.currentWord) {
          this.onStatusChange?.(this.currentWord, status);
          this.updateStatusButtons(status);
        }
      });
    });

    // Audio button
    const audioBtn = this.element.querySelector('.intongues-popup-audio');
    audioBtn.addEventListener('click', () => {
      if (this.currentWord) {
        this.onPlayPronunciation?.(this.currentWord);
      }
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.element.contains(e.target)) {
        // Check if click was on a word (don't close if clicking another word)
        if (!e.target.closest('.intongues-word')) {
          this.hide();
        }
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  show(rect, data) {
    this.currentWord = data.word;
    this.isVisible = true;

    // Update content
    const wordEl = this.element.querySelector('.intongues-popup-word');
    const translationEl = this.element.querySelector('.intongues-popup-translation');
    const audioBtn = this.element.querySelector('.intongues-popup-audio');
    const statusSection = this.element.querySelector('.intongues-popup-status');

    wordEl.textContent = data.word;
    translationEl.textContent = data.translation;

    // Show/hide audio button
    audioBtn.style.display = data.pronunciation ? 'block' : 'none';

    // Show/hide status buttons for phrases
    statusSection.style.display = data.isPhrase ? 'none' : 'flex';

    // Update status buttons
    if (!data.isPhrase && data.status) {
      this.updateStatusButtons(data.status);
    }

    // Add loading class if needed
    this.element.classList.toggle('intongues-popup--loading', data.isLoading);

    // Show element
    this.element.style.display = 'block';

    // Position popup above the word
    this.positionPopup(rect);
  }

  update(data) {
    const translationEl = this.element.querySelector('.intongues-popup-translation');
    const audioBtn = this.element.querySelector('.intongues-popup-audio');

    translationEl.textContent = data.translation;
    audioBtn.style.display = data.pronunciation ? 'block' : 'none';
    this.element.classList.toggle('intongues-popup--loading', data.isLoading);

    if (data.status) {
      this.updateStatusButtons(data.status);
    }
  }

  positionPopup(rect) {
    const popup = this.element;
    const arrow = popup.querySelector('.intongues-popup-arrow');

    // Calculate position (above the word)
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left + rect.width / 2 - popupRect.width / 2;
    let top = rect.top - popupRect.height - 10;

    // Keep within viewport horizontally
    if (left < 10) left = 10;
    if (left + popupRect.width > viewportWidth - 10) {
      left = viewportWidth - popupRect.width - 10;
    }

    // If not enough space above, show below
    let showBelow = false;
    if (top < 10) {
      top = rect.bottom + 10;
      showBelow = true;
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    // Position arrow
    const arrowLeft = rect.left + rect.width / 2 - left - 6;
    arrow.style.left = `${Math.max(10, Math.min(arrowLeft, popupRect.width - 22))}px`;

    // Flip arrow if showing below
    popup.classList.toggle('intongues-popup--below', showBelow);
  }

  updateStatusButtons(activeStatus) {
    const btns = this.element.querySelectorAll('.intongues-status-btn');
    btns.forEach((btn) => {
      const isActive = btn.dataset.status === activeStatus;
      btn.classList.toggle('intongues-status-btn--active', isActive);

      // Apply status color to active button
      if (isActive) {
        btn.style.backgroundColor = STATUS_COLORS[activeStatus] || '#666';
        btn.style.color = '#fff';
      } else {
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    });
  }

  hide() {
    this.isVisible = false;
    this.currentWord = null;
    this.element.style.display = 'none';
  }

  destroy() {
    this.element?.remove();
    this.element = null;
  }
}
