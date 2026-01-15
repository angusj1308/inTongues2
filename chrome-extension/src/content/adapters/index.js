/**
 * Platform Adapters Index
 *
 * Detects which streaming platform we're on and returns the appropriate adapter.
 */

import { NetflixAdapter } from './netflix.js';
import { HBOAdapter } from './hbo.js';
import { PrimeVideoAdapter } from './prime-video.js';
import { DisneyPlusAdapter } from './disney-plus.js';
import { ParamountPlusAdapter } from './paramount-plus.js';
import { BingeAdapter } from './binge.js';
import { StanAdapter } from './stan.js';
import { CrunchyrollAdapter } from './crunchyroll.js';

const PLATFORM_DETECTORS = {
  netflix: () => window.location.hostname.includes('netflix.com'),
  hbo: () =>
    window.location.hostname.includes('hbomax.com') ||
    window.location.hostname.includes('max.com'),
  prime: () =>
    window.location.hostname.includes('primevideo.com') ||
    (window.location.hostname.includes('amazon.') &&
      window.location.pathname.includes('video')),
  disney: () => window.location.hostname.includes('disneyplus.com'),
  paramount: () => window.location.hostname.includes('paramountplus.com'),
  binge: () => window.location.hostname.includes('binge.com.au'),
  stan: () => window.location.hostname.includes('stan.com.au'),
  crunchyroll: () => window.location.hostname.includes('crunchyroll.com'),
};

const ADAPTERS = {
  netflix: NetflixAdapter,
  hbo: HBOAdapter,
  prime: PrimeVideoAdapter,
  disney: DisneyPlusAdapter,
  paramount: ParamountPlusAdapter,
  binge: BingeAdapter,
  stan: StanAdapter,
  crunchyroll: CrunchyrollAdapter,
};

/**
 * Detect which streaming platform we're on
 * @returns {string|null} Platform identifier or null if not supported
 */
export function detectPlatform() {
  for (const [platform, detector] of Object.entries(PLATFORM_DETECTORS)) {
    if (detector()) {
      return platform;
    }
  }
  return null;
}

/**
 * Get the adapter instance for a platform
 * @param {string} platform Platform identifier
 * @returns {BaseAdapter|null} Adapter instance or null
 */
export function getAdapter(platform) {
  const AdapterClass = ADAPTERS[platform];
  if (!AdapterClass) return null;
  return new AdapterClass();
}
