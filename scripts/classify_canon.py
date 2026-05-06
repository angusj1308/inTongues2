#!/usr/bin/env python3
"""Classify the local Gutenberg catalogue into a 5-tier canonicity scale via Claude Haiku.

Reads gutenberg_catalog.json, sends each book to Claude for a 1–5 tier
classification, writes gutenberg_catalog_classified.json sorted by
(canon_tier asc, download_count desc). Saves partial progress every 5,000
classifications so a crash doesn't lose all work.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from anthropic import APIError, AsyncAnthropic

INPUT_PATH = Path("~/Desktop/intongues2/data/gutenberg_catalog.json").expanduser()
OUTPUT_PATH = Path("~/Desktop/intongues2/data/gutenberg_catalog_classified.json").expanduser()
PARTIAL_PATH = OUTPUT_PATH.with_suffix(".partial.json")

MODEL = "claude-haiku-4-5-20251001"
CONCURRENCY = 50
SAVE_EVERY = 5_000
PROGRESS_EVERY = 1_000

SYSTEM_PROMPT = """You classify books from the Project Gutenberg catalogue by literary or cultural significance. Return only a single digit 1–5 corresponding to the tier, no explanation.

Tier 1: Universally recognised classic. Works that any educated person would recognise by title or author. Examples: Pride and Prejudice, Crime and Punishment, The Iliad, Don Quixote.

Tier 2: Well-known to literate readers. Major works by significant authors, or important works in their literary tradition. Examples: Dante's Vita Nuova, Dostoevsky's House of the Dead, Schiller's Die Räuber, classical Chinese novels like Dream of the Red Chamber.

Tier 3: Niche but legitimate literary or intellectual works. Secondary works of major authors, regionally important texts, foundational works in specialist fields. Examples: lesser-known Walter Scott novels, philosophical essays by minor but real philosophers, important translations.

Tier 4: Specialist or antiquarian works of limited general interest. Parish histories, regimental histories, technical manuals, period-specific reference works. Example: "Records of Parishes Round Horncastle".

Tier 5: Obscure works with minimal literary, historical, or cultural significance for a modern reader. Forgotten pamphlets, minor periodicals, obscure devotional tracts.

Important: Recognise canonical works from all literary traditions, not only Western. Chinese, Japanese, Arabic, Indian, African, Latin American canonical works should be tiered by their significance in their own tradition.

Return only the digit. No reasoning, no preamble."""


def build_user_message(book: dict) -> str:
    authors = ", ".join(a["name"] for a in book["authors"]) or "(unknown)"
    subjects = "; ".join(book["subjects"][:5]) or "(none)"
    bookshelves = "; ".join(book["bookshelves"]) or "(none)"
    language = book.get("language") or "(unknown)"
    return (
        f"Title: {book['title']}\n"
        f"Author(s): {authors}\n"
        f"Language: {language}\n"
        f"Subjects: {subjects}\n"
        f"Bookshelves: {bookshelves}\n"
        f"Downloads: {book['download_count']}"
    )


def parse_tier(text: str | None) -> int | None:
    if not text:
        return None
    for ch in text.strip():
        if ch in "12345":
            return int(ch)
    return None


async def classify_one(client: AsyncAnthropic, sem: asyncio.Semaphore, book: dict) -> int | None:
    async with sem:
        try:
            response = await client.messages.create(
                model=MODEL,
                max_tokens=5,
                system=[{
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": build_user_message(book)}],
            )
            text = "".join(b.text for b in response.content if b.type == "text")
            return parse_tier(text)
        except APIError as e:
            print(
                f"  API error on book {book.get('gutenberg_id')} ({book.get('title')!r}): {e}",
                file=sys.stderr,
            )
            return None


def save_partial(books: list[dict], done: dict[int, int | None]) -> None:
    rows = [
        {"gutenberg_id": b["gutenberg_id"], "canon_tier": done[b["gutenberg_id"]]}
        for b in books
        if b["gutenberg_id"] in done
    ]
    tmp = PARTIAL_PATH.with_suffix(".partial.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(rows, f)
    tmp.replace(PARTIAL_PATH)


def summarize(out: list[dict]) -> None:
    counts: dict[int | None, int] = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, None: 0}
    by_tier: dict[int, list[dict]] = {1: [], 2: [], 3: [], 4: [], 5: []}
    for b in out:
        t = b["canon_tier"]
        counts[t] = counts.get(t, 0) + 1
        if t in by_tier:
            by_tier[t].append(b)

    print()
    print("Books per tier:")
    for t in (1, 2, 3, 4, 5):
        print(f"  Tier {t}: {counts[t]:>6}")
    print(f"  Unparseable: {counts[None]}")

    if counts[1] < 100:
        print(f"\n[WARN] Tier 1 has only {counts[1]} books (<100). Prompt may need adjustment.")
    elif counts[1] > 1000:
        print(f"\n[WARN] Tier 1 has {counts[1]} books (>1000). Prompt may need adjustment.")

    for t in (1, 2, 3, 4, 5):
        print(f"\nTop 10 — Tier {t}:")
        for i, b in enumerate(by_tier[t][:10], start=1):
            author = b["authors"][0]["name"] if b["authors"] else "?"
            print(f"  {i:>2}. [{b['download_count']:>7}] {b['title']} — {author}")


async def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit(
            "Error: ANTHROPIC_API_KEY is not set. Get a key at console.anthropic.com\n"
            "and export it: `export ANTHROPIC_API_KEY=sk-ant-...`"
        )

    if not INPUT_PATH.is_file():
        sys.exit(f"Input not found: {INPUT_PATH}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    with INPUT_PATH.open("r", encoding="utf-8") as f:
        books = json.load(f)
    print(f"Loaded {len(books)} books from {INPUT_PATH}")

    done: dict[int, int | None] = {}
    if PARTIAL_PATH.exists():
        with PARTIAL_PATH.open("r", encoding="utf-8") as f:
            for entry in json.load(f):
                done[entry["gutenberg_id"]] = entry["canon_tier"]
        print(f"Resuming: {len(done)} books already classified.")

    pending = [b for b in books if b["gutenberg_id"] not in done]
    if not pending:
        print("All books already classified; assembling output.")

    client = AsyncAnthropic(api_key=api_key, max_retries=3)
    sem = asyncio.Semaphore(CONCURRENCY)

    print(f"Classifying {len(pending)} books (concurrency={CONCURRENCY}, model={MODEL})…")

    completed = 0
    null_count = 0

    async def worker(book: dict) -> None:
        nonlocal completed, null_count
        tier = await classify_one(client, sem, book)
        done[book["gutenberg_id"]] = tier
        completed += 1
        if tier is None:
            null_count += 1
        if completed % PROGRESS_EVERY == 0:
            print(f"  classified {completed}/{len(pending)} (null: {null_count})")
        if completed % SAVE_EVERY == 0:
            save_partial(books, done)

    if pending:
        await asyncio.gather(*(worker(b) for b in pending))

    out: list[dict] = []
    for b in books:
        b = dict(b)
        b["canon_tier"] = done.get(b["gutenberg_id"])
        out.append(b)

    out.sort(
        key=lambda b: (
            b["canon_tier"] if b["canon_tier"] is not None else 6,
            -b["download_count"],
        )
    )

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {OUTPUT_PATH}")

    if PARTIAL_PATH.exists():
        PARTIAL_PATH.unlink()

    summarize(out)


if __name__ == "__main__":
    asyncio.run(main())
