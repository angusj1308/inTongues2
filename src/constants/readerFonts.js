// Shared reader font options. Sourced by both the reader (font cycle button)
// and the audio player extensive transcript so the listening transcript
// renders in whichever font the user has picked in the reader. Persisted on
// `profile.readerFont`.

export const READER_FONT_OPTIONS = [
  {
    id: 'lora',
    label: 'Lora',
    fontFamily: "'Lora', 'EB Garamond', 'Times New Roman', serif",
    fontWeight: 400,
    fontSize: '1.95rem',
  },
  {
    id: 'source-sans-3',
    label: 'Source Sans 3',
    fontFamily: "'Source Sans 3', 'Atkinson Hyperlegible Next', 'Inter', system-ui, -apple-system, sans-serif",
    fontWeight: 400,
    fontSize: '1.95rem',
  },
]

export const DEFAULT_READER_FONT = 'lora'

export const resolveReaderFont = (id) =>
  READER_FONT_OPTIONS.find((opt) => opt.id === id) || READER_FONT_OPTIONS[0]
