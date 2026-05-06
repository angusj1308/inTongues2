#!/usr/bin/env python3
"""Walk the Project Gutenberg RDF catalogue and emit a single sorted JSON file.

Reads every per-book RDF under ~/Downloads/cache/epub/, extracts the fields we
care about, applies basic filters, sorts by download count desc, and writes
~/Desktop/intongues2/data/gutenberg_catalog.json.
"""

import json
import os
import sys
from pathlib import Path

from lxml import etree

RDF_ROOT = Path("~/Downloads/cache/epub").expanduser()
OUTPUT_PATH = Path("~/Desktop/intongues2/data/gutenberg_catalog.json").expanduser()

NS = {
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dcterms": "http://purl.org/dc/terms/",
    "pgterms": "http://www.gutenberg.org/2009/pgterms/",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
}


def text_of(elem):
    return elem.text.strip() if elem is not None and elem.text else None


def int_of(elem):
    raw = text_of(elem)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def parse_rdf(path: Path):
    tree = etree.parse(str(path))
    root = tree.getroot()

    ebook = root.find("pgterms:ebook", NS)
    if ebook is None:
        return None

    about = ebook.get(f"{{{NS['rdf']}}}about", "")
    gid = None
    if about.startswith("ebooks/"):
        try:
            gid = int(about.split("/", 1)[1])
        except ValueError:
            gid = None
    if gid is None:
        stem = path.stem
        if stem.startswith("pg") and stem[2:].isdigit():
            gid = int(stem[2:])

    title = text_of(ebook.find("dcterms:title", NS))

    authors = []
    for creator in ebook.findall("dcterms:creator", NS):
        agent = creator.find("pgterms:agent", NS)
        if agent is None:
            continue
        name = text_of(agent.find("pgterms:name", NS))
        if not name:
            continue
        authors.append({
            "name": name,
            "birth_year": int_of(agent.find("pgterms:birthdate", NS)),
            "death_year": int_of(agent.find("pgterms:deathdate", NS)),
        })

    languages = []
    for lang in ebook.findall("dcterms:language", NS):
        desc = lang.find("rdf:Description", NS)
        code = text_of(desc.find("rdf:value", NS)) if desc is not None else None
        if code:
            languages.append(code)
    language = languages[0] if languages else None

    subjects = []
    for subj in ebook.findall("dcterms:subject", NS):
        desc = subj.find("rdf:Description", NS)
        if desc is None:
            continue
        value = text_of(desc.find("rdf:value", NS))
        if value:
            subjects.append(value)

    bookshelves = []
    for shelf in ebook.findall("pgterms:bookshelf", NS):
        desc = shelf.find("rdf:Description", NS)
        if desc is None:
            continue
        value = text_of(desc.find("rdf:value", NS))
        if value:
            bookshelves.append(value)

    download_count = int_of(ebook.find("pgterms:downloads", NS))

    rights = text_of(ebook.find("dcterms:rights", NS))

    epub_url = None
    for hf in ebook.findall("dcterms:hasFormat", NS):
        f = hf.find("pgterms:file", NS)
        if f is None:
            continue
        url = f.get(f"{{{NS['rdf']}}}about")
        if not url:
            continue
        formats = []
        for fmt in f.findall("dcterms:format", NS):
            desc = fmt.find("rdf:Description", NS)
            if desc is None:
                continue
            v = text_of(desc.find("rdf:value", NS))
            if v:
                formats.append(v)
        if any("application/epub+zip" in v for v in formats):
            if ".images" not in url and "noimages" not in url:
                epub_url = url
                break
            if epub_url is None:
                epub_url = url

    return {
        "gutenberg_id": gid,
        "title": title,
        "authors": authors,
        "language": language,
        "subjects": subjects,
        "bookshelves": bookshelves,
        "download_count": download_count,
        "epub_url": epub_url,
        "rights": rights,
    }


def passes_filters(book):
    if book is None:
        return False
    if book["download_count"] is None:
        return False
    if not book["authors"]:
        return False
    if not book["epub_url"]:
        return False
    rights = book["rights"] or ""
    if "public domain" not in rights.lower():
        return False
    return True


def main():
    if not RDF_ROOT.is_dir():
        sys.exit(f"RDF root not found: {RDF_ROOT}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    books = []
    scanned = 0
    errors = 0

    for entry in os.scandir(RDF_ROOT):
        if not entry.is_dir():
            continue
        rdf_path = Path(entry.path) / f"{entry.name}.rdf"
        if not rdf_path.is_file():
            for candidate in Path(entry.path).glob("*.rdf"):
                rdf_path = candidate
                break
            else:
                continue

        scanned += 1
        try:
            book = parse_rdf(rdf_path)
        except etree.XMLSyntaxError:
            errors += 1
            continue
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  parse error on {rdf_path}: {e}", file=sys.stderr)
            continue

        if passes_filters(book):
            books.append(book)

        if scanned % 5000 == 0:
            print(f"  scanned {scanned}, kept {len(books)}, errors {errors}")

    books.sort(key=lambda b: b["download_count"], reverse=True)

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(books, f, indent=2, ensure_ascii=False)

    print()
    print(f"Total RDFs scanned: {scanned}")
    print(f"Parse errors:       {errors}")
    print(f"Books after filter: {len(books)}")
    print(f"Output:             {OUTPUT_PATH}")
    print()
    print("Top 10 by download count:")
    for i, b in enumerate(books[:10], start=1):
        author = b["authors"][0]["name"] if b["authors"] else "?"
        print(f"  {i:>2}. [{b['download_count']:>7}] {b['title']} — {author}")


if __name__ == "__main__":
    main()
