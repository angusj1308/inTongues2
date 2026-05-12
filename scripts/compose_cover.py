#!/usr/bin/env python3
"""inTongues cover-typography compositor.

Takes a 1024×1536 artwork PNG (top half left as empty ivory ground at
#F4EFE5) plus a title and author, and lays the typography onto the canvas
to fixed brand specifications:

    - Title: DM Serif Display Regular, near-black, top-left anchored
    - Author: EB Garamond SemiBold, 30% of title size, below title block

Title sizing picks the largest font size at which greedy word-wrap
produces a layout that satisfies four rules: ≤ MAX_LINES, every line
≤ MAX_TITLE_WIDTH, the title block bottom (TOP_MARGIN + N × line_height)
≤ MAX_TITLE_BLOCK_BOTTOM, and (for multi-line layouts) no NON-LAST line
is a lone short word (≤ ORPHAN_MAX_CHARS chars). The orphan rule prevents
widows like "to" or "and" stranded above more text; last-line short words
("Sea", "Oz", "Mr") are natural title endings and pass through.
Floor of 120px overall; 4px decrement step.

CLI:
    # Single composition
    python scripts/compose_cover.py \\
        --title "The Great Gatsby" \\
        --author "F. Scott Fitzgerald" \\
        --artwork path/to/artwork.png \\
        --output output/covers/the-great-gatsby.png

    # Four canonical test titles against one artwork
    python scripts/compose_cover.py \\
        --test --artwork path/to/crime-and-punishment-artwork.png
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = REPO_ROOT / "assets" / "fonts"
TITLE_FONT_PATH = FONTS_DIR / "DMSerifDisplay-Regular.ttf"
AUTHOR_FONT_PATH = FONTS_DIR / "EBGaramond-SemiBold.ttf"

# Canvas
CANVAS_W = 1024
CANVAS_H = 1536
IVORY = (244, 239, 229)  # #F4EFE5
TEXT_COLOR = (26, 26, 26)  # #1A1A1A

# Layout
LEFT_MARGIN = 80
TOP_MARGIN = 100
MAX_TITLE_WIDTH = 720  # 1024 − 2·80, leaves right-side breathing room
MAX_TITLE_BLOCK_BOTTOM = 512  # 1/3 of canvas height — title typography stays in the top zone
MAX_LINES = 3
LINE_HEIGHT_RATIO = 1.1

# Title sizing
MAX_TITLE_FONT_SIZE = 180
MIN_TITLE_FONT_SIZE = 120
FONT_SIZE_STEP = 4
ORPHAN_MAX_CHARS = 3  # lone words ≤ this length are rejected on first/middle lines; last-line allowed

# Author
AUTHOR_SIZE_RATIO = 0.3
AUTHOR_GAP_RATIO = 0.4  # vertical gap from title's last baseline to author baseline

# Title preprocessing: strip everything after first ;, :, or em-dash.
TITLE_TRUNCATE_RE = re.compile(r'[;:—]')


def preprocess_title(title: str) -> str:
    m = TITLE_TRUNCATE_RE.search(title)
    if m:
        title = title[: m.start()]
    return title.rstrip()


def measure_width(font: ImageFont.FreeTypeFont, text: str) -> int:
    """Pixel advance width of one rendered line."""
    return int(round(font.getlength(text)))


def greedy_wrap(words: list[str], font: ImageFont.FreeTypeFont, max_width: int) -> list[list[str]]:
    """Greedy word-wrap: append each word to the current line if it still fits;
    otherwise start a new line. A single word that overflows on its own is taken
    on its own line (we never strand an empty line)."""
    if not words:
        return [[]]
    lines: list[list[str]] = [[]]
    for word in words:
        line = lines[-1]
        candidate = ' '.join(line + [word])
        if not line or measure_width(font, candidate) <= max_width:
            line.append(word)
        else:
            lines.append([word])
    return lines


def has_orphan(wrapped: list[list[str]]) -> bool:
    """True if any non-last line is a single short word (≤ ORPHAN_MAX_CHARS).

    Single-line layouts return False (no neighbour to compare against). The
    last line is exempt — natural title endings like "Sea", "Oz", or "Mr"
    are acceptable on a final line; we only reject orphans that strand a
    short word with more text below it.
    """
    if len(wrapped) <= 1:
        return False
    return any(
        len(line) == 1 and len(line[0]) <= ORPHAN_MAX_CHARS
        for line in wrapped[:-1]
    )


def fit_title(title: str):
    """Return (font_size, lines, widths, hit_floor_unfit).

    Walk font sizes from MAX_TITLE_FONT_SIZE down to MIN_TITLE_FONT_SIZE in
    FONT_SIZE_STEP decrements. At each size, greedy-wrap and accept the first
    layout that satisfies all four rules: ≤ MAX_LINES, all lines ≤
    MAX_TITLE_WIDTH, title-block bottom ≤ MAX_TITLE_BLOCK_BOTTOM, no orphan
    on first/middle lines. If no size satisfies all four, render greedy at
    the floor and flag hit_floor_unfit.
    """
    words = title.split()
    if not words:
        return MIN_TITLE_FONT_SIZE, [''], [0], True

    for font_size in range(MAX_TITLE_FONT_SIZE, MIN_TITLE_FONT_SIZE - 1, -FONT_SIZE_STEP):
        font = ImageFont.truetype(str(TITLE_FONT_PATH), font_size)
        wrapped = greedy_wrap(words, font, MAX_TITLE_WIDTH)
        widths = [measure_width(font, ' '.join(line)) for line in wrapped]
        line_height = int(round(LINE_HEIGHT_RATIO * font_size))
        block_bottom = TOP_MARGIN + len(wrapped) * line_height
        if (
            len(wrapped) <= MAX_LINES
            and all(w <= MAX_TITLE_WIDTH for w in widths)
            and block_bottom <= MAX_TITLE_BLOCK_BOTTOM
            and not has_orphan(wrapped)
        ):
            lines = [' '.join(w) for w in wrapped]
            return font_size, lines, widths, False

    # Floor fallback — render greedy at MIN and flag.
    font = ImageFont.truetype(str(TITLE_FONT_PATH), MIN_TITLE_FONT_SIZE)
    wrapped = greedy_wrap(words, font, MAX_TITLE_WIDTH)
    lines = [' '.join(w) for w in wrapped]
    widths = [measure_width(font, line) for line in lines]
    return MIN_TITLE_FONT_SIZE, lines, widths, True


def compose(
    title: str,
    author: str,
    artwork_path: Path,
    output_path: Path,
) -> dict:
    for path in (TITLE_FONT_PATH, AUTHOR_FONT_PATH):
        if not path.is_file():
            sys.exit(f"Font not found: {path}")
    if not artwork_path.is_file():
        sys.exit(f"Artwork not found: {artwork_path}")

    title_clean = preprocess_title(title)
    font_size, lines, widths, hit_floor = fit_title(title_clean)

    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), IVORY)
    artwork = Image.open(artwork_path).convert("RGB")
    if artwork.size != (CANVAS_W, CANVAS_H):
        print(
            f"[WARN] Artwork is {artwork.size}, expected {(CANVAS_W, CANVAS_H)}. "
            "Pasting at (0,0) without resize.",
            file=sys.stderr,
        )
    canvas.paste(artwork, (0, 0))

    title_font = ImageFont.truetype(str(TITLE_FONT_PATH), font_size)
    title_ascent, _title_descent = title_font.getmetrics()
    line_height = int(round(LINE_HEIGHT_RATIO * font_size))

    draw = ImageDraw.Draw(canvas)
    for idx, line in enumerate(lines):
        y = TOP_MARGIN + idx * line_height
        draw.text((LEFT_MARGIN, y), line, fill=TEXT_COLOR, font=title_font)

    last_line_top = TOP_MARGIN + (len(lines) - 1) * line_height
    last_baseline = last_line_top + title_ascent

    author_size = max(1, int(round(font_size * AUTHOR_SIZE_RATIO)))
    author_font = ImageFont.truetype(str(AUTHOR_FONT_PATH), author_size)
    author_ascent, _author_descent = author_font.getmetrics()
    gap = int(round(font_size * AUTHOR_GAP_RATIO))
    author_baseline = last_baseline + gap
    author_top = author_baseline - author_ascent
    draw.text((LEFT_MARGIN, author_top), author, fill=TEXT_COLOR, font=author_font)

    if hit_floor:
        print(
            f"[WARN] '{title_clean}' bottomed out at {MIN_TITLE_FONT_SIZE}px — no "
            f"font/line-count combination fit. Rendered lines: {lines}",
            file=sys.stderr,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path, "PNG")

    return {
        "title": title_clean,
        "author": author,
        "font_size": font_size,
        "author_size": author_size,
        "lines": lines,
        "line_widths_px": widths,
        "hit_floor": hit_floor,
        "output_path": str(output_path),
    }


TEST_CASES = [
    ("Frankenstein", "Mary Shelley"),
    ("The Great Gatsby", "F. Scott Fitzgerald"),
    ("The Strange Case of Dr Jekyll and Mr Hyde", "Robert Louis Stevenson"),
    ("Crime and Punishment", "Fyodor Dostoevsky"),
]


def slugify(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def print_report(reports: list[dict]) -> None:
    print()
    print("=" * 64)
    print("COMPOSITOR REPORT")
    print("=" * 64)
    for r in reports:
        print()
        print(f"Title:     {r['title']!r}")
        print(f"Author:    {r['author']!r}")
        print(f"Font size: {r['font_size']}px title / {r['author_size']}px author")
        print(f"Lines ({len(r['lines'])}):")
        for i, (line, w) in enumerate(zip(r['lines'], r['line_widths_px']), 1):
            print(f"  L{i}: {w:>4}px  {line!r}")
        if r['hit_floor']:
            print("  [FLOOR] Hit min font size; rendered best non-fitting arrangement.")
        print(f"Output:    {r['output_path']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--title")
    parser.add_argument("--author")
    parser.add_argument("--artwork", help="Path to artwork PNG (1024×1536, top half empty ivory)")
    parser.add_argument("--output", help="Output path for single composition")
    parser.add_argument(
        "--test",
        action="store_true",
        help="Render four canonical test titles against the artwork.",
    )
    parser.add_argument(
        "--output-dir",
        default="output/covers",
        help="Output directory in --test mode.",
    )
    args = parser.parse_args()

    if args.test:
        if not args.artwork:
            sys.exit("--test requires --artwork")
        artwork_path = Path(args.artwork)
        out_dir = Path(args.output_dir)
        reports = []
        for title, author in TEST_CASES:
            out = out_dir / f"{slugify(title)}.png"
            reports.append(compose(title, author, artwork_path, out))
        print_report(reports)
        return

    missing = [k for k in ("title", "author", "artwork", "output") if not getattr(args, k)]
    if missing:
        sys.exit(f"Missing required args: {', '.join('--' + k for k in missing)}")

    report = compose(args.title, args.author, Path(args.artwork), Path(args.output))
    print_report([report])


if __name__ == "__main__":
    main()
