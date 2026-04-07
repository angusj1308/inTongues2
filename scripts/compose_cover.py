import argparse
import os
from PIL import Image, ImageDraw, ImageFont

COVER_W = 1600
COVER_H = 2400
PAINTING_H = 1580
BAND_H = 160
PANEL_H = 660
BAND_TOP = PAINTING_H
PANEL_TOP = PAINTING_H + BAND_H

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(SCRIPT_DIR, "fonts")
FONT_BRAND = os.path.join(FONTS_DIR, "Lora-Variable.ttf")
FONT_TITLE = os.path.join(FONTS_DIR, "Lora-Variable.ttf")
FONT_LEVEL = os.path.join(FONTS_DIR, "texgyreheros-regular.otf")

BRAND_SIZE = 64
TITLE_SIZE = 130
LEVEL_SIZE = 38

WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
LINE_COLOUR = (170, 31, 35)


def compose_cover(painting_path, title, level, output_path):
    painting = Image.open(painting_path).convert("RGB")
    painting = painting.resize((COVER_W, PAINTING_H), Image.LANCZOS)

    cover = Image.new("RGB", (COVER_W, COVER_H), BLACK)
    cover.paste(painting, (0, 0))

    draw = ImageDraw.Draw(cover)
    draw.rectangle([(0, BAND_TOP), (COVER_W, BAND_TOP + BAND_H)], fill=WHITE)

    font_brand = ImageFont.truetype(FONT_BRAND, BRAND_SIZE)
    try:
        font_brand.set_variation_by_name("Medium")
    except Exception:
        pass

    font_title = ImageFont.truetype(FONT_TITLE, TITLE_SIZE)
    font_level = ImageFont.truetype(FONT_LEVEL, LEVEL_SIZE)

    # Brand
    draw.text((COVER_W // 2, BAND_TOP + BAND_H // 2), "inTongues.", fill=BLACK, font=font_brand, anchor="mm")

    # Measure title (title case, sans)
    title_bbox = draw.textbbox((0, 0), title, font=font_title)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]

    # Measure level (letter-spaced caps, sans)
    level_upper = level.upper()
    spacing = 8
    total_level_w = sum(
        draw.textbbox((0, 0), c, font=font_level)[2]
        - draw.textbbox((0, 0), c, font=font_level)[0]
        + spacing
        for c in level_upper
    ) - spacing
    level_h = draw.textbbox((0, 0), level_upper, font=font_level)[3] - draw.textbbox((0, 0), level_upper, font=font_level)[1]

    gap_above_line = 90
    gap_below_line = 60
    text_block_h = title_h + gap_above_line + 1 + gap_below_line + level_h
    block_top = PANEL_TOP + (PANEL_H - text_block_h) // 2 - 30

    # Title (title case, sans)
    title_x = (COVER_W - title_w) // 2
    title_y = block_top
    draw.text((title_x, title_y), title, fill=WHITE, font=font_title)

    # Line
    line_y = block_top + title_h + gap_above_line
    line_half_w = max(title_w, total_level_w) // 2 + 30
    line_cx = COVER_W // 2
    draw.line([(line_cx - line_half_w, line_y), (line_cx + line_half_w, line_y)], fill=LINE_COLOUR, width=3)

    # Level (letter-spaced caps, sans)
    level_x = (COVER_W - total_level_w) // 2
    level_y = line_y + gap_below_line
    for c in level_upper:
        draw.text((level_x, level_y), c, fill=WHITE, font=font_level)
        c_w = draw.textbbox((0, 0), c, font=font_level)[2] - draw.textbbox((0, 0), c, font=font_level)[0]
        level_x += c_w + spacing

    cover.save(output_path, quality=95)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--painting", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--level", required=True)
    parser.add_argument("--output", default="cover.png")
    args = parser.parse_args()
    compose_cover(args.painting, args.title, args.level, args.output)
