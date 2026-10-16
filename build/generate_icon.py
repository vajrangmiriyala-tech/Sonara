# Generates Sonara's app icon (build/icon.png).
# Run: python3 build/generate_icon.py  (needs Pillow: pip3 install pillow)
# Design: white beamed double-note on an ember gradient rounded square.
from PIL import Image, ImageDraw

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
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=230, fill=255)
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
img.paste(bg, (0, 0), mask)


def tilted_head(cx, cy, w, h, angle):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(
        [cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], fill=W
    )
    return layer.rotate(angle, resample=Image.BICUBIC, center=(cx, cy))


# Beamed double note, Apple-Music-style but in Sonara ember
note = Image.new("RGBA", (S, S), (0, 0, 0, 0))
note = Image.alpha_composite(note, tilted_head(380, 700, 250, 175, -20))
note = Image.alpha_composite(note, tilted_head(660, 700, 250, 175, -20))
n = ImageDraw.Draw(note)
n.rectangle([452, 300, 508, 660], fill=W)   # left stem
n.rectangle([732, 300, 788, 660], fill=W)   # right stem
n.polygon([(452, 270), (788, 320), (788, 420), (452, 370)], fill=W)  # beam

img = Image.alpha_composite(img, note)
img.save("build/icon.png")
print("icon.png generated")
