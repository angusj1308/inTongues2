/* eslint-disable no-console */
/**
 * One-shot migration: tag every doc in `gutenberg_classics` with `genreShelf`.
 *
 * Match strategy: normalized title (lowercase, diacritic-stripped, punctuation
 * collapsed to single spaces) plus the author's lastname (everything before
 * the first comma in the Project Gutenberg "Lastname, First..." format).
 * Volume-suffix fallback for canonical titles like "Buddenbrooks, Vol. 1"
 * matching mapping entry "Buddenbrooks".
 *
 * Usage:
 *   node scripts/tag-classics-genres.js [--dry-run]
 *
 * Requires serviceAccountKey.json at the repo root.
 */

import { existsSync } from 'fs'
import { createRequire } from 'module'
import admin from 'firebase-admin'

const require = createRequire(import.meta.url)

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')

const keyPath = new URL('../serviceAccountKey.json', import.meta.url).pathname
if (!existsSync(keyPath)) {
  console.error('serviceAccountKey.json not found at repo root.')
  process.exit(1)
}
const serviceAccount = require('../serviceAccountKey.json')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

const COLLECTION = 'gutenberg_classics'

// Shelf order matches the brief's display order. Keys are the exact strings
// written into Firestore as `genreShelf`. Values are [title, lastname] pairs.
const SHELVES = {
  'Russian Masters': [
    ['Crime and Punishment', 'Dostoyevsky'],
    ['The Brothers Karamazov', 'Dostoyevsky'],
    ['The Idiot', 'Dostoyevsky'],
    ['Demons', 'Dostoyevsky'],
    ['Notes from the Underground', 'Dostoyevsky'],
    ['War and Peace', 'Tolstoy'],
    ['Anna Karenina', 'Tolstoy'],
    ['The Kreutzer Sonata and Other Stories', 'Tolstoy'],
    ['Dead Souls', 'Gogol'],
    ['The Overcoat and Other Stories', 'Gogol'],
    ['Complete Short Stories', 'Chekhov'],
    ['Fathers and Sons', 'Turgenev'],
  ],
  '19th-Century Classics': [
    ['Bleak House', 'Dickens'],
    ['David Copperfield', 'Dickens'],
    ['Great Expectations', 'Dickens'],
    ['Oliver Twist', 'Dickens'],
    ['Hard Times', 'Dickens'],
    ['Nicholas Nickleby', 'Dickens'],
    ['A Christmas Carol', 'Dickens'],
    ['A Tale of Two Cities', 'Dickens'],
    ['The Pickwick Papers', 'Dickens'],
    ['Middlemarch', 'Eliot'],
    ['Silas Marner', 'Eliot'],
    ['The Way We Live Now', 'Trollope'],
    ['Barchester Towers', 'Trollope'],
    ["Tess of the d'Urbervilles", 'Hardy'],
    ['Jude the Obscure', 'Hardy'],
    ['Far from the Madding Crowd', 'Hardy'],
    ['Vanity Fair', 'Thackeray'],
    ['The Tenant of Wildfell Hall', 'Brontë'],
    ['The Portrait of a Lady', 'James'],
    ['Daisy Miller', 'James'],
    ['The Turn of the Screw', 'James'],
    ['Madame Bovary', 'Flaubert'],
    ['L’Éducation sentimentale', 'Flaubert'],
    ['Le Rouge et le Noir', 'Stendhal'],
    ['La Chartreuse de Parme', 'Stendhal'],
    ['Le Père Goriot', 'Balzac'],
    ['Illusions perdues', 'Balzac'],
    ['Eugénie Grandet', 'Balzac'],
    ['The Sorrows of Young Werther', 'Goethe'],
    ['The Scarlet Letter', 'Hawthorne'],
    ['The House of the Seven Gables', 'Hawthorne'],
    ['Moby-Dick', 'Melville'],
    ['Bartleby, the Scrivener', 'Melville'],
    ['The Red Badge of Courage', 'Crane'],
    ['Maggie: A Girl of the Streets', 'Crane'],
  ],
  'Modernist Classics': [
    ['Ulysses', 'Joyce'],
    ['Dubliners', 'Joyce'],
    ['A Portrait of the Artist as a Young Man', 'Joyce'],
    ['Mrs. Dalloway', 'Woolf'],
    ['The Sound and the Fury', 'Faulkner'],
    ['The Sun Also Rises', 'Hemingway'],
    ['A Farewell to Arms', 'Hemingway'],
    ['Du côté de chez Swann', 'Proust'],
    ['Death in Venice', 'Mann'],
    ['Buddenbrooks', 'Mann'],
    ['Siddhartha', 'Hesse'],
    ['Demian', 'Hesse'],
    ['Steppenwolf', 'Hesse'],
    ['The Great Gatsby', 'Fitzgerald'],
    ['This Side of Paradise', 'Fitzgerald'],
    ['The Beautiful and Damned', 'Fitzgerald'],
    ["Lady Chatterley's Lover", 'Lawrence'],
    ['Sons and Lovers', 'Lawrence'],
    ['Women in Love', 'Lawrence'],
    ['The Rainbow', 'Lawrence'],
    ['Heart of Darkness', 'Conrad'],
    ['The Secret Agent', 'Conrad'],
    ['Lord Jim', 'Conrad'],
    ['Nostromo', 'Conrad'],
    ['A Passage to India', 'Forster'],
    ['Howards End', 'Forster'],
    ['A Room with a View', 'Forster'],
    ['The House of Mirth', 'Wharton'],
    ['The Age of Innocence', 'Wharton'],
    ['Ethan Frome', 'Wharton'],
    ['My Ántonia', 'Cather'],
    ['The Jungle', 'Sinclair'],
  ],
  Romance: [
    ['Pride and Prejudice', 'Austen'],
    ['Sense and Sensibility', 'Austen'],
    ['Emma', 'Austen'],
    ['Persuasion', 'Austen'],
    ['Mansfield Park', 'Austen'],
    ['Northanger Abbey', 'Austen'],
    ['Jane Eyre', 'Brontë'],
    ['Wuthering Heights', 'Brontë'],
    ['Eugene Onegin', 'Pushkin'],
    ['La Princesse de Clèves', 'La Fayette'],
  ],
  Adventure: [
    ['The Count of Monte Cristo', 'Dumas'],
    ['The Three Musketeers', 'Dumas'],
    ['Treasure Island', 'Stevenson'],
    ['Kidnapped', 'Stevenson'],
    ['The Strange Case of Dr. Jekyll and Mr. Hyde', 'Stevenson'],
    ['Robinson Crusoe', 'Defoe'],
    ['The Call of the Wild', 'London'],
    ['Martin Eden', 'London'],
    ['Around the World in Eighty Days', 'Verne'],
    ['Twenty Thousand Leagues under the Sea', 'Verne'],
    ['A Journey to the Centre of the Earth', 'Verne'],
    ['Adventures of Huckleberry Finn', 'Twain'],
    ['The Prince and the Pauper', 'Twain'],
    ['Tom Sawyer', 'Twain'],
    ["A Connecticut Yankee in King Arthur's Court", 'Twain'],
    ['The Last of the Mohicans', 'Cooper'],
    ['Kim', 'Kipling'],
    ['The Jungle Book', 'Kipling'],
  ],
  'Mystery & Detective': [
    ['The Adventures of Sherlock Holmes', 'Doyle'],
    ['The Memoirs of Sherlock Holmes', 'Doyle'],
    ['A Study in Scarlet', 'Doyle'],
    ['The Hound of the Baskervilles', 'Doyle'],
    ['The Murder of Roger Ackroyd', 'Christie'],
    ['The Mysterious Affair at Styles', 'Christie'],
    ['The Woman in White', 'Collins'],
    ['The Moonstone', 'Collins'],
  ],
  'Sci-Fi': [
    ['The Time Machine', 'Wells'],
    ['The War of the Worlds', 'Wells'],
    ['The Invisible Man', 'Wells'],
    ['The Island of Doctor Moreau', 'Wells'],
  ],
  'Gothic & Horror': [
    ['Frankenstein', 'Shelley'],
    ['Dracula', 'Stoker'],
    ['The Picture of Dorian Gray', 'Wilde'],
    ['Works, Vol. 2', 'Poe'],
  ],
  'Comedy & Satire': [
    ['Tom Jones', 'Fielding'],
    ['Tristram Shandy', 'Sterne'],
    ['Candide', 'Voltaire'],
    ["Gulliver's Travels", 'Swift'],
    ['Right Ho, Jeeves', 'Wodehouse'],
    ['The Inimitable Jeeves', 'Wodehouse'],
  ],
  'Historical Fiction': [
    ['Les Misérables', 'Hugo'],
    ['Notre-Dame de Paris', 'Hugo'],
    ['All Quiet on the Western Front', 'Remarque'],
    ['Waverley', 'Scott'],
    ["Uncle Tom's Cabin", 'Stowe'],
    ['The Tale of Genji', 'Murasaki Shikibu'],
  ],
  "Children's Classics": [
    ["Alice's Adventures in Wonderland", 'Carroll'],
    ['Through the Looking-Glass', 'Carroll'],
    ['The Wonderful Wizard of Oz', 'Baum'],
    ['Peter Pan', 'Barrie'],
    ['Anne of Green Gables', 'Montgomery'],
    ['Little Women', 'Alcott'],
    ['The Secret Garden', 'Burnett'],
    ['Heidi', 'Spyri'],
    ['The Wind in the Willows', 'Grahame'],
    ['Winnie-the-Pooh', 'Milne'],
    ['The House at Pooh Corner', 'Milne'],
    ['Pinocchio', 'Collodi'],
  ],
  'Myth, Fable & Fairy Tale': [
    ["Aesop's Fables", 'Aesop'],
    ["Grimms' Fairy Tales", 'Grimm'],
    ["Andersen's Fairy Tales", 'Andersen'],
    ['The Decameron', 'Boccaccio'],
  ],
}

