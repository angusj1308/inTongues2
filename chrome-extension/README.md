# inTongues Chrome Extension

Learn languages while watching Netflix, HBO Max, Prime Video, Disney+, and more.

## Features

- **Dual Subtitles** - See subtitles in your target language with translations
- **Click-to-Translate** - Click any word for instant translation and pronunciation
- **Vocabulary Tracking** - Track words with N/U/R/F/K status system
- **Floating Transcript** - Draggable panel showing full transcript
- **Multi-Platform** - Works on Netflix, HBO Max, Prime Video, Disney+, Paramount+, Binge, Stan, Crunchyroll

## Supported Platforms

- Netflix
- HBO Max / Max
- Amazon Prime Video
- Disney+
- Paramount+
- Binge (Australia)
- Stan (Australia)
- Crunchyroll

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

```bash
# Install dependencies
npm install

# Build for development (with watch)
npm run dev

# Build for production
npm run build
```

### Load in Chrome

1. Build the extension: `npm run build`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `dist` folder

### Project Structure

```
src/
├── background/
│   └── service-worker.js     # Background service worker
├── content/
│   ├── adapters/             # Platform-specific adapters
│   │   ├── base.js           # Base adapter class
│   │   ├── netflix.js        # Netflix adapter
│   │   ├── hbo.js            # HBO Max adapter
│   │   ├── prime-video.js    # Prime Video adapter
│   │   └── ...               # Other platforms
│   ├── ui/                   # UI components
│   │   ├── subtitle-overlay.js
│   │   ├── transcript-panel.js
│   │   └── word-popup.js
│   ├── services/             # Services
│   │   ├── api-client.js     # Backend API client
│   │   └── vocab-service.js  # Vocabulary management
│   ├── utils/                # Utilities
│   │   ├── highlight-colors.js
│   │   └── text-utils.js
│   ├── main.js               # Content script entry
│   └── styles.css            # Content script styles
├── popup/
│   ├── popup.html            # Extension popup
│   ├── popup.css
│   └── popup.js
└── icons/                    # Extension icons
```

## TODO

- [ ] Add actual Firebase configuration
- [ ] Create extension icons (16, 32, 48, 128px)
- [ ] Implement subtitle interception for each platform
- [ ] Add expression detection integration
- [ ] Test on all platforms
- [ ] Chrome Web Store submission

## License

Proprietary - inTongues
