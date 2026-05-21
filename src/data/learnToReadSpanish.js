// Authored deck content for "Learn to Read Spanish" — Deck 1 (Alphabet).
//
// Card content is dialect-parameterised: a single base list (Latin-American
// seseo/yeísmo) plus a per-card overrides map for Castilian. To add the
// Castilian variant later, populate CASTILIAN_OVERRIDES with the 3 keys
// flagged below and call getSpanishAlphabetCards('castilian').

export const LEARN_TO_READ_SPANISH_DECK_ID = 'learn-to-read-spanish-alphabet'
export const LEARN_TO_READ_SPANISH_DECK_LABEL = 'Spanish Alphabet'
export const LEARN_TO_READ_SPANISH_SHELF_LABEL = 'Learn to Read Spanish'
export const LEARN_TO_READ_SPANISH_LANGUAGE = 'Spanish'

export const SPANISH_ALPHABET_LAUNCH_DIALECT = 'latam'

// IPA → curated audio filename slug (resolved to /audio/spanish-ipa/{slug}.mp3).
// When a curated file is absent the player falls back to ElevenLabs TTS of the
// matching SOUND_TTS_FALLBACKS entry — a Spanish word that prominently features
// the phoneme. The fallback is a stopgap; replace by dropping the MP3 in.
export const SPANISH_IPA_AUDIO = {
  a:        { slug: 'a',          ttsFallback: 'a' },          // /a/
  e:        { slug: 'e',          ttsFallback: 'e' },          // /e/
  i:        { slug: 'i',          ttsFallback: 'i' },          // /i/
  o:        { slug: 'o',          ttsFallback: 'o' },          // /o/
  u:        { slug: 'u',          ttsFallback: 'u' },          // /u/
  b:        { slug: 'b',          ttsFallback: 'beso' },       // /b/
  k:        { slug: 'k',          ttsFallback: 'casa' },       // /k/
  s:        { slug: 's',          ttsFallback: 'sí' },         // /s/  (latam value for c(e/i), z)
  d:        { slug: 'd',          ttsFallback: 'dar' },        // /d/
  f:        { slug: 'f',          ttsFallback: 'foto' },       // /f/
  g_hard:   { slug: 'g-hard',     ttsFallback: 'gato' },       // /ɡ/
  x:        { slug: 'x-jota',     ttsFallback: 'jamón' },      // /x/  (j, g(e/i))
  l:        { slug: 'l',          ttsFallback: 'luz' },        // /l/
  m:        { slug: 'm',          ttsFallback: 'mano' },       // /m/
  n:        { slug: 'n',          ttsFallback: 'no' },         // /n/
  enye:     { slug: 'enye',       ttsFallback: 'año' },        // /ɲ/
  p:        { slug: 'p',          ttsFallback: 'pan' },        // /p/
  r_tap:    { slug: 'r-tap',      ttsFallback: 'pero' },       // /ɾ/
  r_trill:  { slug: 'r-trill',    ttsFallback: 'perro' },      // /r/
  t:        { slug: 't',          ttsFallback: 'tú' },         // /t/
  w:        { slug: 'w',          ttsFallback: 'web' },        // /w/
  ks:       { slug: 'ks',         ttsFallback: 'taxi' },       // /ks/
  yeismo:   { slug: 'yeismo',     ttsFallback: 'yo' },         // /ʝ/  (y, ll under yeísmo)
  i_vowel:  { slug: 'i',          ttsFallback: 'y' },          // /i/  (y as standalone "y")
  ch:       { slug: 'ch',         ttsFallback: 'chico' },      // /tʃ/
  silent:   { slug: null,         ttsFallback: null },         // ∅ (h)
}