const normalize = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const authorLastName = (name) => {
  if (!name) return ''
  return name.split(',')[0].trim()
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`)
  console.log(`Reading ${COLLECTION}...`)

  const snap = await db.collection(COLLECTION).get()
  console.log(`  ${snap.size} books`)

  // Index docs by normalized (title, lastname) and bucket by lastname for
  // the volume-suffix fallback.
  const byKey = new Map()
  const byLastname = new Map()
  const docList = []
  for (const doc of snap.docs) {
    const data = doc.data()
    const title = data.title || ''
    const lastname = authorLastName(data.authors?.[0]?.name)
    const nTitle = normalize(title)
    const nLast = normalize(lastname)
    const entry = { id: doc.id, title, lastname, nTitle, nLast }
    byKey.set(`${nTitle}|${nLast}`, entry)
    if (!byLastname.has(nLast)) byLastname.set(nLast, [])
    byLastname.get(nLast).push(entry)
    docList.push(entry)
  }

  const updates = [] // { id, shelf, mappedTitle, matchedTitle }
  const matchedDocIds = new Set()
  const unmatched = [] // { shelf, title, lastname }

  for (const [shelf, entries] of Object.entries(SHELVES)) {
    for (const [title, lastname] of entries) {
      const nTitle = normalize(title)
      const nLast = normalize(lastname)
      const key = `${nTitle}|${nLast}`

      let match = byKey.get(key)

      if (!match) {
        // Volume-suffix fallback: same lastname, Firestore title starts with
        // mapping title + space. Catches "Buddenbrooks, Vol. 1" matching
        // mapping "Buddenbrooks".
        const candidates = byLastname.get(nLast) || []
        const prefix = nTitle + ' '
        match = candidates.find((c) => c.nTitle.startsWith(prefix))
      }

      if (!match) {
        unmatched.push({ shelf, title, lastname })
        continue
      }

      if (matchedDocIds.has(match.id)) {
        // Already assigned to a different shelf — duplicate mapping.
        console.warn(
          `[WARN] Book ${match.id} (${match.title}) mapped to ${shelf} but already assigned. Skipping.`,
        )
        continue
      }

      matchedDocIds.add(match.id)
      updates.push({
        id: match.id,
        shelf,
        mappedTitle: title,
        matchedTitle: match.title,
      })
    }
  }

  const orphans = docList.filter((d) => !matchedDocIds.has(d.id))

  console.log()
  console.log(`Matched: ${updates.length}`)
  console.log(`Unmatched mapping entries: ${unmatched.length}`)
  for (const u of unmatched) {
    console.log(`  - [${u.shelf}] ${u.title} (${u.lastname})`)
  }
  console.log()
  console.log(`Firestore docs not in mapping: ${orphans.length}`)
  for (const o of orphans) {
    console.log(`  - [${o.id}] ${o.title} — ${o.lastname}`)
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No writes performed.')
    process.exit(0)
  }

  console.log(`\nWriting ${updates.length} updates in batches of 500...`)
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500)
    const batch = db.batch()
    for (const u of chunk) {
      batch.update(db.collection(COLLECTION).doc(u.id), {
        genreShelf: u.shelf,
      })
    }
    await batch.commit()
    console.log(`  committed ${i + chunk.length}/${updates.length}`)
  }
  console.log('\nDone.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
