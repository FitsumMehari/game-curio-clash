#!/usr/bin/env python3
"""Generate Curio Clash Android launcher icons + splash art."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android/app/src/main/res"
PUBLIC = ROOT / "public"

INK = (12, 20, 18, 255)  # #0c1412
BRASS = (212, 163, 92, 255)  # #d4a35c
PARCHMENT = (232, 215, 176, 255)  # #e8d7b0
TRANSPARENT = (0, 0, 0, 0)


def draw_mark(size: int, *, pad_ratio: float = 0.18, bg: tuple | None = INK) -> Image.Image:
  img = Image.new("RGBA", (size, size), bg if bg else TRANSPARENT)
  d = ImageDraw.Draw(img)
  pad = size * pad_ratio
  # Seal plate
  inset = pad * 0.35
  d.rounded_rectangle(
    [inset, inset, size - inset, size - inset],
    radius=size * 0.22,
    fill=(18, 32, 28, 255) if bg else (18, 32, 28, 230),
    outline=BRASS,
    width=max(2, size // 48),
  )
  # Orb / lens
  cx = cy = size / 2
  r = size * 0.18
  d.ellipse([cx - r, cy - r - size * 0.06, cx + r, cy + r - size * 0.06], outline=PARCHMENT, width=max(2, size // 42))
  # Crosshair
  arm = r * 0.55
  oy = cy - size * 0.06
  w = max(2, size // 64)
  d.line([cx - arm, oy, cx + arm, oy], fill=BRASS, width=w)
  d.line([cx, oy - arm, cx, oy + arm], fill=BRASS, width=w)
  # Sweep arc (auction / sonar)
  bbox = [cx - r * 1.55, cy - r * 0.2, cx + r * 1.55, cy + r * 2.1]
  d.arc(bbox, start=200, end=340, fill=BRASS, width=max(2, size // 40))
  return img


def save_png(img: Image.Image, path: Path) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  img.save(path, "PNG")


def main() -> None:
  master = draw_mark(1024, pad_ratio=0.08, bg=INK)
  save_png(master, PUBLIC / "app-icon-1024.png")
  save_png(master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / "app-icon-512.png")
  save_png(draw_mark(192, pad_ratio=0.1, bg=INK), PUBLIC / "apple-touch-icon.png")

  # Adaptive foreground: transparent canvas, logo in safe zone
  fg = draw_mark(1024, pad_ratio=0.22, bg=None)
  densities = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
  }
  for name, (legacy, fore) in densities.items():
    folder = RES / f"mipmap-{name}"
    save_png(master.resize((legacy, legacy), Image.Resampling.LANCZOS), folder / "ic_launcher.png")
    # round: same art (Android masks)
    save_png(master.resize((legacy, legacy), Image.Resampling.LANCZOS), folder / "ic_launcher_round.png")
    save_png(fg.resize((fore, fore), Image.Resampling.LANCZOS), folder / "ic_launcher_foreground.png")

  # Splash screens — dark field + centered mark
  splash_sizes = {
    "drawable": (480, 800),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (1080, 1920),
    "drawable-port-xxxhdpi": (1440, 2560),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1920, 1080),
    "drawable-land-xxxhdpi": (2560, 1440),
  }
  mark1024 = draw_mark(1024, pad_ratio=0.12, bg=INK)
  for folder, (w, h) in splash_sizes.items():
    canvas = Image.new("RGBA", (w, h), INK)
    side = int(min(w, h) * 0.42)
    logo = mark1024.resize((side, side), Image.Resampling.LANCZOS)
    canvas.paste(logo, ((w - side) // 2, (h - side) // 2), logo)
    save_png(canvas, RES / folder / "splash.png")

  print("Generated launcher icons + splash assets")


if __name__ == "__main__":
  main()
