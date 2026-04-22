#!/usr/bin/env node
/*
 * Test harness for the pause-based intensive chunker.
 *
 * Usage:
 *   node scripts/test-intensive-chunker.js <input.json> \
 *        [--threshold=1000] [--real-gaps] [--out=chunks.txt]
 *
 * Input JSON shapes accepted:
 *
 *  A) YouTube-style transcript doc (the YouTube words path):
 *     { "segments": [ { "start": ..., "end": ..., "text": "...",
 *                       "words": [ { "text", "start", "end" }, ... ] }, ... ] }
 *     Use the default metric (IOI: next.start - this.start).
 *
 *  B) Whisper-style word stream (the precise path):
 *     { "whisperWords": [ { "text", "start", "end" }, ... ] }
 *     or a top-level array [ { "text", "start", "end" }, ... ].
 *     Pass --real-gaps to use real silence = max(0, next.start - this.end).
 *
 * Output:
 *   - stats to stdout
 *   - one chunk per line to --out (default: <input>.chunks.txt)
 */

import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_THRESHOLD_MS = 1000

function sanitiseWordStream(rawWords) {
  const out = []
  let lastKeptStart = -Infinity
  for (const w of rawWords || []) {
    const text = typeof w?.text === 'string' ? w.text.trim() : ''
    if (!text) continue
    const start = Number(w.start)
    const end = Number(w.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    if (start <= lastKeptStart) continue
    out.push({ text, start, end: end > start ? end : start })
    lastKeptStart = start
  }
  const MAX_ZERO_FILL_SEC = 0.3
  for (let i = 0; i < out.length; i++) {
    if (out[i].end > out[i].start) continue
    const next = out[i + 1]
    const cap = out[i].start + MAX_ZERO_FILL_SEC
    out[i].end = next ? Math.min(cap, next.start) : cap
    if (out[i].end < out[i].start) out[i].end = out[i].start
  }
  return out
}

// Byte-for-byte mirror of server.js `buildIntensiveSegmentsFromWords`.
function buildIntensiveSegmentsFromWords(
  rawWords,
  thresholdMs = DEFAULT_THRESHOLD_MS,
  { useRealGaps = false } = {},
) {
  const words = sanitiseWordStream(rawWords)
  if (words.length === 0) return { segments: [], stats: null }

  const thresholdSec = thresholdMs / 1000
  const gapSamplesMs = []
  const chunks = []
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
    let metric = 0
    if (next) {
      metric = useRealGaps
        ? Math.max(0, next.start - word.end)
        : next.start - word.start
      gapSamplesMs.push(metric * 1000)
    }

    if (next && metric > thresholdSec) {
      flush(Math.min(word.end, next.start))
      currentPauseBeforeMs = metric * 1000
    }
  }
  flush()

  const stats = computeStats(
    gapSamplesMs,
    chunks,
    words.length,
    thresholdMs,
    useRealGaps ? 'gap' : 'ioi',
  )
  return { segments: chunks, stats }
}

function computeStats(samplesMs, chunks, totalWords, thresholdMs, metric) {
  if (!samplesMs.length) {
    return {
      totalWords,
      totalChunks: chunks.length,
      thresholdMs,
      metric,
      minMs: null,
      medianMs: null,
      p90Ms: null,
      p99Ms: null,
      maxMs: null,
      chunksWithPauseOver1000Ms: 0,
    }
  }
  const sorted = [...samplesMs].sort((a, b) => a - b)
  const pct = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length * p) / 100))]
  return {
    totalWords,
    totalChunks: chunks.length,
    thresholdMs,
    metric,
    minMs: Math.round(sorted[0]),
    medianMs: Math.round(pct(50)),
    p90Ms: Math.round(pct(90)),
    p99Ms: Math.round(pct(99)),
    maxMs: Math.round(sorted[sorted.length - 1]),
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

function extractWordStream(raw, preferWhisper) {
  if (preferWhisper) {
    if (Array.isArray(raw)) return raw
    if (Array.isArray(raw?.whisperWords)) return raw.whisperWords
  }
  if (Array.isArray(raw?.segments)) {
    const out = []
    for (const seg of raw.segments) {
      if (!Array.isArray(seg?.words)) continue
      for (const w of seg.words) out.push(w)
    }
    return out
  }
  if (Array.isArray(raw)) return raw
  if (Array.isArray(raw?.whisperWords)) return raw.whisperWords
  return null
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = args._[0]
  if (!inputPath) {
    console.error(
      'usage: test-intensive-chunker.js <input.json> [--threshold=1000] [--real-gaps] [--out=chunks.txt]',
    )
    process.exit(1)
  }
  const thresholdMs = Number(args.threshold) || DEFAULT_THRESHOLD_MS
  const useRealGaps = Boolean(args['real-gaps'])
  const outPath =
    args.out ||
    path.join(
      path.dirname(inputPath),
      path.basename(inputPath, path.extname(inputPath)) + '.chunks.txt',
    )

  const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = extractWordStream(raw, useRealGaps)
  if (!words) {
    console.error('Could not find a word stream in the input JSON.')
    process.exit(2)
  }

  const { segments: chunks, stats } = buildIntensiveSegmentsFromWords(
    words,
    thresholdMs,
    { useRealGaps },
  )
  if (!stats) {
    console.error('No word-level timing found in input. Cannot build intensive chunks.')
    process.exit(3)
  }

  console.log(
    `[intensive test] source=${useRealGaps ? 'whisper' : 'youtube'} ` +
    `words=${stats.totalWords} chunks=${stats.totalChunks} ` +
    `threshold=${stats.thresholdMs}ms ` +
    `${stats.metric}(ms) min=${stats.minMs} median=${stats.medianMs} ` +
    `p90=${stats.p90Ms} p99=${stats.p99Ms} max=${stats.maxMs} ` +
    `longPauses>1s=${stats.chunksWithPauseOver1000Ms}`,
  )

  const lines = chunks.map((c) => `[gap=${String(c.gapBefore).padStart(5)}ms] ${c.text}`)
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
  console.log(`Wrote ${chunks.length} chunks to ${outPath}`)
}

main()
