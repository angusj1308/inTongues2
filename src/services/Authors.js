// Short story authors by genre — used to drive story concept generation
// Curated for distinctive, subtractive voices that suppress Claude's overwriting.
export const SHORT_STORY_AUTHORS = {
  thriller: [
    'Roald Dahl',
    'Patricia Highsmith',
    'Daphne du Maurier',
  ],
  scifi: [
    'Ted Chiang',
    'Ray Bradbury',
    'Ursula K. Le Guin',
    'Philip K. Dick',
  ],
  mystery: [
    'Arthur Conan Doyle',
    'Agatha Christie',
    'G.K. Chesterton',
  ],
  adventure: [
    'Jack London',
    'Rudyard Kipling',
    'Joseph Conrad',
  ],
  comedy: [
    'P.G. Wodehouse',
    'Saki',
    'Dorothy Parker',
    'Mark Twain',
  ],
  horror: [
    'Edgar Allan Poe',
    'Shirley Jackson',
    'M.R. James',
  ],
  fantasy: [
    'Jorge Luis Borges',
    'Neil Gaiman',
    'Ursula K. Le Guin',
  ],
  literary: [
    'Ernest Hemingway',
    'Anton Chekhov',
    'Flannery O\'Connor',
    'Raymond Carver',
    'Franz Kafka',
  ],
  historical: [
    'Isaac Bashevis Singer',
    'Isak Dinesen',
  ],
  fairytale: [
    'Hans Christian Andersen',
    'Oscar Wilde',
    'Italo Calvino',
  ],
}

// Novel authors by genre — used to drive novel/novella concept generation
export const NOVEL_AUTHORS = {
  romance: [
    'Nora Roberts',
    'Julia Quinn',
    'Beverly Jenkins',
    'Judith McNaught',
    'Lisa Kleypas',
  ],
  thriller: [
    'Patricia Highsmith',
    'Daphne du Maurier',
    'Thomas Harris',
    'Gillian Flynn',
    'John le Carré',
  ],
  scifi: [
    'Isaac Asimov',
    'Arthur C. Clarke',
    'Ursula K. Le Guin',
    'Philip K. Dick',
    'Frank Herbert',
    'Octavia Butler',
    'Ray Bradbury',
    'H.G. Wells',
    'Stanis\u0142aw Lem',
  ],
  mystery: [
    'Agatha Christie',
    'Arthur Conan Doyle',
    'Raymond Chandler',
    'Georges Simenon',
    'Dashiell Hammett',
    'Freida McFadden',
  ],
  adventure: [
    'Alexandre Dumas',
    'Robert Louis Stevenson',
    'Jack London',
    'Joseph Conrad',
    'Rudyard Kipling',
    'Jules Verne',
  ],
  comedy: [
    'P.G. Wodehouse',
    'Mark Twain',
    'Terry Pratchett',
    'Douglas Adams',
    'Dorothy Parker',
  ],
  horror: [
    'Stephen King',
    'Shirley Jackson',
    'H.P. Lovecraft',
    'Mary Shelley',
    'Bram Stoker',
  ],
  fantasy: [
    'J.R.R. Tolkien',
    'Ursula K. Le Guin',
    'Neil Gaiman',
    'George R.R. Martin',
    'Terry Pratchett',
    'C.S. Lewis',
    'J.K. Rowling',
  ],
  literary: [
    'James Joyce',
    'Franz Kafka',
    'Ernest Hemingway',
    'Gabriel García Márquez',
    'Fyodor Dostoevsky',
    'Leo Tolstoy',
    'Virginia Woolf',
    'William Faulkner',
    'Julio Cortázar',
    'Jane Austen',
    'Charles Dickens',
    'Cormac McCarthy',
    'John Steinbeck',
  ],
  historical: [
    'Patrick O\'Brian',
    'Bernard Cornwell',
    'Arturo Pérez-Reverte',
    'Tracy Chevalier',
    'Colleen McCullough',
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Test mode — lock author selection to a single author 100% of the time.
// Set authorOverride to a name string to force every roll to return that author.
// Set to null/'' to resume normal even-distribution selection.
// ─────────────────────────────────────────────────────────────────────────────
let _authorOverride = null // ← set to an author name string to force that author

export function setAuthorOverride(name) { _authorOverride = name || null }
export function getAuthorOverride() { return _authorOverride }

// ─────────────────────────────────────────────────────────────────────────────
// _rollFromPool(pool, countsStore, genre) — shared logic for even-distribution
// author selection. Both rollAuthor and rollNovelAuthor delegate here.
// ─────────────────────────────────────────────────────────────────────────────
const _shortStoryCounts = {} // { genre: { authorName: count } }
const _novelCounts = {}     // { genre: { authorName: count } }

function _rollFromPool(pool, countsStore, genre) {
  // Test mode: return the override author only for the matching genre
  if (genre === 'literary') return 'Ernest Hemingway'
  if (_authorOverride && genre === 'historical') return 'Bernard Cornwell'

  const authors = pool[genre]
  if (!authors || !authors.length) {
    throw new Error(`No authors found for genre "${genre}"`)
  }

  // Initialise counts for this genre if needed
  if (!countsStore[genre]) {
    countsStore[genre] = {}
    for (const name of authors) {
      countsStore[genre][name] = 0
    }
  }

  // Find the minimum selection count
  const counts = countsStore[genre]
  const minCount = Math.min(...authors.map((a) => counts[a] ?? 0))

  // Filter to only authors at the minimum count (least-selected)
  const eligible = authors.filter((a) => (counts[a] ?? 0) === minCount)

  // Random pick among the least-selected authors
  const selected = eligible[Math.floor(Math.random() * eligible.length)]

  // Increment count
  counts[selected] = (counts[selected] ?? 0) + 1

  return selected
}

// ─────────────────────────────────────────────────────────────────────────────
// rollAuthor(genre) — Select a short-story author with even distribution.
// ─────────────────────────────────────────────────────────────────────────────
export function rollAuthor(genre) {
  return _rollFromPool(SHORT_STORY_AUTHORS, _shortStoryCounts, genre)
}

// ─────────────────────────────────────────────────────────────────────────────
// rollNovelAuthor(genre) — Select a novel author with even distribution.
// ─────────────────────────────────────────────────────────────────────────────
export function rollNovelAuthor(genre) {
  return _rollFromPool(NOVEL_AUTHORS, _novelCounts, genre)
}

// Genre metadata — master list with display labels
const ALL_GENRES = [
  { id: 'romance', label: 'Romance' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'scifi', label: 'Science Fiction' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'horror', label: 'Horror' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'literary', label: 'Literary' },
  { id: 'historical', label: 'Historical Fiction' },
  { id: 'fairytale', label: 'Fairy Tale' },
]

// Derived genre lists — only genres that have authors in the corresponding pool
export const SHORT_STORY_GENRES = ALL_GENRES.filter((g) => SHORT_STORY_AUTHORS[g.id])
export const NOVEL_GENRES = ALL_GENRES.filter((g) => NOVEL_AUTHORS[g.id])

// Default export for backwards compat — includes all genres
export const GENRES = ALL_GENRES
