"""Draw the toolbar icons: a light crescent moon on a dark rounded square.

Run from the repo root: python3 scripts/make-icons.py  (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
SCALE = 8  # draw large, then downsample for smooth edges


def icon(size: int) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((0, 0, s - 1, s - 1), radius=s * 0.24, fill="#1d1d24")

    disc = Image.new("L", (s, s), 0)
    ImageDraw.Draw(disc).ellipse((s * 0.2, s * 0.2, s * 0.8, s * 0.8), fill=255)
    bite = Image.new("L", (s, s), 0)
    ImageDraw.Draw(bite).ellipse((s * 0.36, s * 0.1, s * 0.92, s * 0.66), fill=255)
    moon = ImageChops.subtract(disc, bite)

    img.paste(Image.new("RGBA", (s, s), "#f1f1f6"), mask=moon)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    icon(size).save(OUT / f"{size}.png")
    print(f"wrote {OUT / f'{size}.png'}")
