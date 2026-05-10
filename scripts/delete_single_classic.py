#!/usr/bin/env python3
"""Delete a single doc from gutenberg_classics by Gutenberg ID.

Companion to import_single_classic.py for ad-hoc removals. Prints the doc's
title and authors before deleting so you can sanity-check the target.

Usage:
  python scripts/delete_single_classic.py --gid 834
  python scripts/delete_single_classic.py --gid 834 --dry-run
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_PATH = REPO_ROOT / "serviceAccountKey.json"
COLLECTION = "gutenberg_classics"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gid", required=True, type=int, help="Project Gutenberg ID")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not SERVICE_ACCOUNT_PATH.is_file():
        sys.exit(
            f"serviceAccountKey.json not found at {SERVICE_ACCOUNT_PATH}.\n"
            "Download from Firebase Console → Project Settings → Service Accounts."
        )

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print(f"Authenticated to Firebase project: {cred.project_id}")

    doc_ref = db.collection(COLLECTION).document(str(args.gid))
    snapshot = doc_ref.get()
    if not snapshot.exists:
        sys.exit(f"[STOP] {COLLECTION}/{args.gid} does not exist. Nothing to delete.")

    data = snapshot.to_dict() or {}
    title = data.get("title") or "(no title)"
    authors = ", ".join(
        (a or {}).get("name") or "?" for a in (data.get("authors") or [])
    )
    print()
    print(f"Target: [{args.gid}] {title!r}")
    print(f"  authors:    {authors or '(none)'}")
    print(f"  genreShelf: {data.get('genreShelf', '(unset)')!r}")
    print(f"  downloads:  {data.get('download_count', 0)}")

    if args.dry_run:
        print("\n[DRY RUN] No delete performed.")
        return

    doc_ref.delete()
    print(f"\nDeleted {COLLECTION}/{args.gid}.")


if __name__ == "__main__":
    main()
