#!/usr/bin/env node
/*
 * Test harness for the pause-based intensive chunker.
 *
 * Usage:
 *   node scripts/test-intensive-chunker.js <transcript.json> [--threshold=300] [--out=chunks.txt]
 *
 * Input JSON shape (matches what Firestore stores under
 * users/{uid}/youtubeVideos/{id}/transcripts/{lang}):
 *
 *   { "segments": [ { "start": 0.1, "end": 2.3, "text": "...",
 *                     "words": [ { "start": 0.1, "end": 0.4, "text": "Yo" }, ... ] },
 *                   ... ] }
 *
 * Either a full transcript doc or a bare segments array is accepted.
 *
 * Output:
 *   - stats to stdout (same shape as server logs at import time)
 *   - one chunk per line to --out (default: chunks.txt next to the input)
 *     Each line is prefixed with the gap-before (ms) then the text.
 */

import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_THRESHOLD_MS = 500

// Mirror of server.js `buildIntensiveSegmentsFromWords` so this script is
// standalone. Keep the logic byte-for-byte identical — if you change one,
// change the other.
function buildIntensiveSegmentsFromWords(segments, thresholdMs = DEFAULT_THRESHOLD_MS) {
  const words = []
  for (const seg of segments || []) {
    if (!Array.isArray(seg?.words)) continue
    for (const w of seg.words) {
      const text = typeof w?.text === 'string' ? w.text.trim() : ''
      if (!text) continue
      if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) continue
      words.push({ text, start: Number(w.start), end: Number(w.end) })
    }
  }

  if (words.length === 0) return { segments: [], stats: null }

  const thresholdSec = thresholdMs / 1000
  const chunks = []
  const ioiSamplesMs = []
  let currentWords = []
  let currentPauseBeforeMs = 0

  const flush = (endTime) => {
    if (!currentWords.length) return
    const lastWord = currentWords[currentWords.length - 1]
    chunks.push({
      text: currentWords.map((w) => w.text).join(' '),
      words: currentWords,
      start: currentWords[0].start,
      end: Number.isFinite(endTime) ? endTime : lastWord.end,
      gapBefore: Math.round(currentPauseBeforeMs),
    })
    currentWords = []
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    currentWords.push(word)

    const next = words[i + 1]
    const ioi = next
      ? next.start - word.start
      : Math.max(0, word.end - word.start)
    if (next) ioiSamplesMs.push(ioi * 1000)

    if (next && ioi > thresholdSec) {
      flush(next.start)
      currentPauseBeforeMs = ioi * 1000
    }
  }
  flush()

  const stats = computeStats(ioiSamplesMs, chunks, words.length, thresholdMs)
  return { segments: chunks, stats }
}

function computeStats(ioisMs, chunks, totalWords, thresholdMs) {
  if (!ioisMs.length) {
    return {
      totalWords,
      totalChunks: chunks.length,
      thresholdMs,
      ioiMinMs: null,
      ioiMedianMs: null,
      ioiP90Ms: null,
      ioiP99Ms: null,
      ioiMaxMs: null,
      chunksWithPauseOver1000Ms: 0,
    }
  }
  const sorted = [...ioisMs].sort((a, b) => a - b)
  const pct = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]
  return {
    totalWords,
    totalChunks: chunks.length,
    thresholdMs,
    ioiMinMs: Math.round(sorted[0]),
    ioiMedianMs: Math.round(pct(50)),
    ioiP90Ms: Math.round(pct(90)),
    ioiP99Ms: Math.round(pct(99)),
    ioiMaxMs: Math.round(sorted[sorted.length - 1]),
    chunksWithPauseOver1000Ms: chunks.filter((c) => c.gapBefore > 1000).length,
  }
}

function parseArgs(argv) {
  const args = { _: [] }
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) args[m[1]] = m[2] === undefined ? true : m[2]
    else args._.push(raw)
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = args._[0]
  if (!inputPath) {
    console.error('usage: test-intensive-chunker.js <transcript.json> [--threshold=300] [--out=chunks.txt]')
    process.exit(1)
  }
  const thresholdMs = Number(args.threshold) || DEFAULT_THRESHOLD_MS
  const outPath =
    args.out ||
    path.join(
      path.dirname(inputPath),
      path.basename(inputPath, path.extname(inputPath)) + '.chunks.txt',
    )

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const segments = Array.isArray(raw) ? raw : Array.isArray(raw?.segments) ? raw.segments : null
  if (!segments) {
    console.error('Input JSON must be an array of segments or an object with a `segments` array.')
    process.exit(2)
  }

  const { segments: chunks, stats } = buildIntensiveSegmentsFromWords(segments, thresholdMs)
  if (!stats) {
    console.error('No word-level timing found in input. Cannot build intensive chunks.')
    process.exit(3)
  }

  // stats
  console.log(
    `[intensive test] ` +
    `words=${stats.totalWords} chunks=${stats.totalChunks} ` +
    `threshold=${stats.thresholdMs}ms ` +
    `ioi(ms) min=${stats.ioiMinMs} median=${stats.ioiMedianMs} ` +
    `p90=${stats.ioiP90Ms} p99=${stats.ioiP99Ms} max=${stats.ioiMaxMs} ` +
    `longPauses>1s=${stats.chunksWithPauseOver1000Ms}`,
  )

  // chunks — one per line, gap prefix
  const lines = chunks.map((c) => `[gap=${String(c.gapBefore).padStart(5)}ms] ${c.text}`)
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`Wrote ${chunks.length} chunks to ${outPath}`)
}

main()
