// One-off backfill: for every story that has a portrait cover but no square
// cover, POST to the running server's /api/generate-square-cover endpoint to
// produce one. Idempotent — safe to re-run; skips stories that already have
// `coverImageUrlSquare`. Requires the server to be up.
//
// Usage:
//   node scripts/backfill-square-covers.js [--server=http://localhost:4000] [--limit=N] [--dry-run]
//
// Requires serviceAccountKey.json at the repo root.

import { existsSync } from 'fs'
import { createRequire } from 'module'
import admin from 'firebase-admin'

const require = createRequire(import.meta.url)

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const m = args.find((a) => a.startsWith(`--${name}=`))
  if (!m) return args.includes(`--${name}`) ? true : fallback
  return m.split('=')[1]
}

const SERVER_URL = flag('server', process.env.BACKFILL_SERVER_URL || 'http://localhost:4000')
const LIMIT = Number(flag('limit', 0)) || 0
const DRY_RUN = Boolean(flag('dry-run'))

const serviceAccountPath = new URL('../serviceAccountKey.json', import.meta.url).pathname
if (!existsSync(serviceAccountPath)) {
  console.error('serviceAccountKey.json not found at repo root:', serviceAccountPath)
  process.exit(1)
}
const serviceAccount = require('../serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'intongues2.firebasestorage.app',
})

const firestore = admin.firestore()

async function main() {
  console.log(`Backfill square covers — server=${SERVER_URL}${DRY_RUN ? ' (DRY RUN)' : ''}${LIMIT ? ` limit=${LIMIT}` : ''}`)

  // Iterate the `stories` collection group across all users.
  const snap = await firestore.collectionGroup('stories').get()
  const all = snap.docs

  // Filter: has a portrait cover, but is missing either the square cover
  // or the extracted signature colour. The endpoint is idempotent and will
  // fill in whichever piece is missing.
  const todo = all.filter((doc) => {
    const data = doc.data() || {}
    const portrait = data.coverImageUrl || data.coverUrl
    if (!portrait) return false
    return !data.coverImageUrlSquare || !data.coverColor
  })

  console.log(`Found ${all.length} stories total — ${todo.length} need square cover or colour extraction.`)

  const slice = LIMIT ? todo.slice(0, LIMIT) : todo
  let ok = 0
  let fail = 0
  let skip = 0

  for (const [i, doc] of slice.entries()) {
    const path = doc.ref.path // users/{uid}/stories/{storyId}
    const parts = path.split('/')
    const uid = parts[1]
    const storyId = parts[3]
    const title = doc.data().title || '(untitled)'

    const tag = `[${i + 1}/${slice.length}]`
    console.log(`${tag} ${storyId} — ${title}`)

    if (DRY_RUN) {
      skip += 1
      continue
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/generate-square-cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, storyId }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`${tag}   ✗ ${res.status} ${res.statusText} ${body}`)
        fail += 1
        continue
      }
      const json = await res.json().catch(() => ({}))
      console.log(`${tag}   ✓ ${json.coverImageUrlSquare || '(updated)'}`)
      ok += 1
    } catch (err) {
      console.error(`${tag}   ✗ ${err?.message || err}`)
      fail += 1
    }
  }

  console.log(`Done. ok=${ok} fail=${fail} skip=${skip}`)
  process.exit(fail ? 1 : 0)
}

main().catch((err) => {
  console.error('backfill-square-covers.js failed:', err)
  process.exit(1)
})
