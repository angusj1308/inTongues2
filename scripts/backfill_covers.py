#!/usr/bin/env python3
"""Backfill Open Library cover URLs onto every doc in `gutenberg_classics`.

For each Firestore doc without a `cover_url`, search Open Library by title +
author surname, verify the returned cover image is not a 1x1 placeholder,
and persist the URL plus provenance fields back to the doc. Idempotent:
docs that already have a cover_url are skipped.
"""

import asyncio
import sys
from pathlib import Path

import aiohttp
import firebase_admin
from firebase_admin import credentials, firestore

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_PATH = REPO_ROOT / "serviceAccountKey.json"
COLLECTION = "gutenberg_classics"

CONCURRENCY = 5
PROGRESS_EVERY = 50
MAX_RETRIES = 3
HTTP_TIMEOUT = aiohttp.ClientTimeout(total=20)

SEARCH_URL = "https://openlibrary.org/search.json"
COVER_URL_FMT = "https://covers.openlibrary.org/b/id/{cover_i}-L.jpg?default=false"

USER_AGENT = "intongues-cover-backfill/1.0 (https://intongues.app)"


def author_surname(name: str | None) -> str:
    """Extract surname from the Project Gutenberg "Surname, First..." format."""
    if not name:
        return ""
    return name.split(",", 1)[0].strip()


def title_variants(title: str) -> list[str]:
    """Return [full title, title-before-colon] when a subtitle is present."""
    title = (title or "").strip()
    if not title:
        return []
    variants = [title]
    if ":" in title:
        before = title.split(":", 1)[0].strip()
        if before and before != title:
            variants.append(before)
    return variants


async def with_retries(do_request, label: str):
    last_exc: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            return await do_request()
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            last_exc = e
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 ** attempt)
    raise RuntimeError(f"{label} failed after {MAX_RETRIES} attempts: {last_exc}") from last_exc


async def search_cover_id(session: aiohttp.ClientSession, title: str, surname: str) -> int | None:
    params: dict[str, str] = {"title": title, "limit": "1"}
    if surname:
        params["author"] = surname

    async def _do():
        async with session.get(SEARCH_URL, params=params) as resp:
            resp.raise_for_status()
            return await resp.json()

    data = await with_retries(_do, f"search {title!r}")
    docs = data.get("docs") or []
    if not docs:
        return None
    return docs[0].get("cover_i")


async def find_cover(session: aiohttp.ClientSession, title: str, surname: str) -> str | None:
    for variant in title_variants(title):
        cover_id = await search_cover_id(session, variant, surname)
        if cover_id:
            return COVER_URL_FMT.format(cover_i=cover_id)
    return None


async def process_doc(
    session: aiohttp.ClientSession,
    sem: asyncio.Semaphore,
    db,
    doc,
    counts: dict[str, int],
    total: int,
) -> None:
    async with sem:
        data = doc.to_dict() or {}
        title = data.get("title") or ""
        authors = data.get("authors") or []
        surname = author_surname(authors[0].get("name")) if authors else ""

        try:
            url = await find_cover(session, title, surname)
        except Exception as e:
            counts["errors"] += 1
            print(f"  [ERROR] {doc.id} {title!r}: {e}", file=sys.stderr)
            return

        update = {
            "cover_url": url,
            "cover_source": "openlibrary" if url else None,
            "cover_fetched_at": firestore.SERVER_TIMESTAMP,
        }

        try:
            await asyncio.to_thread(
                db.collection(COLLECTION).document(doc.id).update, update
            )
        except Exception as e:
            counts["errors"] += 1
            print(f"  [WRITE-ERROR] {doc.id}: {e}", file=sys.stderr)
            return

        if url:
            counts["found"] += 1
        else:
            counts["none"] += 1
        counts["processed"] += 1

        if counts["processed"] % PROGRESS_EVERY == 0:
            print(
                f"  processed {counts['processed']}/{total} "
                f"(found {counts['found']}, no cover {counts['none']}, errors {counts['errors']})"
            )


async def main() -> None:
    if not SERVICE_ACCOUNT_PATH.is_file():
        sys.exit(
            f"serviceAccountKey.json not found at {SERVICE_ACCOUNT_PATH}.\n"
            "Download from Firebase Console → Project Settings → Service Accounts."
        )

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print(f"Authenticated to Firebase project: {cred.project_id}")

    print(f"Fetching {COLLECTION} docs…")
    all_docs = list(db.collection(COLLECTION).stream())
    print(f"Loaded {len(all_docs)} docs.")

    pending = []
    skipped = 0
    for doc in all_docs:
        data = doc.to_dict() or {}
        if data.get("cover_url"):
            skipped += 1
        else:
            pending.append(doc)
    print(f"To process: {len(pending)} (skipping {skipped} with existing cover_url)")

    if not pending:
        print("Nothing to do.")
        return

    sem = asyncio.Semaphore(CONCURRENCY)
    counts = {"processed": 0, "found": 0, "none": 0, "errors": 0}
    headers = {"User-Agent": USER_AGENT}

    async with aiohttp.ClientSession(headers=headers, timeout=HTTP_TIMEOUT) as session:
        await asyncio.gather(
            *(process_doc(session, sem, db, d, counts, len(pending)) for d in pending)
        )

    print()
    print(f"Total processed:    {counts['processed']}")
    print(f"Covers found:       {counts['found']}")
    print(f"No cover:           {counts['none']}")
    print(f"Errors:             {counts['errors']}")
    print(f"Skipped (had URL):  {skipped}")


if __name__ == "__main__":
    asyncio.run(main())
