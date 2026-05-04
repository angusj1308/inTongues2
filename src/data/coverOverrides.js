// Client-side cover overrides for real Firestore-backed books.
// Lets us swap a placeholder cover for a bundled asset without
// writing to Firestore. The override is re-applied on every load,
// so build-hashed asset URLs stay correct.
//
// To add another override: drop the PNG into src/assets/, import
// it below, append a new entry. Title match is case-insensitive
// against the trimmed book title.

import elPatioDeBronceCover from '../assets/El Patio de Bronce.png'

const OVERRIDES = [
  { titleRe: /^el patio de bronce$/i, coverImageUrl: elPatioDeBronceCover },
]

export function applyCoverOverride(book) {
  if (!book) return book
  const title = (book.title || '').trim()
  const match = OVERRIDES.find((o) => o.titleRe.test(title))
  return match ? { ...book, coverImageUrl: match.coverImageUrl } : book
}
