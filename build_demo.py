#!/usr/bin/env python3
"""Build assets/demo.gif for TTNAN/animal-vision.

Base: one AI-generated photorealistic living-room photo (1920x1200),
drawn once and reused for all five views. Only colour / sharpness /
brightness transforms differ per species, so the comparison is honest:
same room, same camera, different eyes.

Transforms (subtle, not a harsh filter):
- Human: base as-is.
- Dog (dichromat, cones ~429 & 555 nm): Machado/Brettel-style
  red-green collapse matrix + light blur (acuity ~20/75).
- Cat (dichromat, rod-rich): desaturate, blur, brighten (night vision).
- Bee (trichromat UV/blue/green, no red): red suppressed, blue/green
  kept, plus a drawn UV nectar-guide pattern on the flowers, labelled
  as an illustrative approximation (a screen cannot emit true UV).
- Eagle (tetrachromat, very high acuity): unsharp mask + contrast,
  distant book spines sharpen.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "assets", "media-generation-living-room-base-0-c263b27b-400e-4aaa-b271-8190aa5b2b35.png")
OUT = os.path.join(ROOT, "assets", "demo.gif")
FRAMES_DIR = os.path.join(ROOT, "check", "frames")
os.makedirs(FRAMES_DIR, exist_ok=True)

W, H = 960, 680
PHOTO_H = 600  # photo occupies the top 600 px; the caption bar below never covers it
FONT_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FONT_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
FONT_EN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def to_np(img):
    return np.asarray(img.convert("RGB")).astype(np.float32)


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")


def apply_matrix(arr, m):
    return arr @ np.asarray(m, dtype=np.float32).T


def desaturate(arr, keep):
    gray = arr.mean(axis=2, keepdims=True)
    return gray + (arr - gray) * keep


def srgb_to_linear(arr):
    a = arr / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(arr):
    return np.where(arr <= 0.0031308, arr * 12.92,
                    1.055 * np.power(np.clip(arr, 0, None), 1 / 2.4) - 0.055) * 255.0


def apply_matrix_linear(img, m):
    """Apply a colour matrix in linear light and restore each pixel's
    original luminance, so the result changes hue, not brightness.
    Without this, dichromat matrices applied in gamma space turn a
    dark-green rug nearly black and wash the whole room yellow."""
    arr = to_np(img)  # device RGB (float, not numpy int)
    lin = srgb_to_linear(arr)
    sim = lin @ np.asarray(m, dtype=np.float32).T
    y_orig = (lin * [0.2126, 0.7152, 0.0722]).sum(axis=2, keepdims=True)
    y_sim = (sim * [0.2126, 0.7152, 0.0722]).sum(axis=2, keepdims=True)
    scale = np.where(y_sim > 1e-4, y_orig / np.maximum(y_sim, 1e-4), 1.0)
    return to_img(linear_to_srgb(np.clip(sim * scale, 0, 1)))


# Dichromat matrix (Machado/Brettel-style): red-green axis collapses,
# blue-yellow survives. Dogs and cats share this cone layout
# (S ~429-450 nm, M ~555 nm); cats add lower acuity and rod vision.
DICHROMAT = [[0.625, 0.375, 0.0],
             [0.700, 0.300, 0.0],
             [0.000, 0.300, 0.700]]


# --- species transforms -------------------------------------------------
def dog_view(base):
    img = apply_matrix_linear(base, DICHROMAT)
    img = img.filter(ImageFilter.GaussianBlur(0.9))
    return ImageEnhance.Contrast(img).enhance(0.99)


def cat_view(base):
    img = apply_matrix_linear(base, DICHROMAT)
    img = to_img(desaturate(to_np(img), 0.80))
    img = img.filter(ImageFilter.GaussianBlur(1.5))
    img = ImageEnhance.Brightness(img).enhance(1.10)
    img = ImageEnhance.Color(img).enhance(0.95)
    return img


def bee_view(base):
    # No red cone: red collapses to dark; blue/green stay. Same
    # linear + luminance-preserving treatment, then only a faint
    # cool shift — no blue wash over the whole room.
    m = [[0.20, 0.30, 0.30],
         [0.05, 0.90, 0.10],
         [0.10, 0.30, 0.90]]
    img = apply_matrix_linear(base, m)
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    img = ImageEnhance.Color(img).enhance(1.03)
    arr = to_np(img)
    arr[:, :, 2] = np.clip(arr[:, :, 2] * 1.03, 0, 255)
    img = to_img(arr)
    # UV nectar guides, drawn small and only inside individual flower
    # heads: pink rose (442, 318), white bloom (412, 300), orange
    # bloom (470, 298). Thin dark-violet radials + a dark centre dot,
    # so the bouquet stays a bouquet.
    import math
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for cx, cy, r in [(442, 318, 20), (412, 300, 15), (470, 298, 15)]:
        for k in range(6):
            a = math.pi * k / 3
            d.line([(cx, cy), (cx + r * math.cos(a), cy + r * math.sin(a) * 0.85)],
                   fill=(64, 24, 130, 95), width=2)
        d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(64, 24, 130, 120))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img


def eagle_view(base):
    img = base.filter(ImageFilter.UnsharpMask(radius=2, percent=110, threshold=2))
    img = ImageEnhance.Contrast(img).enhance(1.08)
    img = ImageEnhance.Color(img).enhance(1.05)
    img = ImageEnhance.Sharpness(img).enhance(1.15)
    return img


VIEWS = [
    ("human", "人", "Human", "我们看到的世界：红绿分明，远近都清晰",
     "Our world: reds and greens apart, near and far in focus", lambda b: b.copy()),
    ("dog", "狗", "Dog", "红绿分不清了，红球只剩明暗差别",
     "Red and green merge; the ball survives only as brightness", dog_view),
    ("cat", "猫", "Cat", "颜色变淡、画面变糊，但暗处反而更亮",
     "Colours fade and soften, yet the dark grows brighter", cat_view),
    ("bee", "蜜蜂", "Bee", "花心出现紫外线蜜导图案（近似示意）",
     "UV nectar guides appear on the flowers (illustrative approximation)", bee_view),
    ("eagle", "鹰", "Eagle", "远处书脊更清晰，细节一下子放大",
     "Distant book spines sharpen; detail leaps out", eagle_view),
]


def add_labels(img, cn, en, cap_cn, cap_en):
    img = img.copy()
    d = ImageDraw.Draw(img, "RGBA")
    # top-right pill: 人 · Human
    label = f"{cn} · {en}"
    f_label = font(FONT_BOLD, 30)
    tw = d.textlength(label, font=f_label)
    pad_x, pad_y = 18, 10
    x0, y0 = W - int(tw) - pad_x * 2 - 16, 16
    x1, y1 = W - 16, 16 + 30 + pad_y * 2
    d.rounded_rectangle([x0, y0, x1, y1], radius=22, fill=(0, 0, 0, 165))
    d.text((x0 + pad_x, y0 + pad_y - 2), label, font=f_label, fill=(255, 255, 255, 255))
    # caption bar BELOW the photo (H - 80 .. H), never covering the room
    bar_h = 80
    d.rectangle([0, H - bar_h, W, H], fill=(18, 18, 18, 255))
    f_cn = font(FONT_BOLD, 25)
    f_en = font(FONT_REG, 17)
    d.text((24, H - bar_h + 8), cap_cn, font=f_cn, fill=(255, 255, 255, 255))
    d.text((24, H - bar_h + 44), cap_en, font=f_en, fill=(225, 225, 225, 255))
    return img


def main():
    photo = Image.open(SRC).convert("RGB").resize((W, PHOTO_H), Image.LANCZOS)
    photo.save(os.path.join(ROOT, "assets", "living-room-base.png"))
    base = Image.new("RGB", (W, H), (18, 18, 18))
    base.paste(photo, (0, 0))
    frames = []
    for key, cn, en, cap_cn, cap_en, fn in VIEWS:
        frame = add_labels(fn(base), cn, en, cap_cn, cap_en)
        frame.save(os.path.join(FRAMES_DIR, f"{key}.png"))
        frames.append(frame)
        print("frame:", key, frame.size)

    # Quantise to a shared-ish palette per frame; GIF, 1.2 s per frame.
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=256) for f in frames]
    pal[0].save(OUT, save_all=True, append_images=pal[1:],
                duration=1200, loop=0, optimize=True)
    size = os.path.getsize(OUT)
    print(f"GIF: {OUT}  {size/1024:.0f} KB  ({size/1024/1024:.2f} MB)")


if __name__ == "__main__":
    main()
