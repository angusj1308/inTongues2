// Three user-selectable highlight palettes, each with a light and dark variant.
// The actual hex values live on document.documentElement as
// --hlt-{new,recognised,familiar}-{light,dark} (6 vars), written by AuthProvider
// when profile.highlightPalette changes. CSS rules in style.css then alias
// --hlt-new etc. to either the light or dark variant based on the active theme.
// The exports below return CSS variable references so consumers work unchanged.

export const PALETTES = {
  terracotta: {
    label: 'Terracotta',
    light: {
      new: '#B56545',
      recognised: '#CB8E72',
      familiar: '#E2C4B0',
    },
    dark: {
      new: '#7A6B5E',
      recognised: '#5A4435',
      familiar: '#3D2E25',
    },
  },
  sage: {
    label: 'Sage',
    light: {
      new: '#7A9A6E',
      recognised: '#A3BD96',
      familiar: '#CDDAC4',
    },
    dark: {
      new: '#5A6B58',
      recognised: '#3A4A38',
      familiar: '#2A3528',
    },
  },
  slate: {
    label: 'Slate',
    light: {
      new: '#7E92A8',
      recognised: '#A6B5C4',
      familiar: '#CCD5DE',
    },
    dark: {
      new: '#586878',
      recognised: '#3A4450',
      familiar: '#2A3340',
    },
  },
}

export const PALETTE_ORDER = ['terracotta', 'sage', 'slate']
export const DEFAULT_PALETTE = 'terracotta'

export const resolvePalette = (name) => PALETTES[name] || PALETTES[DEFAULT_PALETTE]

// Existing exports preserved in shape — values are CSS var references so they
// cascade from --hlt-new / --hlt-recognised / --hlt-familiar set on :root
// (and overridden by [data-theme='dark'] / .reader-themed[data-reader-tone='dark']).
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

// Reader-only highlighter palettes. The listener and cinema continue to use
// the original PALETTES (terracotta / sage / slate) above — those work on
// dark video and dark frosted surfaces, where saturated highlighter yellows
// would clash. Inside the reader we use a textbook-highlighter system: each
// colour holds one hue across N/U → R → F, dropping saturation toward the
// page colour as the status becomes more familiar.
export const READER_PALETTES = {
  yellow: { label: 'Yellow', new: '#F5D547', recognised: '#F5E27A', familiar: '#F8EDB0' },
  pink: { label: 'Pink', new: '#F48FB1', recognised: '#F7B8CD', familiar: '#FAD9E3' },
  green: { label: 'Green', new: '#9CCC65', recognised: '#BFD89C', familiar: '#DCE8C7' },
  orange: { label: 'Orange', new: '#FFA94D', recognised: '#FFC78A', familiar: '#FFDDB8' },
  blue: { label: 'Blue', new: '#7EC4F2', recognised: '#A8D5F2', familiar: '#CFE4F2' },
  purple: { label: 'Purple', new: '#B39DDB', recognised: '#C9BBE3', familiar: '#DED4EC' },
}

export const READER_PALETTE_ORDER = ['yellow', 'pink', 'green', 'orange', 'blue', 'purple']
export const DEFAULT_READER_PALETTE = 'yellow'

export const resolveReaderPalette = (name) =>
  READER_PALETTES[name] || READER_PALETTES[DEFAULT_READER_PALETTE]
