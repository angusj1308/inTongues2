#!/usr/bin/env python3
"""Audit and prune the Firestore classics collection against the Phase 1 keep list.

Default mode is a read-only audit. Pass `--apply` to commit deletes and
canonical-title renames. Idempotent — re-running with `--apply` after a clean
run reports nothing to do.

Schema discovery: prints the field names from the first doc encountered before
running the audit, so any unexpected structure surfaces immediately.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core import exceptions as gcloud_exceptions

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_PATH = REPO_ROOT / "serviceAccountKey.json"
KEEP_LIST_PATH = Path("~/Desktop/intongues2/data/phase_1_keep_ids.json").expanduser()
COLLECTION = "gutenberg_classics"
BATCH_SIZE = 500


def load_keep_list() -> tuple[set[int], dict[int, str]]:
    if not KEEP_LIST_PATH.is_file():
        sys.exit(
            f"Keep list not found at {KEEP_LIST_PATH}.\n"
            "Place phase_1_keep_ids.json there and re-run."
        )
    with KEEP_LIST_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or "ids" not in data or not isinstance(data["ids"], list):
        sys.exit(f"{KEEP_LIST_PATH}: expected an object with an 'ids' array.")
    keep_ids = {int(x) for x in data["ids"]}
    canonical_titles: dict[int, str] = {}
    for entry in data.get("details") or []:
        gid = entry.get("gutenberg_id")
        ct = entry.get("canonical_title")
        if gid is not None and ct:
            canonical_titles[int(gid)] = ct
    return keep_ids, canonical_titles


def doc_gid(doc, data: dict) -> int | None:
    raw = data.get("gutenberg_id")
    if raw is not None:
        try:
            return int(raw)
        except (TypeError, ValueError):
            pass
    try:
        return int(doc.id)
    except (TypeError, ValueError):
        return None


def audit(
    docs: list,
    keep_ids: set[int],
    canonical_titles: dict[int, str],
) -> tuple[list, list, list, set[int]]:
    """Returns (to_remove, to_rename, schema_anomalies, missing_from_firestore)."""
    keep_present_ids: set[int] = set()
    to_remove: list[tuple] = []
    to_rename: list[tuple] = []
    schema_anomalies: list[tuple] = []

    for doc in docs:
        data = doc.to_dict() or {}
        gid = doc_gid(doc, data)
        title = data.get("title") or "(no title)"

        if gid is None:
            schema_anomalies.append((doc.id, sorted(data.keys()), title))
            continue

        if gid in keep_ids:
            keep_present_ids.add(gid)
            ct = canonical_titles.get(gid)
            if ct and ct != title:
                to_rename.append((doc, gid, title, ct))
        else:
            to_remove.append((doc, gid, title))

    missing_from_firestore = keep_ids - keep_present_ids

    print(f"\nTotal docs in {COLLECTION}:        {len(docs)}")
    print(f"In keep list (will keep):           {len(keep_present_ids)}")
    print(f"Not in keep list (will remove):     {len(to_remove)}")
    print(f"Title renames pending:              {len(to_rename)}")
    print(f"Keep-list IDs not in Firestore:     {len(missing_from_firestore)}")
    print(f"Docs without parseable gutenberg_id: {len(schema_anomalies)}")

    if schema_anomalies:
        print("\n[WARN] Docs without a parseable gutenberg_id (left untouched):")
        for doc_id, keys, title in schema_anomalies[:10]:
            print(f"  - doc id={doc_id!r} title={title!r} keys={keys}")
        if len(schema_anomalies) > 10:
            print(f"  ... and {len(schema_anomalies) - 10} more")

    if to_remove:
        print("\nSample to remove (first 20 by current order):")
        for _, gid, title in to_remove[:20]:
            print(f"  - [{gid}] {title}")
        if len(to_remove) > 20:
            print(f"  ... and {len(to_remove) - 20} more")

    if to_rename:
        print("\nSample renames (first 20):")
        for _, gid, current, target in to_rename[:20]:
            print(f"  - [{gid}] {current!r}  ->  {target!r}")
        if len(to_rename) > 20:
            print(f"  ... and {len(to_rename) - 20} more")

    if missing_from_firestore:
        print("\nKeep-list IDs not currently in Firestore (separate import task):")
        for gid in sorted(missing_from_firestore):
            print(f"  - {gid}")

    return to_remove, to_rename, schema_anomalies, missing_from_firestore


def commit_in_batches(db, items, build_op, label: str) -> int:
    written = 0
    for start in range(0, len(items), BATCH_SIZE):
        chunk = items[start : start + BATCH_SIZE]
        batch = db.batch()
        for item in chunk:
            build_op(batch, item)
        try:
            batch.commit()
            written += len(chunk)
        except gcloud_exceptions.GoogleAPIError as e:
            print(f"  [ERROR] {label} batch@{start} failed: {e}", file=sys.stderr)
    return written


def apply_changes(db, to_remove: list, to_rename: list) -> tuple[int, int]:
    coll = db.collection(COLLECTION)

    print(f"\nDeleting {len(to_remove)} docs…")
    for _, gid, title in to_remove:
        print(f"  delete [{gid}] {title}")
    deleted = commit_in_batches(
        db,
        to_remove,
        lambda batch, item: batch.delete(coll.document(item[0].id)),
        "delete",
    )
    print(f"Deleted: {deleted}")

    print(f"\nRenaming {len(to_rename)} docs…")
    for _, gid, current, target in to_rename:
        print(f"  rename [{gid}] {current!r} -> {target!r}")
    renamed = commit_in_batches(
        db,
        to_rename,
        lambda batch, item: batch.update(coll.document(item[0].id), {"title": item[3]}),
        "rename",
    )
    print(f"Renamed: {renamed}")
    return deleted, renamed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit deletes and renames. Default is read-only audit.",
    )
    args = parser.parse_args()

    if not SERVICE_ACCOUNT_PATH.is_file():
        sys.exit(
            f"serviceAccountKey.json not found at {SERVICE_ACCOUNT_PATH}.\n"
            "Download from Firebase Console → Project Settings → Service Accounts."
        )

    keep_ids, canonical_titles = load_keep_list()
    print(f"Loaded keep list: {len(keep_ids)} IDs, {len(canonical_titles)} canonical titles")

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print(f"Authenticated to Firebase project: {cred.project_id}")

    print(f"\nFetching {COLLECTION} docs…")
    docs = list(db.collection(COLLECTION).stream())

    if docs:
        sample = docs[0].to_dict() or {}
        print(f"Schema sample (doc id={docs[0].id!r}): {sorted(sample.keys())}")
    else:
        sys.exit(f"{COLLECTION} is empty — nothing to audit.")

    to_remove, to_rename, anomalies, missing = audit(docs, keep_ids, canonical_titles)

    if not args.apply:
        print("\n[AUDIT ONLY] No mutations performed. Re-run with --apply to commit.")
        return

    if anomalies:
        print(
            "\n[STOP] Schema anomalies detected — refusing to mutate. "
            "Re-run audit and triage the unparseable docs first.",
            file=sys.stderr,
        )
        sys.exit(2)

    if not to_remove and not to_rename:
        print("\nNothing to apply.")
        return

    print("\n--apply: committing mutations…")
    apply_changes(db, to_remove, to_rename)

    print("\nVerifying…")
    remaining = list(db.collection(COLLECTION).stream())
    remaining_ids = set()
    for doc in remaining:
        data = doc.to_dict() or {}
        gid = doc_gid(doc, data)
        if gid is not None:
            remaining_ids.add(gid)

    bogus = remaining_ids - keep_ids
    expected_count = len(keep_ids) - len(missing)
    print(f"Remaining doc count:                {len(remaining)} (expected ~{expected_count})")
    print(f"Remaining IDs not in keep list:     {len(bogus)}")
    if bogus:
        sample = sorted(bogus)[:10]
        suffix = "..." if len(bogus) > 10 else ""
        print(f"  unexpected: {sample}{suffix}")


if __name__ == "__main__":
    main()
