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

const DEFAULT_THRESHOLD_MS = 300

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
  const gapSamplesMs = []
  let currentWords = []
  let currentGapBeforeMs = 0

  const flush = () => {
    if (!currentWords.length) return
    chunks.push({
      text: currentWords.map((w) => w.text).join(' '),
      words: currentWords,
      start: currentWords[0].start,
      end: currentWords[currentWords.length - 1].end,
      gapBefore: Math.round(currentGapBeforeMs),
    })
    currentWords = []
  }

  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    if (i > 0) {
      const prev = words[i - 1]
      const gap = word.start - prev.end
      gapSamplesMs.push(gap * 1000)
      if (gap > thresholdSec) {
        flush()
        currentGapBeforeMs = gap * 1000
      }
    }
    currentWords.push(word)
  }
  flush()

  const stats = computeStats(gapSamplesMs, chunks, words.length, thresholdMs)
  return { segments: chunks, stats }
}

function computeStats(gapsMs, chunks, totalWords, thresholdMs) {
  if (!gapsMs.length) {
    return {
      totalWords,
      totalChunks: chunks.length,
      thresholdMs,
      gapMinMs: null,
      gapMedianMs: null,
      gapP90Ms: null,
      gapP99Ms: null,
      gapMaxMs: null,
      chunksWithGapOver1000Ms: 0,
    }
  }
  const sorted = [...gapsMs].sort((a, b) => a - b)
  const pct = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]
  return {
    totalWords,
    totalChunks: chunks.length,
    thresholdMs,
    gapMinMs: Math.round(sorted[0]),
    gapMedianMs: Math.round(pct(50)),
    gapP90Ms: Math.round(pct(90)),
    gapP99Ms: Math.round(pct(99)),
    gapMaxMs: Math.round(sorted[sorted.length - 1]),
    chunksWithGapOver1000Ms: chunks.filter((c) => c.gapBefore > 1000).length,
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
    `gaps(ms) min=${stats.gapMinMs} median=${stats.gapMedianMs} ` +
    `p90=${stats.gapP90Ms} p99=${stats.gapP99Ms} max=${stats.gapMaxMs} ` +
    `longGaps>1s=${stats.chunksWithGapOver1000Ms}`,
  )

  // chunks — one per line, gap prefix
  const lines = chunks.map((c) => `[gap=${String(c.gapBefore).padStart(5)}ms] ${c.text}`)
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`Wrote ${chunks.length} chunks to ${outPath}`)
}

main()
