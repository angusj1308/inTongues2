// One-time migration: convert podcast follows + pins from Spotify show IDs
// (or any non-iTunes IDs) to iTunes collectionIds.
//
// For each user:
//   1. List users/{uid}/podcastFollows
//   2. For each doc whose ID isn't a numeric iTunes collectionId:
//        a. iTunes Search by title + publisher
//        b. If matched: create new doc keyed by iTunes ID, copy fields,
//           delete old, rewrite any pin docs referring to the old refId.
//        c. If not matched: mark the doc { orphaned: true } so the front-end
//           can surface a notice on next login.
//
// Idempotent: re-running skips docs already keyed by an iTunes ID and skips
// docs already marked orphaned.
//
// Usage:
//   node scripts/migrate-podcast-follows.js [--dry-run] [--uid=<single-uid>]
//
// Requires serviceAccountKey.json at the repo root.

import { existsSync } from 'fs'
import { createRequire } from 'module'
import admin from 'firebase-admin'
import { findItunesShowByTitle, isValidItunesId } from '../podcastsBackend.js'

const require = createRequire(import.meta.url)

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const m = args.find((a) => a.startsWith(`--${name}=`))
  if (!m) return args.includes(`--${name}`) ? true : fallback
  return m.split('=')[1]
}

const DRY_RUN = !!flag('dry-run')
const SINGLE_UID = flag('uid', null)

// --- Firebase Admin init ---------------------------------------------------

const keyPath = new URL('../serviceAccountKey.json', import.meta.url).pathname
if (!existsSync(keyPath)) {
  console.error('serviceAccountKey.json not found at repo root.')
  process.exit(1)
}
const serviceAccount = require('../serviceAccountKey.json')
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
const db = admin.firestore()

// --- Migration -------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const migrateOneFollow = async (uid, doc) => {
  const oldId = doc.id
  const data = doc.data() || {}

  if (data.orphaned) return { status: 'skipped-orphaned', oldId }
  if (isValidItunesId(oldId)) return { status: 'skipped-already-itunes', oldId }

  const title = data.title || ''
  const publisher = data.host || data.author || ''
  if (!title) {
    return { status: 'skipped-no-title', oldId }
  }

  let match = null
  try {
    match = await findItunesShowByTitle({ title, publisher })
  } catch (err) {
    console.warn(`  iTunes lookup failed for "${title}":`, err.message)
  }
  // Throttle iTunes politely.
  await sleep(150)

  if (!match?.itunesCollectionId) {
    if (DRY_RUN) {
      return { status: 'would-orphan', oldId, title }
    }
    await doc.ref.set(
      { orphaned: true, orphanedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    )
    return { status: 'orphaned', oldId, title }
  }

  const newId = match.itunesCollectionId

  if (DRY_RUN) {
    return { status: 'would-migrate', oldId, newId, title }
  }

  const followsCol = db.collection('users').doc(uid).collection('podcastFollows')
  const newRef = followsCol.doc(newId)

  // Don't clobber a doc that already exists at newId (could happen if the
  // user followed the show twice across different IDs).
  const existing = await newRef.get()
  if (!existing.exists) {
    await newRef.set({
      ...data,
      showId: newId,
      coverUrl: data.coverUrl || match.coverArtUrl || '',
      host: data.host || match.author || '',
      migratedFrom: oldId,
      migratedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }
  await doc.ref.delete()

  // Rewrite any pin pointing at the old refId.
  const pinsSnap = await db
    .collection('users')
    .doc(uid)
    .collection('podcastPins')
    .where('refId', '==', oldId)
    .get()
  const batch = db.batch()
  pinsSnap.forEach((pinDoc) => {
    batch.update(pinDoc.ref, {
      refId: newId,
      coverUrl: pinDoc.data()?.coverUrl || match.coverArtUrl || '',
    })
  })
  if (!pinsSnap.empty) await batch.commit()

  return { status: 'migrated', oldId, newId, title, pinsRewritten: pinsSnap.size }
}

const migrateUser = async (uid) => {
  const followsSnap = await db.collection('users').doc(uid).collection('podcastFollows').get()
  if (followsSnap.empty) return { uid, total: 0, results: [] }
  const results = []
  for (const doc of followsSnap.docs) {
    const r = await migrateOneFollow(uid, doc)
    results.push(r)
  }
  return { uid, total: followsSnap.size, results }
}

const run = async () => {
  console.log(`Migration starting${DRY_RUN ? ' (dry run)' : ''}…`)

  let userIds = []
  if (SINGLE_UID) {
    userIds = [SINGLE_UID]
  } else {
    const usersSnap = await db.collection('users').get()
    userIds = usersSnap.docs.map((d) => d.id)
  }

  const summary = {
    usersProcessed: 0,
    migrated: 0,
    orphaned: 0,
    skipped: 0,
    wouldMigrate: 0,
    wouldOrphan: 0,
  }

  for (const uid of userIds) {
    const { total, results } = await migrateUser(uid)
    if (total === 0) continue
    summary.usersProcessed += 1
    console.log(`\nUser ${uid}: ${total} followed show(s)`)
    for (const r of results) {
      console.log(`  [${r.status}] ${r.oldId}${r.newId ? ` → ${r.newId}` : ''}${r.title ? ` — ${r.title}` : ''}`)
      if (r.status === 'migrated') summary.migrated += 1
      else if (r.status === 'orphaned') summary.orphaned += 1
      else if (r.status === 'would-migrate') summary.wouldMigrate += 1
      else if (r.status === 'would-orphan') summary.wouldOrphan += 1
      else summary.skipped += 1
    }
  }

  console.log('\n--- Summary ---')
  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
