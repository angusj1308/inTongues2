#!/usr/bin/env python3
"""Push tier 1 English Gutenberg books to Firestore.

Reads gutenberg_catalog_classified.json, filters to canon_tier==1 AND
language=='en', and writes one document per book to the `gutenberg_classics`
collection (doc id = str(gutenberg_id)). Idempotent — re-running overwrites.
"""

import json
import random
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as gcloud_exceptions

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_PATH = REPO_ROOT / "serviceAccountKey.json"
INPUT_PATH = Path("~/Desktop/intongues2/data/gutenberg_catalog_classified.json").expanduser()

COLLECTION = "gutenberg_classics"
BATCH_SIZE = 500
PROGRESS_EVERY = 200

MIN_EXPECTED = 800
MAX_EXPECTED = 1500


def passes_filter(book: dict) -> bool:
    return book.get("canon_tier") == 1 and book.get("language") == "en"


def to_document(book: dict) -> dict:
    return {
        "gutenberg_id": book["gutenberg_id"],
        "title": book["title"],
        "authors": book["authors"],
        "language": book["language"],
        "subjects": book["subjects"],
        "bookshelves": book["bookshelves"],
        "download_count": book["download_count"],
        "canon_tier": book["canon_tier"],
        "epub_url": book["epub_url"],
        "rights": book["rights"],
        "cover_url": None,
        "created_at": firestore.SERVER_TIMESTAMP,
    }


def main() -> None:
    if not SERVICE_ACCOUNT_PATH.is_file():
        sys.exit(
            f"serviceAccountKey.json not found at {SERVICE_ACCOUNT_PATH}.\n"
            "Download from Firebase Console → Project Settings → Service Accounts."
        )
    if not INPUT_PATH.is_file():
        sys.exit(f"Input not found: {INPUT_PATH}")

    with INPUT_PATH.open("r", encoding="utf-8") as f:
        books = json.load(f)
    print(f"Loaded {len(books)} books from {INPUT_PATH}")

    filtered = [b for b in books if passes_filter(b)]
    print(f"Tier 1 + English: {len(filtered)} books")

    if len(filtered) < MIN_EXPECTED or len(filtered) > MAX_EXPECTED:
        sys.exit(
            f"\n[STOP] Filtered count {len(filtered)} is outside expected range "
            f"[{MIN_EXPECTED}, {MAX_EXPECTED}]. Investigate before pushing."
        )

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print(f"Authenticated to Firebase project: {cred.project_id}")

    collection_ref = db.collection(COLLECTION)
    written = 0
    errors: list[tuple[int, str]] = []

    for batch_start in range(0, len(filtered), BATCH_SIZE):
        chunk = filtered[batch_start : batch_start + BATCH_SIZE]
        batch = db.batch()
        for book in chunk:
            doc_ref = collection_ref.document(str(book["gutenberg_id"]))
            batch.set(doc_ref, to_document(book))
        try:
            batch.commit()
            written += len(chunk)
        except gcloud_exceptions.GoogleAPIError as e:
            errors.append((batch_start, str(e)))
            print(f"  [ERROR] batch starting at {batch_start} failed: {e}", file=sys.stderr)
            continue

        if written % PROGRESS_EVERY < BATCH_SIZE:
            print(f"  written {written}/{len(filtered)}")

    print()
    print(f"Total books read:        {len(books)}")
    print(f"Total after filtering:   {len(filtered)}")
    print(f"Total written to FS:     {written}")
    print(f"Errors:                  {len(errors)}")
    for batch_start, msg in errors:
        print(f"  - batch@{batch_start}: {msg}")

    if written < len(filtered) * 0.95:
        sys.exit(
            f"\n[STOP] Only {written}/{len(filtered)} written (>5% gap). "
            "Investigate Firestore write failures."
        )

    print("\n5 random samples (sanity check):")
    for b in random.sample(filtered, min(5, len(filtered))):
        author = b["authors"][0]["name"] if b["authors"] else "?"
        print(f"  [{b['gutenberg_id']}] {b['title']} — {author}")


if __name__ == "__main__":
    main()
