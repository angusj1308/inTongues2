// Short story authors by genre — used to drive story concept generation
export const SHORT_STORY_AUTHORS = {
  romance: [
    'Nora Roberts',
    'Julia Quinn',
    'Beverly Jenkins',
    'Judith McNaught',
    'Lisa Kleypas',
  ],
  thriller: [
    'Patricia Highsmith',
    'Roald Dahl',
    'Cornell Woolrich',
    'Daphne du Maurier',
    'Patricia Cornwell',
  ],
  scifi: [
    'Ray Bradbury',
    'Isaac Asimov',
    'Philip K. Dick',
    'Ursula K. Le Guin',
    'Ted Chiang',
    'Arthur C. Clarke',
    'Harlan Ellison',
    'Octavia Butler',
  ],
  mystery: [
    'Edgar Allan Poe',
    'Arthur Conan Doyle',
    'Agatha Christie',
    'G.K. Chesterton',
    'Raymond Chandler',
    'Georges Simenon',
  ],
  adventure: [
    'Jack London',
    'Rudyard Kipling',
    'Joseph Conrad',
    'Robert Louis Stevenson',
    'Alexandre Dumas',
  ],
  comedy: [
    'P.G. Wodehouse',
    'Mark Twain',
    'O. Henry',
    'Saki',
    'Dorothy Parker',
  ],
  horror: [
    'Edgar Allan Poe',
    'H.P. Lovecraft',
    'Shirley Jackson',
    'M.R. James',
    'Stephen King',
  ],
  fantasy: [
    'Jorge Luis Borges',
    'Ursula K. Le Guin',
    'Neil Gaiman',
    'Robert E. Howard',
    'Lord Dunsany',
    'J.R.R. Tolkien',
  ],
  literary: [
    'Anton Chekhov',
    'Jorge Luis Borges',
    'James Joyce',
    'Flannery O\'Connor',
    'Franz Kafka',
    'Ernest Hemingway',
    'Gabriel García Márquez',
    'Raymond Carver',
    'Julio Cortázar',
    'Alice Munro',
  ],
  historical: [
    'Isaac Bashevis Singer',
    'Isak Dinesen',
    'Arturo Pérez-Reverte',
    'Hilary Mantel',
    'Umberto Eco',
  ],
  fairytale: [
    'Brothers Grimm',
    'Hans Christian Andersen',
    'Charles Perrault',
    'Oscar Wilde',
    'Italo Calvino',
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// rollAuthor(genre) — Select an author with equal probability from the genre.
// Tracks selection counts so that over time every author is chosen evenly.
// If genre has 5 authors each gets 20%, 8 authors each gets 12.5%, etc.
// ─────────────────────────────────────────────────────────────────────────────
const _authorCounts = {} // { genre: { authorName: count } }

export function rollAuthor(genre) {
  const authors = SHORT_STORY_AUTHORS[genre]
  if (!authors || !authors.length) {
    throw new Error(`No authors found for genre "${genre}"`)
  }

  // Initialise counts for this genre if needed
  if (!_authorCounts[genre]) {
    _authorCounts[genre] = {}
    for (const name of authors) {
      _authorCounts[genre][name] = 0
    }
  }

  // Find the minimum selection count
  const counts = _authorCounts[genre]
  const minCount = Math.min(...authors.map((a) => counts[a] ?? 0))

  // Filter to only authors at the minimum count (least-selected)
  const eligible = authors.filter((a) => (counts[a] ?? 0) === minCount)

  // Random pick among the least-selected authors
  const selected = eligible[Math.floor(Math.random() * eligible.length)]

  // Increment count
  counts[selected] = (counts[selected] ?? 0) + 1

  return selected
}

// Genre metadata for UI display
export const GENRES = [
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
