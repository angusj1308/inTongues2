#!/usr/bin/env python3
"""Batch-generate typography-only covers for every book in gutenberg_classics.

Reads each book's title and author from Firestore, slugifies the title using
the same rule the React renderer applies (slugifyTitle in
src/services/gutenberg.js — ported here to avoid a Node round-trip),
generates a blank 1024×1536 ivory canvas, and hands the trio to
compose_cover.compose() to produce the final cover at
public/assets/classics-covers/{slug}.png.

Idempotent — re-runs overwrite. If --backup-to <dir> is given, any existing
cover at the target path is copied to <dir>/{slug}.png before being
overwritten — but only on first encounter, so re-runs preserve the first-seen
backup rather than midway versions.

User-imported books live under /users/{uid}/... in Firestore and are not
touched by this script — it only iterates the curated gutenberg_classics
collection.

Usage:
    python scripts/batch_typography_covers.py \\
        --backup-to public/assets/classics-covers-legacy/

Flags:
    --backup-to DIR    Preserve any existing covers at DIR/{slug}.png.
    --limit N          Process only the first N books (0 = all). Staging runs.
    --dry-run          Print the plan without writing or backing up.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
import tempfile
import unicodedata
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from PIL import Image

# Import the typography compositor from the sibling script.
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from compose_cover import (  # noqa: E402
    AUTHOR_FONT_PATH,
    CANVAS_H,
    CANVAS_W,
    IVORY,
    TITLE_FONT_PATH,
    compose,
)

REPO_ROOT = SCRIPT_DIR.parent
SERVICE_ACCOUNT_PATH = REPO_ROOT / "serviceAccountKey.json"
COLLECTION = "gutenberg_classics"
COVERS_DIR = REPO_ROOT / "public" / "assets" / "classics-covers"


def slugify_title(title: str) -> str:
    """Port of src/services/gutenberg.js slugifyTitle. Must match exactly so
    files this script writes line up with what the React BookCover requests."""
    if not title:
        return ""
    nfd = unicodedata.normalize("NFD", title)
    stripped = "".join(c for c in nfd if not (0x0300 <= ord(c) <= 0x036F))
    s = stripped.lower()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"[^a-z0-9-]", "", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def format_author(raw: str | None) -> str:
    """Flip Project Gutenberg `Lastname, Given` to natural `Given Lastname`.

    Names without a comma (anonymous works, single-word names, names already
    in natural order) pass through unchanged.
    """
    if not raw:
        return ""
    raw = raw.strip()
    if "," not in raw:
        return raw
    surname, _, given = raw.partition(",")
    surname = surname.strip()
    given = given.strip()
    return f"{given} {surname}" if given else surname


def make_blank_artwork() -> Path:
    """Write the 1024×1536 ivory canvas to a tmpfile once for reuse."""
    tmp = Path(tempfile.gettempdir()) / "intongues_blank_artwork.png"
    Image.new("RGB", (CANVAS_W, CANVAS_H), IVORY).save(tmp, "PNG")
    return tmp


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backup-to",
        type=str,
        default=None,
        help="Copy any existing cover to this directory before overwriting.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Process at most N books (0 = all). Useful for staging.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the plan without writing or backing up.",
    )
    args = parser.parse_args()

    for path in (TITLE_FONT_PATH, AUTHOR_FONT_PATH):
        if not path.is_file():
            sys.exit(f"Font not found: {path}")
    if not SERVICE_ACCOUNT_PATH.is_file():
        sys.exit(
            f"serviceAccountKey.json not found at {SERVICE_ACCOUNT_PATH}.\n"
            "Download from Firebase Console → Project Settings → Service Accounts."
        )

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print(f"Authenticated to Firebase project: {cred.project_id}")

    print(f"Reading {COLLECTION}…")
    docs = list(db.collection(COLLECTION).stream())
    print(f"  {len(docs)} books in collection")

    if args.limit > 0:
        docs = docs[: args.limit]
        print(f"  --limit {args.limit}; processing first {len(docs)}")

    backup_dir: Path | None = None
    if args.backup_to:
        backup_dir = Path(args.backup_to)
        if not backup_dir.is_absolute():
            backup_dir = (Path.cwd() / backup_dir).resolve()
        backup_dir.mkdir(parents=True, exist_ok=True)
        print(f"  backups → {backup_dir}")
    else:
        print("  [WARN] No --backup-to set. Existing covers will be overwritten without backup.")

    COVERS_DIR.mkdir(parents=True, exist_ok=True)
    blank_artwork = make_blank_artwork() if not args.dry_run else None

    counts = {"generated": 0, "backed_up": 0, "skipped": 0, "errored": 0}
    skipped: list[tuple] = []
    errored: list[tuple] = []

    for doc in docs:
        data = doc.to_dict() or {}
        gid = data.get("gutenberg_id", doc.id)
        title = (data.get("title") or "").strip()
        authors = data.get("authors") or []
        first_author = authors[0] if authors and isinstance(authors[0], dict) else {}
        raw_name = first_author.get("name") if isinstance(first_author, dict) else None

        if not title or not raw_name:
            counts["skipped"] += 1
            skipped.append(
                (gid, title or "(missing)", raw_name or "(missing)", "missing title or author")
            )
            continue

        slug = slugify_title(title)
        if not slug:
            counts["skipped"] += 1
            skipped.append((gid, title, raw_name, "empty slug after normalisation"))
            continue

        author = format_author(raw_name)
        out_path = COVERS_DIR / f"{slug}.png"

        if args.dry_run:
            note = ""
            if backup_dir and out_path.exists():
                backup_path = backup_dir / f"{slug}.png"
                if not backup_path.exists():
                    note = f"  (would back up to {backup_path.name})"
                else:
                    note = "  (backup already exists; skip backup)"
            print(f"  [{gid}] {slug}.png  title={title!r}  author={author!r}{note}")
            counts["generated"] += 1
            continue

        if backup_dir and out_path.exists():
            backup_path = backup_dir / f"{slug}.png"
            if not backup_path.exists():
                shutil.copy2(out_path, backup_path)
                counts["backed_up"] += 1

        try:
            compose(title, author, blank_artwork, out_path)
            counts["generated"] += 1
        except SystemExit as e:
            counts["errored"] += 1
            errored.append((gid, title, f"compose_cover bailed: {e}"))
            print(f"  [ERROR] {gid} {title!r}: compose_cover bailed: {e}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            counts["errored"] += 1
            errored.append((gid, title, str(e)))
            print(f"  [ERROR] {gid} {title!r}: {e}", file=sys.stderr)

    print()
    print(f"Generated: {counts['generated']}")
    print(f"Backed up: {counts['backed_up']}")
    print(f"Skipped:   {counts['skipped']}")
    print(f"Errored:   {counts['errored']}")

    if skipped:
        print("\nSkipped books:")
        for gid, title, author, reason in skipped:
            print(f"  - [{gid}] title={title!r} author={author!r} ({reason})")
    if errored:
        print("\nErrored books:")
        for gid, title, err in errored:
            print(f"  - [{gid}] {title!r}: {err}")


if __name__ == "__main__":
    main()
