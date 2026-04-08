// Three user-selectable highlight palettes. The actual hex values live on
// document.documentElement as --hlt-new / --hlt-recognised / --hlt-familiar,
// written by AuthProvider when profile.highlightPalette changes. The exports
// below return CSS variable references so existing consumers work unchanged.

export const PALETTES = {
  terracotta: {
    label: 'Terracotta',
    new: '#B56545',
    recognised: '#CB8E72',
    familiar: '#E2C4B0',
  },
  sage: {
    label: 'Sage',
    new: '#7A9A6E',
    recognised: '#A3BD96',
    familiar: '#CDDAC4',
  },
  slate: {
    label: 'Slate',
    new: '#7E92A8',
    recognised: '#A6B5C4',
    familiar: '#CCD5DE',
  },
}

export const PALETTE_ORDER = ['terracotta', 'sage', 'slate']
export const DEFAULT_PALETTE = 'terracotta'

export const resolvePalette = (name) => PALETTES[name] || PALETTES[DEFAULT_PALETTE]

// Existing exports preserved in shape — values are now CSS var references
// so they cascade from --hlt-new / --hlt-recognised / --hlt-familiar set on :root.
const HIGHLIGHT_REFS = {
  new: 'var(--hlt-new)',
  unknown: 'var(--hlt-new)',
  recognised: 'var(--hlt-recognised)',
  familiar: 'var(--hlt-familiar)',
  known: null,
}

export const LIGHT_HIGHLIGHTS = HIGHLIGHT_REFS
export const DARK_HIGHLIGHTS = HIGHLIGHT_REFS
export const HIGHLIGHT_COLOR = 'var(--hlt-new)'

export const STATUS_OPACITY = {
  new: 0.4,
  unknown: 0.4,
  recognised: 0.28,
  familiar: 0.16,
  known: 0.0,
}
