#!/usr/bin/env python3
"""Composite the inTongues wordmark onto a finished cover painting.

Renders "inTongues" at the bottom-centre of the canvas in EB Garamond.
Auto-picks black or white text based on the average luminance of the
bottom strip of the canvas — keeps the wordmark legible on light or
dark covers without per-cover tuning.

Usage:
  python3 wordmark_compose.py --painting <in.png> --font <path/to/EBGaramond.ttf> --output <out.png>

Emits one stdout line of structured output for the parent process:
  WORDMARK_RESULT {"luminance": 0.43, "color": "white", ...}
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat


WORDMARK_TEXT = "inTongues"

# Tunable constants. Live in this script so the wordmark can be tweaked
# without code changes upstream.
LUMINANCE_THRESHOLD = 0.5     # mean greyscale (0–1) above which → black wordmark
FONT_SIZE_RATIO = 0.04        # font size as fraction of canvas height
BOTTOM_MARGIN_RATIO = 0.05    # gap between wordmark baseline area and bottom edge
SAMPLE_STRIP_RATIO = 0.10     # height of luminance-sample strip from bottom edge


def compose_wordmark(painting_path: Path, font_path: Path, output_path: Path) -> dict:
    img = Image.open(painting_path).convert("RGB")
    W, H = img.size

    if not font_path.exists():
        raise RuntimeError(f"Wordmark font not found: {font_path}")

    font_size = max(1, int(round(H * FONT_SIZE_RATIO)))
    try:
        font = ImageFont.truetype(str(font_path), font_size)
    except OSError as e:
        raise RuntimeError(f"Failed to load wordmark font ({font_path}): {e}") from e

    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), WORDMARK_TEXT, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Centre horizontally, account for left bbox offset for clean placement
    text_x = (W - text_w) // 2 - bbox[0]
    bottom_margin = int(round(H * BOTTOM_MARGIN_RATIO))
    text_y = H - bottom_margin - text_h - bbox[1]

    # Luminance sample: bottom strip clipped to wordmark bounding box width.
    sample_ok = True
    try:
        strip_h = int(round(H * SAMPLE_STRIP_RATIO))
        strip_left = max(0, (W - text_w) // 2)
        strip_right = min(W, strip_left + text_w)
        strip_top = max(0, H - strip_h)
        strip_box = (strip_left, strip_top, strip_right, H)
        strip = img.crop(strip_box).convert("L")
        mean = ImageStat.Stat(strip).mean[0] / 255.0
    except Exception as exc:
        # Per spec: soft-fail luminance sampling, default to black wordmark.
        print(f"[wordmark] luminance sample failed: {exc} — defaulting to black", file=sys.stderr)
        mean = 1.0
        strip_box = None
        sample_ok = False

    color = (0, 0, 0) if mean > LUMINANCE_THRESHOLD else (255, 255, 255)
    draw.text((text_x, text_y), WORDMARK_TEXT, font=font, fill=color)
    img.save(output_path, format="PNG")

    return {
        "luminance": round(mean, 4),
        "color": "black" if color == (0, 0, 0) else "white",
        "sample_ok": sample_ok,
        "threshold": LUMINANCE_THRESHOLD,
        "canvas": [W, H],
        "font_size": font_size,
        "sample_box": list(strip_box) if strip_box else None,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--painting", type=Path, required=True)
    p.add_argument("--font", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    info = compose_wordmark(args.painting, args.font, args.output)
    print("WORDMARK_RESULT " + json.dumps(info))


if __name__ == "__main__":
    main()
