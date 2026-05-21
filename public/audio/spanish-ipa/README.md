# Spanish IPA — curated phoneme recordings

The Learn to Read Spanish alphabet deck (deck 1 of the "Learn to Read"
track) plays curated native-speaker recordings of each phoneme from this
directory. While a file is missing, the review player falls back to
ElevenLabs TTS of a Spanish example word — audible, but not the right
target. Replace each fallback by dropping in the MP3 at the listed path;
no code change required.

## Required files (Latin-American / seseo–yeísmo set)

| File                                  | IPA   | Used by                          |
|---------------------------------------|-------|----------------------------------|
| `a.mp3`                               | /a/   | A a                              |
| `e.mp3`                               | /e/   | E e                              |
| `i.mp3`                               | /i/   | I i, Y y (as standalone word *y*)|
| `o.mp3`                               | /o/   | O o                              |
| `u.mp3`                               | /u/   | U u                              |
| `b.mp3`                               | /b/   | B b, V v, W w (loan)             |
| `k.mp3`                               | /k/   | C c (a/o/u), K k, Q q            |
| `s.mp3`                               | /s/   | C c (e/i), S s, Z z, X x (var)   |
| `d.mp3`                               | /d/   | D d                              |
| `f.mp3`                               | /f/   | F f                              |
| `g-hard.mp3`                          | /ɡ/   | G g (a/o/u)                      |
| `x-jota.mp3`                          | /x/   | G g (e/i), J j, X x (México)     |
| `l.mp3`                               | /l/   | L l                              |
| `m.mp3`                               | /m/   | M m                              |
| `n.mp3`                               | /n/   | N n                              |
| `enye.mp3`                            | /ɲ/   | Ñ ñ                              |
| `p.mp3`                               | /p/   | P p                              |
| `r-tap.mp3`                           | /ɾ/   | R r (medial / single)            |
| `r-trill.mp3`                         | /r/   | R r (initial / after n,l,s), Rr  |
| `t.mp3`                               | /t/   | T t                              |
| `w.mp3`                               | /w/   | W w                              |
| `ks.mp3`                              | /ks/  | X x                              |
| `yeismo.mp3`                          | /ʝ/   | Y y (consonant), Ll ll (yeísmo)  |
| `ch.mp3`                              | /tʃ/  | Ch ch                            |

(`H h` has no recording — it's silent.)

## Recording guidance

- Native or near-native Spanish speaker, Latin-American accent for this
  set (Castilian set lives separately once added).
- Isolated phoneme, ~0.4–0.8 s clean, no surrounding vowel or breath.
- Stops (`p t k b d g`): a single controlled release — don't try to
  sustain. A faint vowel release is acceptable if it's barely audible.
- Continuants (vowels, `f s m n l ʝ`): 0.5–0.8 s sustained.
- Trill `r-trill.mp3`: at least 3–4 taps.
- Tap `r-tap.mp3`: one clean tap, can be voiced into a minimal vowel.
- Mono, 44.1 kHz, normalised to −3 dB peak. MP3 128 kbps is fine.

## Castilian set (later)

When the Castilian (distinción) dialect is added, the additional files
needed are `theta.mp3` (/θ/, for `c(e/i)` and `z`) and `palatal-lat.mp3`
(/ʎ/, for traditional `ll`). Populate `CASTILIAN_OVERRIDES` in
`src/data/learnToReadSpanish.js` to enable.
