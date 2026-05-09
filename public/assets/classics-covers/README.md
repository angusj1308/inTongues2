# Classics covers — local override drop folder

Drop custom inTongues imprint covers in this directory and they take precedence
over the Firestore `coverUrl` for matching books on the Discover/Classics page.
No Firestore writes, no rebuild — Vite serves files in `public/` verbatim, so
saving a file here and refreshing the page is enough.

## Where this resolves at runtime

- File on disk: `public/assets/classics-covers/<slug>.png`
- URL the browser fetches: `/assets/classics-covers/<slug>.png`

## Filename = slug of the book's title

Slug rules (mirrored exactly by `slugifyTitle` in
`src/components/read/GutenbergSearchPanel.jsx`):

1. Lowercase the title.
2. Strip diacritics (`é` → `e`, `Á` → `a`, …).
3. Replace any whitespace or punctuation run with a single hyphen.
4. Keep leading articles (`the-iliad`, not `iliad`).
5. `.png` extension. No author name, no "cover" suffix.

### Examples

| Title in Firestore       | Filename                       |
| ------------------------ | ------------------------------ |
| War and Peace            | `war-and-peace.png`            |
| Crime and Punishment     | `crime-and-punishment.png`     |
| The Iliad                | `the-iliad.png`                |
| The Brothers Karamazov   | `the-brothers-karamazov.png`   |
| Notes from Underground   | `notes-from-underground.png`   |
| This Side of Paradise    | `this-side-of-paradise.png`    |
| The Beautiful and Damned | `the-beautiful-and-damned.png` |
| Demons                   | `demons.png`                   |
| Anna Karenina            | `anna-karenina.png`            |

## Fallback chain (per book)

1. `/assets/classics-covers/<slug>.png` — this folder.
2. Firestore `coverUrl` (Open Library, populated by `scripts/backfill_covers.py`).
3. Canonical Gutenberg cover (`https://www.gutenberg.org/cache/epub/{id}/pg{id}.cover.medium.jpg`).
4. Typographic placeholder.

The chain advances on `<img onError>` — a missing local file produces a single
404 in the network tab and is silenced by the fallback. That's expected.

## Workflow

1. Render or curate a cover at the imprint dimensions.
2. Save as `public/assets/classics-covers/<slug>.png` in this repo.
3. Refresh the Discover page in dev — the new cover appears.
4. Commit and push when you're satisfied — the file ships with the next deploy.

The slug must match the book's `title` field as it lives in Firestore today.
After the Phase 1 cleanup pass, that's the canonical title (e.g. "Frankenstein"
not "Frankenstein; or, the Modern Prometheus", "Tom Sawyer" not "The Adventures
of Tom Sawyer, Complete"). When in doubt, copy the title off the rendered card
and run it through the slug rules above.
