// One-off admin script: set a custom cover image on a story doc.
//
// Usage:
//   node scripts/set-cover.js <uid> <storyId> <imagePath>
//
// Example:
//   node scripts/set-cover.js EjnoR8zeoUXFoHUYW1471Hyf5kP2 ySzCGfv0UwTGSNUUHBzX src/assets/la-puerta-roja.png
//
// Requires serviceAccountKey.json at the repo root (same file the server uses).
// Uploads the image to Firebase Storage at covers/{uid}/{storyId}.{ext} and
// patches users/{uid}/stories/{storyId}.coverImageUrl with the public URL.

import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { createRequire } from 'module'
import admin from 'firebase-admin'

const require = createRequire(import.meta.url)

const [, , uid, storyId, imagePath] = process.argv

if (!uid || !storyId || !imagePath) {
  console.error('Usage: node scripts/set-cover.js <uid> <storyId> <imagePath>')
  process.exit(1)
}

const serviceAccountPath = new URL('../serviceAccountKey.json', import.meta.url).pathname
if (!existsSync(serviceAccountPath)) {
  console.error('serviceAccountKey.json not found at repo root:', serviceAccountPath)
  process.exit(1)
}

if (!existsSync(imagePath)) {
  console.error('Image file not found:', imagePath)
  process.exit(1)
}

const serviceAccount = require('../serviceAccountKey.json')
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'intongues2.firebasestorage.app',
})

const bucket = admin.storage().bucket()
const firestore = admin.firestore()

const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'jpg'
const mimeByExt = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}
const mimeType = mimeByExt[ext]
if (!mimeType) {
  console.error('Unsupported image extension:', ext)
  process.exit(1)
}

const storedExt = ext === 'jpeg' ? 'jpg' : ext
const storagePath = `covers/${uid}/${storyId}.${storedExt}`
const docPath = `users/${uid}/stories/${storyId}`

async function main() {
  const docRef = firestore.doc(docPath)
  const snapshot = await docRef.get()
  if (!snapshot.exists) {
    console.error('Story doc does not exist:', docPath)
    process.exit(1)
  }
  console.log('Found story doc:', docPath, '— title:', snapshot.data().title)

  const imageBuffer = readFileSync(imagePath)
  console.log(`Uploading ${imageBuffer.length} bytes to gs://${bucket.name}/${storagePath} ...`)

  const file = bucket.file(storagePath)
  await file.save(imageBuffer, {
    contentType: mimeType,
    metadata: {
      cacheControl: 'public, max-age=31536000',
    },
  })
  await file.makePublic()

  const coverImageUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`
  console.log('Uploaded. Public URL:', coverImageUrl)

  await docRef.update({ coverImageUrl })

  const after = await docRef.get()
  if (after.data().coverImageUrl !== coverImageUrl) {
    console.error('Verification failed: coverImageUrl on doc does not match uploaded URL')
    process.exit(1)
  }

  console.log('Done. coverImageUrl set on', docPath)
  process.exit(0)
}

main().catch((err) => {
  console.error('set-cover.js failed:', err)
  process.exit(1)
})
