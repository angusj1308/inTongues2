#!/usr/bin/env python3
"""Import a single Project Gutenberg work into the gutenberg_classics collection.

Mirrors the document schema from push_to_firestore.py exactly, plus the
genreShelf field added by tag-classics-genres.js. Pulls metadata from the
Gutendex API so author/language/subjects/download_count/epub_url come out
canonical. Title and shelf are passed in explicitly because the brief calls
for canonical (no-subtitle) titles and the genre mapping is curated.

Usage:
  python scripts/import_single_classic.py \\
      --gid 2097 \\
      --title "The Sign of the Four" \\
      --genre "Mystery & Detective"

Add --dry-run to print the resolved doc without writing.
Idempotent — uses set() so re-running overwrites the doc.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_PATH = REPO_ROOT / "serviceAccountKey.json"
COLLECTION = "gutenberg_classics"
GUTENDEX_BOOK_URL = "https://gutendex.com/books/{gid}"
USER_AGENT = "intongues-import/1.0"
DEFAULT_RIGHTS = "Public domain in the USA."


def fetch_gutendex(gid: int) -> dict:
    url = GUTENDEX_BOOK_URL.format(gid=gid)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Gutendex returned {e.code} for #{gid}: {e.reason}")
    except urllib.error.URLError as e:
        sys.exit(f"Failed to reach Gutendex for #{gid}: {e.reason}")


def pick_epub_url(formats: dict) -> str | None:
    """Prefer the plain EPUB; fall back to images/noimages variants."""
    plain = None
    fallback = None
    for fmt, url in formats.items():
        if "application/epub+zip" not in fmt:
            continue
        if ".images" not in url and "noimages" not in url:
            plain = url
            break
        if fallback is None:
            fallback = url
    return plain or fallback


def build_doc(
    gid: int,
    title: str,
    genre: str | None,
    cover_url: str | None,
    gutendex: dict,
) -> dict:
    epub_url = pick_epub_url(gutendex.get("formats") or {})

    authors = []
    for a in gutendex.get("authors") or []:
        authors.append(
            {
                "name": a.get("name"),
                "birth_year": a.get("birth_year"),
                "death_year": a.get("death_year"),
            }
        )

    language = (gutendex.get("languages") or ["en"])[0]

    doc = {
        "gutenberg_id": int(gid),
        "title": title,
        "authors": authors,
        "language": language,
        "subjects": list(gutendex.get("subjects") or []),
        "bookshelves": list(gutendex.get("bookshelves") or []),
        "download_count": int(gutendex.get("download_count") or 0),
        "canon_tier": 1,
        "epub_url": epub_url,
        "rights": DEFAULT_RIGHTS,
        "cover_url": cover_url,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    if genre:
        doc["genreShelf"] = genre
    return doc


def print_doc_summary(doc: dict) -> None:
    print("Resolved document:")
    print(f"  gutenberg_id:   {doc['gutenberg_id']}")
    print(f"  title:          {doc['title']!r}")
    authors = ", ".join(a.get("name") or "?" for a in doc["authors"]) or "(none)"
    print(f"  authors:        {authors}")
    print(f"  language:       {doc['language']}")
    print(f"  download_count: {doc['download_count']}")
    print(f"  epub_url:       {doc['epub_url']}")
    print(f"  cover_url:      {doc['cover_url']}")
    print(f"  canon_tier:     {doc['canon_tier']}")
    print(f"  rights:         {doc['rights']!r}")
    print(f"  genreShelf:     {doc.get('genreShelf', '(unset)')!r}")
    print(f"  subjects:       {len(doc['subjects'])} entries")
    print(f"  bookshelves:    {len(doc['bookshelves'])} entries")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gid", required=True, type=int, help="Project Gutenberg ID")
    parser.add_argument("--title", required=True, help="Canonical title (no subtitle)")
    parser.add_argument(
        "--genre",
        default=None,
        help="genreShelf value (e.g. 'Mystery & Detective'). Omit to leave unset.",
    )
    parser.add_argument(
        "--cover-url",
        default=None,
        help="Optional cover URL. Defaults to null; backfill_covers.py can populate later.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not SERVICE_ACCOUNT_PATH.is_file():
        sys.exit(
            f"serviceAccountKey.json not found at {SERVICE_ACCOUNT_PATH}.\n"
            "Download from Firebase Console → Project Settings → Service Accounts."
        )

    print(f"Fetching Gutendex metadata for #{args.gid}...")
    gutendex = fetch_gutendex(args.gid)
    doc = build_doc(args.gid, args.title, args.genre, args.cover_url, gutendex)

    print()
    print_doc_summary(doc)

    if not doc["authors"]:
        sys.exit("\n[STOP] Gutendex returned no authors. Aborting.")
    if not doc["epub_url"]:
        sys.exit("\n[STOP] No EPUB URL available in Gutendex response. Aborting.")

    if args.dry_run:
        print("\n[DRY RUN] No write performed.")
        return

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print(f"\nAuthenticated to Firebase project: {cred.project_id}")

    doc_ref = db.collection(COLLECTION).document(str(args.gid))
    if doc_ref.get().exists:
        print(f"[INFO] Doc {args.gid} already exists; overwriting via set().")
    else:
        print(f"[INFO] Creating new doc {args.gid}.")

    doc_ref.set(doc)
    print(f"\nWrote {COLLECTION}/{args.gid}.")


if __name__ == "__main__":
    main()
