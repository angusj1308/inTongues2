/**
 * Extension Popup Script
 *
 * Handles user interaction with the extension popup UI.
 */

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainContent = document.getElementById('main-content');
const statusIndicator = document.getElementById('status-indicator');
const btnLogin = document.getElementById('btn-login');
const targetLanguageSelect = document.getElementById('target-language');
const toggleButtons = document.querySelectorAll('.toggle-btn');
const wordStatusToggle = document.getElementById('word-status-toggle');
const wordsLearnedEl = document.getElementById('words-learned');
const sessionWordsEl = document.getElementById('session-words');

// State
let currentUser = null;
let settings = {
  textDisplayMode: 'subtitles',
  showWordStatus: true,
  targetLanguage: null,
};

// ========================================
// INITIALIZATION
// ========================================

async function init() {
  // Load auth state
  const auth = await chrome.runtime.sendMessage({ type: 'GET_AUTH' });
  if (auth.user) {
    currentUser = auth.user;
    showLoggedInUI();
  } else {
    showLoggedOutUI();
  }

  // Load settings
  const storedSettings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  settings = { ...settings, ...storedSettings };
  applySettings();

  // Check if extension is active on current tab
  checkActiveStatus();

  // Set up event listeners
  setupEventListeners();
}

// ========================================
// UI STATE
// ========================================

function showLoggedInUI() {
  authSection.style.display = 'none';
  mainContent.style.display = 'block';

  // Update user info if we add that section
  updateStats();
}

function showLoggedOutUI() {
  authSection.style.display = 'block';
  mainContent.style.display = 'none';
}

function applySettings() {
  // Language select
  if (settings.targetLanguage) {
    targetLanguageSelect.value = settings.targetLanguage;
  }

  // Text display mode
  toggleButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === settings.textDisplayMode);
  });

  // Word status toggle
  wordStatusToggle.checked = settings.showWordStatus;
}

async function checkActiveStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && isStreamingPlatform(tab.url)) {
      // Try to get status from content script
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });

      if (response?.isActive) {
        statusIndicator.classList.add('active');
        statusIndicator.querySelector('.status-text').textContent =
          `Active on ${capitalizeFirst(response.platform)}`;
      }
    }
  } catch (error) {
    // Content script not loaded or not on streaming platform
    statusIndicator.classList.remove('active');
    statusIndicator.querySelector('.status-text').textContent = 'Inactive';
  }
}

function isStreamingPlatform(url) {
  if (!url) return false;

  const patterns = [
    'netflix.com',
    'hbomax.com',
    'max.com',
    'primevideo.com',
    'amazon.com',
    'disneyplus.com',
    'paramountplus.com',
    'binge.com.au',
    'stan.com.au',
    'crunchyroll.com',
  ];

  return patterns.some((pattern) => url.includes(pattern));
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
  // Login button
  btnLogin.addEventListener('click', handleLogin);

  // Language select
  targetLanguageSelect.addEventListener('change', handleLanguageChange);

  // Text display mode toggle
  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => handleDisplayModeChange(btn.dataset.mode));
  });

  // Word status toggle
  wordStatusToggle.addEventListener('change', handleWordStatusToggle);
}

async function handleLogin() {
  // Open inTongues login page in new tab
  // After login, the page will send auth token back to extension
  chrome.tabs.create({
    url: 'https://intongues2.vercel.app/extension-auth',
  });
}

async function handleLanguageChange(e) {
  const language = e.target.value;
  settings.targetLanguage = language;

  await saveSettings({ targetLanguage: language });
  notifyContentScript({ type: 'LANGUAGE_CHANGED', language });
}

async function handleDisplayModeChange(mode) {
  settings.textDisplayMode = mode;

  // Update UI
  toggleButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  await saveSettings({ textDisplayMode: mode });
  notifyContentScript({ type: 'SET_TEXT_MODE', mode });
}

async function handleWordStatusToggle() {
  settings.showWordStatus = wordStatusToggle.checked;

  await saveSettings({ showWordStatus: settings.showWordStatus });
  notifyContentScript({ type: 'TOGGLE_WORD_STATUS' });
}

// ========================================
// SETTINGS & COMMUNICATION
// ========================================

async function saveSettings(newSettings) {
  await chrome.runtime.sendMessage({
    type: 'SET_SETTINGS',
    settings: newSettings,
  });
}

async function notifyContentScript(message) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.tabs.sendMessage(tab.id, message);
    }
  } catch (error) {
    // Content script not loaded
    console.log('Could not notify content script:', error);
  }
}

// ========================================
// STATS
// ========================================

async function updateStats() {
  try {
    // Get vocab stats from storage
    const data = await chrome.storage.local.get(['vocabStats', 'sessionStats']);

    if (data.vocabStats) {
      wordsLearnedEl.textContent = data.vocabStats.totalLearned || 0;
    }

    if (data.sessionStats) {
      sessionWordsEl.textContent = data.sessionStats.wordsAdded || 0;
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

// ========================================
// LISTEN FOR AUTH CHANGES
// ========================================

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'AUTH_CHANGED') {
    if (message.user) {
      currentUser = message.user;
      showLoggedInUI();
    } else {
      currentUser = null;
      showLoggedOutUI();
    }
  }
});

// ========================================
// START
// ========================================

init();
