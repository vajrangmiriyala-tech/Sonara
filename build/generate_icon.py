# Generates Sonara's app icon (build/icon.png).
# Run: python3 build/generate_icon.py  (needs Pillow: pip3 install pillow)
# Design: white beamed-notes glyph on an ember gradient rounded square.
# The glyph comes from a real font (DejaVu Sans Bold); on the macOS
# build runner it falls back to any font carrying U+266B.
from PIL import Image, ImageDraw, ImageFont

S = 1024
W = (255, 255, 255, 255)

# Ember gradient rounded square
top = (255, 122, 69)
bot = (235, 84, 38)
bg = Image.new("RGBA", (S, S))
bd = ImageDraw.Draw(bg)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
    bd.line([(0, y), (S, y)], fill=c)
mask = Image.new("L", (S, S), (0,))
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=230, fill=255)
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(bg, (0, 0), mask)


def find_font():
    import subprocess

    out = subprocess.run(
        ["fc-list", ":charset=266B", "file"], capture_output=True, text=True
    )
    files = sorted(
        set(l.split(":")[0].strip() for l in out.stdout.splitlines() if l.strip())
    )
    for f in files:
        if "Bold" in f and f.endswith(".ttf"):
            return f
    return files[0] if files else None


font_path = find_font()
if not font_path:
    raise SystemExit("no font with the beamed-notes glyph (U+266B) found")
font = ImageFont.truetype(font_path, 560)
glyph = "\u266b"  # beamed eighth notes
probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
bbox = probe.textbbox((0, 0), glyph, font=font)
gw, gh = bbox[2] - bbox[0], bbox[3] - bbox[1]
gx, gy = (S - gw) // 2 - bbox[0], (S - gh) // 2 - bbox[1]

layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(layer).text((gx, gy), glyph, font=font, fill=W)
img = Image.alpha_composite(img, layer)
img.save("build/icon.png")
print("icon.png generated with", font_path)
