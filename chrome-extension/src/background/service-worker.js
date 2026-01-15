/**
 * Background Service Worker
 *
 * Handles:
 * - Firebase authentication
 * - Subtitle file interception (via declarativeNetRequest)
 * - Cross-tab communication
 * - Extension lifecycle
 */

// Firebase configuration
// TODO: Use your actual Firebase config
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'intongues2.firebaseapp.com',
  projectId: 'intongues2',
  storageBucket: 'intongues2.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// State
let authToken = null;
let currentUser = null;

// ========================================
// INSTALLATION & LIFECYCLE
// ========================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[inTongues] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // First install - open welcome page
    chrome.tabs.create({
      url: 'https://intongues2.vercel.app/extension-welcome',
    });
  }

  // Set default settings
  chrome.storage.sync.set({
    textDisplayMode: 'subtitles',
    showWordStatus: true,
    darkMode: true,
    targetLanguage: null,
    nativeLanguage: 'english',
  });
});

// ========================================
// MESSAGE HANDLING
// ========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[inTongues] Message received:', message.type);

  switch (message.type) {
    case 'GET_AUTH':
      sendResponse({ user: currentUser, token: authToken });
      break;

    case 'SET_AUTH':
      currentUser = message.user;
      authToken = message.token;
      // Broadcast to all content scripts
      broadcastToContentScripts({ type: 'AUTH_CHANGED', user: currentUser });
      sendResponse({ success: true });
      break;

    case 'LOGOUT':
      currentUser = null;
      authToken = null;
      broadcastToContentScripts({ type: 'AUTH_CHANGED', user: null });
      sendResponse({ success: true });
      break;

    case 'INTERCEPT_SUBTITLES':
      // Content script requesting subtitle interception
      setupSubtitleInterception(message.platform, message.patterns);
      sendResponse({ success: true });
      break;

    case 'GET_SETTINGS':
      chrome.storage.sync.get(null, (settings) => {
        sendResponse(settings);
      });
      return true; // Async response

    case 'SET_SETTINGS':
      chrome.storage.sync.set(message.settings, () => {
        broadcastToContentScripts({ type: 'SETTINGS_CHANGED', settings: message.settings });
        sendResponse({ success: true });
      });
      return true; // Async response

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async responses
});

// ========================================
// SUBTITLE INTERCEPTION
// ========================================

// Track which subtitle patterns we're watching
const subtitlePatterns = new Map();

function setupSubtitleInterception(platform, patterns) {
  // Store patterns for this platform
  subtitlePatterns.set(platform, patterns);

  // In Manifest V3, we can't use webRequest to intercept responses
  // Instead, we observe network requests and fetch subtitles separately
  // This is a limitation - we may need to use a different approach

  console.log(`[inTongues] Set up subtitle interception for ${platform}:`, patterns);
}

// Alternative approach: Content script observes XHR/Fetch requests
// and sends subtitle URLs to background for processing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SUBTITLE_URL_DETECTED') {
    fetchAndParseSubtitles(message.url, message.platform, sender.tab.id);
    sendResponse({ success: true });
  }
  return true;
});

async function fetchAndParseSubtitles(url, platform, tabId) {
  try {
    const response = await fetch(url);
    const data = await response.text();

    // Send subtitle data to the content script
    chrome.tabs.sendMessage(tabId, {
      type: 'SUBTITLE_DATA',
      platform,
      data,
      url,
    });
  } catch (error) {
    console.error('[inTongues] Failed to fetch subtitles:', error);
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

function broadcastToContentScripts(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && isStreamingPlatform(tab.url)) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab might not have content script loaded
        });
      }
    });
  });
}

function isStreamingPlatform(url) {
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

// ========================================
// TAB UPDATES
// ========================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && isStreamingPlatform(tab.url)) {
    // Streaming tab finished loading
    // Could trigger initialization here if needed
    console.log('[inTongues] Streaming tab ready:', tab.url);
  }
});

// ========================================
// CONTEXT MENU
// ========================================

chrome.runtime.onInstalled.addListener(() => {
  // Add context menu for translating selected text
  chrome.contextMenus.create({
    id: 'intongues-translate',
    title: 'Translate with inTongues',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'intongues-translate' && info.selectionText) {
    // Send selected text to content script for translation
    chrome.tabs.sendMessage(tab.id, {
      type: 'TRANSLATE_SELECTION',
      text: info.selectionText,
    });
  }
});

// ========================================
// ALARM FOR PERIODIC TASKS
// ========================================

chrome.alarms.create('vocab-sync', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'vocab-sync') {
    // Trigger vocab sync in content scripts
    broadcastToContentScripts({ type: 'SYNC_VOCAB' });
  }
});

console.log('[inTongues] Background service worker started');