// One card per grapheme/decoding unit. `text` is the value stored in the
// vocab document and what appears on the front of the card; the card meta
// (everything else) drives the back of the card.
const SPANISH_ALPHABET_CARDS_LATAM = [
  // Vowels
  {
    text: 'A a',
    name: 'a',
    ipa: ['/a/'],
    soundKeys: ['a'],
    articulation:
      "Open central vowel. Like the 'a' in 'father' but shorter and tenser; never reduces to a schwa.",
    contextNote: null,
  },
  {
    text: 'E e',
    name: 'e',
    ipa: ['/e/'],
    soundKeys: ['e'],
    articulation:
      "Mid front vowel. Like the 'e' in 'bet' but tenser and slightly higher; pure, with no off-glide.",
    contextNote: null,
  },
  {
    text: 'I i',
    name: 'i',
    ipa: ['/i/'],
    soundKeys: ['i'],
    articulation:
      "Close front vowel. Like the 'ee' in 'see' but shorter and tenser.",
    contextNote: null,
  },
  {
    text: 'O o',
    name: 'o',
    ipa: ['/o/'],
    soundKeys: ['o'],
    articulation:
      "Mid back rounded vowel. Like the 'o' in 'go' but pure, with no off-glide into /u/.",
    contextNote: null,
  },
  {
    text: 'U u',
    name: 'u',
    ipa: ['/u/'],
    soundKeys: ['u'],
    articulation:
      "Close back rounded vowel. Like the 'oo' in 'food' but shorter and tenser.",
    contextNote: 'Silent in que, qui, gue, gui — written to keep the preceding consonant hard.',
  },

  // Consonants
  {
    text: 'B b',
    name: 'be',
    ipa: ['/b/'],
    soundKeys: ['b'],
    articulation:
      "Like English 'b' at the start of a word or after m/n. Between vowels the lips don't fully close — a light buzz.",
    contextNote: 'Identical sound to v.',
  },
  {
    text: 'C c',
    name: 'ce',
    ipa: ['/k/', '/s/'], // ⚑ Castilian override: /k/, /θ/
    soundKeys: ['k', 's'],
    articulation:
      "Hard /k/ like 'cat' before a, o, u. Soft /s/ (Latin-American) like 'see' before e, i.",
    contextNote: 'Sound depends on the following letter — drilled in the syllable deck.',
  },
  {
    text: 'D d',
    name: 'de',
    ipa: ['/d/'],
    soundKeys: ['d'],
    articulation:
      "Tongue tip against the upper teeth — further forward than English 'd'. Between vowels it softens toward 'th' in 'this'.",
    contextNote: null,
  },
  {
    text: 'F f',
    name: 'efe',
    ipa: ['/f/'],
    soundKeys: ['f'],
    articulation: "Like English 'f'.",
    contextNote: null,
  },
  {
    text: 'G g',
    name: 'ge',
    ipa: ['/ɡ/', '/x/'],
    soundKeys: ['g_hard', 'x'],
    articulation:
      "Hard /ɡ/ like 'go' before a, o, u. Throaty /x/ (rough 'h', like Scottish 'loch') before e, i.",
    contextNote: 'Sound depends on the following letter. gue/gui keep the hard /ɡ/; the u is silent.',
  },
  {
    text: 'H h',
    name: 'hache',
    ipa: ['∅'],
    soundKeys: ['silent'],
    articulation: 'Completely silent. Written but never pronounced.',
    contextNote: null,
  },
  {
    text: 'J j',
    name: 'jota',
    ipa: ['/x/'],
    soundKeys: ['x'],
    articulation:
      "Throaty rasp from the back of the mouth — like 'ch' in Scottish 'loch' or German 'Bach'. No clean English equivalent.",
    contextNote: null,
  },
  {
    text: 'K k',
    name: 'ka',
    ipa: ['/k/'],
    soundKeys: ['k'],
    articulation: "Like English 'k'. Used only in loanwords.",
    contextNote: null,
  },
  {
    text: 'L l',
    name: 'ele',
    ipa: ['/l/'],
    soundKeys: ['l'],
    articulation:
      "Like English 'l' but with the tongue tip touching the teeth ridge — no curling back.",
    contextNote: null,
  },
  {
    text: 'M m',
    name: 'eme',
    ipa: ['/m/'],
    soundKeys: ['m'],
    articulation: "Like English 'm'.",
    contextNote: null,
  },
  {
    text: 'N n',
    name: 'ene',
    ipa: ['/n/'],
    soundKeys: ['n'],
    articulation: "Like English 'n'; tongue tip against the teeth ridge.",
    contextNote: null,
  },
  {
    text: 'Ñ ñ',
    name: 'eñe',
    ipa: ['/ɲ/'],
    soundKeys: ['enye'],
    articulation:
      "Like the 'ny' in 'canyon' said as a single sound — middle of the tongue against the roof of the mouth.",
    contextNote: null,
  },
  {
    text: 'P p',
    name: 'pe',
    ipa: ['/p/'],
    soundKeys: ['p'],
    articulation:
      "Like English 'p' but without the puff of air. Closer to the 'p' in 'spin' than 'pin'.",
    contextNote: null,
  },
  {
    text: 'Q q',
    name: 'cu',
    ipa: ['/k/'],
    soundKeys: ['k'],
    articulation: 'Same /k/ as in cat.',
    contextNote: 'Always written qu; the u is silent. que = /ke/, qui = /ki/.',
  },
  {
    text: 'R r',
    name: 'erre',
    ipa: ['/ɾ/', '/r/'],
    soundKeys: ['r_tap', 'r_trill'],
    articulation:
      "Single tap of the tongue against the teeth ridge — close to the 'tt' in American 'butter'. Trilled (rolled) at the start of a word or after n, l, s.",
    contextNote: 'Tap or trill depending on position.',
  },
  {
    text: 'S s',
    name: 'ese',
    ipa: ['/s/'],
    soundKeys: ['s'],
    articulation: "Like English 's' in 'see'.",
    contextNote: null,
  },
  {
    text: 'T t',
    name: 'te',
    ipa: ['/t/'],
    soundKeys: ['t'],
    articulation:
      "Tongue against the upper teeth — further forward than English 't' — and no puff of air.",
    contextNote: null,
  },
  {
    text: 'V v',
    name: 'uve',
    ipa: ['/b/'],
    soundKeys: ['b'],
    articulation:
      "Identical sound to b. Lips together at the start of a word; between vowels they nearly touch but don't fully close. There is no English-style /v/ in Spanish.",
    contextNote: 'Same sound as b.',
  },
  {
    text: 'W w',
    name: 'uve doble',
    ipa: ['/w/', '/b/'],
    soundKeys: ['w', 'b'],
    articulation:
      "Like English 'w' in 'water' in most loanwords (e.g. web); occasionally adapted to /b/.",
    contextNote: 'Loanwords only.',
  },
  {
    text: 'X x',
    name: 'equis',
    ipa: ['/ks/', '/s/', '/x/'],
    soundKeys: ['ks', 's', 'x'],
    articulation:
      "Usually /ks/ as in 'taxi'. Before a consonant often relaxes to /s/. In a few words inherited from Nahuatl (e.g. México) it's the throaty /x/.",
    contextNote: 'Value varies by word.',
  },
  {
    text: 'Y y',
    name: 'ye',
    ipa: ['/ʝ/', '/i/'],
    soundKeys: ['yeismo', 'i_vowel'], // ⚑ Castilian: traditional /ʝ/ stays the same; only ll changes
    articulation:
      "Consonant /ʝ/ — similar to English 'y' in 'yes' but with more friction. As the standalone word y ('and') it's the vowel /i/.",
    contextNote: 'Consonant or vowel depending on position.',
  },
  {
    text: 'Z z',
    name: 'zeta',
    ipa: ['/s/'], // ⚑ Castilian override: /θ/
    soundKeys: ['s'],
    articulation: 'In Latin-American Spanish, same as s.',
    contextNote: 'In Castilian Spanish this is /θ/ (like English th in thin).',
  },

  // Digraphs (decoding units; not separate RAE letters)
  {
    text: 'Ch ch',
    name: 'che',
    ipa: ['/tʃ/'],
    soundKeys: ['ch'],
    articulation: "Like English 'ch' in 'church'.",
    contextNote: null,
  },
  {
    text: 'Ll ll',
    name: 'elle',
    ipa: ['/ʝ/'], // ⚑ Castilian override: /ʎ/
    soundKeys: ['yeismo'],
    articulation:
      "Under yeísmo (most of the Spanish-speaking world) this merges with y — like 'y' in 'yes' with more friction. Some regions pronounce it like 'j' in 'jet' or 'sh'.",
    contextNote: 'Yeísmo: ll = y in most dialects.',
  },
  {
    text: 'Rr rr',
    name: 'doble erre',
    ipa: ['/r/'],
    soundKeys: ['r_trill'],
    articulation: 'Trilled (rolled) tongue tip against the teeth ridge — multiple sustained taps.',
    contextNote: 'Always trilled; contrasts with single r (a tap).',
  },
]

// Per-card overrides for Castilian (distinción). Populate to enable.
// Keys are the card.text values from the latam list.
const CASTILIAN_OVERRIDES = {
  // 'C c': { ipa: ['/k/', '/θ/'], soundKeys: ['k', 'theta'], articulation: '...', contextNote: '...' },
  // 'Z z': { ipa: ['/θ/'],        soundKeys: ['theta'],      articulation: '...', contextNote: '...' },
  // 'Ll ll': { ipa: ['/ʎ/'],      soundKeys: ['palatal-lat'], articulation: '...', contextNote: '...' },
}

export const getSpanishAlphabetCards = (dialect = SPANISH_ALPHABET_LAUNCH_DIALECT) => {
  if (dialect === 'castilian') {
    return SPANISH_ALPHABET_CARDS_LATAM.map((card) => {
      const override = CASTILIAN_OVERRIDES[card.text]
      return override ? { ...card, ...override } : card
    })
  }
  return SPANISH_ALPHABET_CARDS_LATAM
}

export const getSpanishIpaAudio = (soundKey) => SPANISH_IPA_AUDIO[soundKey] || null
