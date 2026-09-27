import math
import os
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


W, H, FPS, DURATION = 1280, 720, 24, 15
ROOT = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent / "mailflare-motion.mp4"
BLUE = (38, 112, 246)
NAVY = (9, 25, 55)
INK = (17, 34, 62)
PALE = (244, 248, 255)
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def f(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def clamp(x):
    return max(0.0, min(1.0, x))


def ease(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def phase(t, start, end):
    return ease((t - start) / (end - start))


def alpha(t, start, end, fade=0.28):
    return smooth((t - start) / fade) * (1 - smooth((t - end + fade) / fade))


def mix(a, b, p):
    return a + (b - a) * p


def rgba(color, a=255):
    return (*color, int(255 * clamp(a)))


def text(draw, xy, message, size, color, bold=False, anchor=None, spacing=0):
    draw.text(xy, message, font=f(size, bold), fill=color, anchor=anchor, spacing=spacing)


def round_box(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(tuple(int(v) for v in box), radius=int(radius), fill=fill, outline=outline, width=width)


def shadow_card(size, radius=28, blur=28, opacity=52):
    layer = Image.new("RGBA", (size[0] + blur * 4, size[1] + blur * 4))
    d = ImageDraw.Draw(layer)
    b = blur * 2
    d.rounded_rectangle((b, b, b + size[0], b + size[1]), radius, fill=(15, 42, 90, opacity))
    return layer.filter(ImageFilter.GaussianBlur(blur))


def glow(img, xy, radius, color, strength=130):
    layer = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(layer)
    x, y = xy
    d.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, strength))
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius * 0.85)))


def envelope(draw, cx, cy, scale, color=BLUE, open_amount=0):
    w, h = 88 * scale, 60 * scale
    x, y = cx - w / 2, cy - h / 2
    draw.rounded_rectangle((x, y, x + w, y + h), 9 * scale, fill=color)
    draw.polygon([(x + 4 * scale, y + 5 * scale), (cx, y + 34 * scale), (x + w - 4 * scale, y + 5 * scale)], fill=(221, 244, 255))
    draw.polygon([(x + 4 * scale, y + h - 5 * scale), (cx, y + 29 * scale), (x + w - 4 * scale, y + h - 5 * scale)], fill=(15, 167, 224))
    if open_amount:
        draw.polygon([(x + 4 * scale, y + 5 * scale), (cx, y - 23 * scale * open_amount), (x + w - 4 * scale, y + 5 * scale)], fill=(239, 252, 255))


def base_dark():
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        p = y / H
        d.line((0, y, W, y), fill=(int(8 + p * 3), int(20 + p * 17), int(49 + p * 29), 255))
    return im


def base_light():
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        p = y / H
        d.line((0, y, W, y), fill=(int(248 - 6 * p), int(251 - 5 * p), 255, 255))
    return im


def draw_brand(draw, x, y, size=28, dark=False):
    envelope(draw, x + size / 2, y + size / 2, size / 88)
    text(draw, (x + size + 12, y + size / 2), "mailflare", int(size * 0.72), (255, 255, 255) if dark else INK, True, "lm")


def draw_ui(t):
    im = Image.new("RGBA", (936, 532), (255, 255, 255, 255))
    d = ImageDraw.Draw(im)
    round_box(d, (0, 0, 935, 531), 24, (255, 255, 255), (219, 230, 246), 2)
    round_box(d, (0, 0, 935, 53), 24, (247, 250, 255))
    d.rectangle((0, 30, 935, 53), fill=(247, 250, 255))
    d.line((0, 53, 935, 53), fill=(229, 235, 245), width=1)
    for i, c in enumerate(((255, 111, 111), (255, 192, 86), (66, 207, 128))):
        d.ellipse((21 + i * 18, 20, 30 + i * 18, 29), fill=c)
    text(d, (468, 28), "mailflare  /  inbox", 14, (117, 133, 159), True, "mm")
    d.rectangle((0, 54, 187, 531), fill=(247, 249, 254))
    draw_brand(d, 19, 75, 25)
    round_box(d, (20, 126, 163, 169), 18, (220, 234, 255))
    text(d, (48, 147), "+   Compose", 15, (29, 81, 161), True, "lm")
    nav = [("Inbox", "18"), ("Starred", ""), ("Snoozed", ""), ("Sent", ""), ("Drafts", "4")]
    for i, (label, count) in enumerate(nav):
        yy = 196 + i * 46
        if i == 0:
            round_box(d, (12, yy - 17, 176, yy + 19), 15, (225, 237, 255))
        d.ellipse((30, yy - 4, 38, yy + 4), fill=BLUE if i == 0 else (157, 169, 189))
        text(d, (50, yy), label, 15, (26, 52, 92) if i == 0 else (107, 121, 145), i == 0, "lm")
        if count:
            text(d, (151, yy), count, 13, BLUE, True, "mm")
    round_box(d, (211, 75, 902, 122), 22, (238, 244, 253))
    d.ellipse((232, 90, 248, 106), outline=(107, 132, 170), width=2)
    d.line((246, 104, 253, 111), fill=(107, 132, 170), width=2)
    text(d, (266, 98), "Search mail", 15, (132, 149, 174), False, "lm")
    text(d, (221, 153), "Priority inbox", 24, INK, True, "lm")
    text(d, (878, 153), "1–4 of 18", 12, (132, 149, 174), False, "rm")
    messages = [
        ("M", "Maya Chen", "Product launch tomorrow", "Can we share the final update?", "9:41 AM"),
        ("N", "Northline", "Your domain is connected", "Mail is ready for hello@northline.dev", "8:52 AM"),
        ("T", "Theo Park", "One more thing", "Thanks for the thoughtful note!", "Yesterday"),
        ("S", "Studio Notes", "A fresh start for Monday", "Ideas worth opening.", "Mon"),
    ]
    for i, (initial, sender, subject, preview, time) in enumerate(messages):
        yy = 188 + i * 82
        if i == 0 and t > 3.65:
            round_box(d, (201, yy - 1, 925, yy + 79), 14, (237, 245, 255))
        d.line((203, yy + 79, 925, yy + 79), fill=(236, 240, 247))
        d.ellipse((221, yy + 14, 259, yy + 52), fill=[(124, 157, 239), (75, 199, 221), (232, 172, 111), (174, 145, 230)][i])
        text(d, (240, yy + 33), initial, 15, (255, 255, 255), True, "mm")
        text(d, (273, yy + 15), sender, 16, INK, True)
        text(d, (273, yy + 39), subject, 14, (50, 65, 90), True)
        text(d, (273, yy + 60), preview, 12, (143, 156, 177))
        text(d, (882, yy + 17), time, 12, (130, 145, 166), False, "ra")
        if i == 0:
            d.ellipse((903, yy + 43, 912, yy + 52), fill=BLUE)
    return im


def feature_card(im, box, title, sub, symbol, amount):
    x, y, w, h = box
    lift = 24 * (1 - ease(amount))
    y += lift
    d = ImageDraw.Draw(im)
    round_box(d, (x, y, x + w, y + h), 26, rgba((255, 255, 255), amount), rgba((161, 196, 251), amount * 0.45), 2)
    round_box(d, (x + 20, y + 20, x + 68, y + 68), 14, rgba((222, 237, 255), amount))
    text(d, (x + 44, y + 45), symbol, 25, rgba(BLUE, amount), True, "mm")
    text(d, (x + 20, y + 94), title, 19, rgba(INK, amount), True)
    text(d, (x + 20, y + 124), sub, 13, rgba((113, 135, 166), amount))


def render_frame(t, dark, light, ui, logo):
    if t < 2.65:
        im = dark.copy()
        d = ImageDraw.Draw(im)
        glow(im, (920, 210), 240, (33, 105, 240), 100)
        glow(im, (180, 660), 180, (15, 184, 219), 65)
        d = ImageDraw.Draw(im)
        for i in range(18):
            x = (i * 139 + t * (34 + i % 4 * 13)) % (W + 100) - 50
            y = (i * 107 + math.sin(t * 1.8 + i) * 13) % H
            d.ellipse((x, y, x + 2, y + 2), fill=(98, 166, 251, 80))
        p = phase(t, 0.08, 0.72)
        x = mix(1400, 880, p)
        y = mix(-90, 335, p) + math.sin(t * 3.3) * 7
        d.ellipse((x - 152, y - 152, x + 152, y + 152), outline=(65, 141, 241, 95), width=2)
        d.ellipse((x - 112, y - 112, x + 112, y + 112), outline=(65, 141, 241, 75), width=2)
        envelope(d, x, y, 2.25, (28, 146, 232), phase(t, 0.65, 1.15))
        for k in range(3):
            xx = x + 170 + k * 35 + (1 - p) * 180
            d.line((xx, y - 30 + k * 30, xx + 75, y - 30 + k * 30), fill=(39, 141, 252, int(140 * p)), width=3)
        text(d, (85 - 60 * (1 - phase(t, 0.1, 0.5)), 128), "INTRODUCING MAILFLARE", 17, (108, 185, 255), True)
        reveal = int(len("Email, with momentum.") * phase(t, 0.25, 1.48))
        text(d, (80, 204), "Email, with", 69, (255, 255, 255), True)
        text(d, (80, 292), "momentum."[:max(0, reveal - 12)], 74, (91, 177, 255), True)
        line_p = phase(t, 1.23, 1.8)
        d.rounded_rectangle((83, 403, 83 + 550 * line_p, 408), radius=2, fill=(79, 173, 254))
        text(d, (85, 450), "A familiar inbox. A more capable workflow.", 24, (174, 199, 230))
        if t > 2.25:
            im = crossfade(im, light, phase(t, 2.25, 2.65))
        return im

    if t < 5.65:
        im = light.copy()
        d = ImageDraw.Draw(im)
        draw_brand(d, 57, 36, 33)
        text(d, (1222, 56), "THE INBOX", 13, BLUE, True, "rm")
        text(d, (640, 114), "Feels like home.", 48, INK, True, "mm")
        text(d, (640, 160), "Everything in its place. Every message in reach.", 20, (109, 133, 164), False, "mm")
        p = phase(t, 2.66, 3.25)
        s = mix(0.89, 1.0, p)
        panel = ui.resize((int(ui.width * s), int(ui.height * s)), Image.Resampling.LANCZOS)
        px = int((W - panel.width) / 2)
        py = int(206 + 72 * (1 - p))
        sh = shadow_card((panel.width, panel.height), 25, 25, 50)
        im.alpha_composite(sh, (px - 50, py - 43))
        im.alpha_composite(panel, (px, py))
        d = ImageDraw.Draw(im)
        if t > 4.35:
            q = phase(t, 4.35, 4.85)
            x = 945 + 180 * (1 - q)
            y = 548
            round_box(d, (x, y, x + 264, y + 71), 20, (37, 112, 246))
            text(d, (x + 22, y + 24), "✦  Mail, organized", 19, (255, 255, 255), True)
            text(d, (x + 22, y + 49), "Search · stars · snooze", 12, (219, 235, 255))
        return im

    if t < 9.25:
        im = light.copy()
        d = ImageDraw.Draw(im)
        draw_brand(d, 57, 36, 33)
        text(d, (1222, 56), "PEOPLE + AGENTS", 13, BLUE, True, "rm")
        text(d, (640, 116), "Human touch. Agent speed.", 47, INK, True, "mm")
        text(d, (640, 158), "A thoughtful reply starts here.", 19, (108, 133, 164), False, "mm")
        p = phase(t, 5.7, 6.22)
        y = 226 + 50 * (1 - p)
        sh = shadow_card((475, 350), 30, 26, 43)
        im.alpha_composite(sh, (55, int(y) - 45))
        round_box(d, (110, y, 585, y + 350), 29, (255, 255, 255), (224, 233, 246), 2)
        d.ellipse((138, y + 31, 184, y + 77), fill=(122, 155, 239))
        text(d, (161, y + 54), "M", 19, (255, 255, 255), True, "mm")
        text(d, (198, y + 32), "Maya Chen", 19, INK, True)
        text(d, (198, y + 57), "To: hello@northline.dev", 13, (132, 151, 178))
        d.line((139, y + 97, 551, y + 97), fill=(228, 235, 245), width=2)
        text(d, (140, y + 128), "Product launch tomorrow", 23, INK, True)
        text(d, (140, y + 179), "Hi team, can we share the final", 17, (76, 96, 126))
        text(d, (140, y + 208), "update with everyone tomorrow?", 17, (76, 96, 126))
        text(d, (140, y + 251), "Thanks, Maya", 17, (76, 96, 126))
        d.line((570, y + 170, 685, y + 170), fill=(66, 142, 252), width=4)
        d.polygon([(685, y + 170), (674, y + 162), (674, y + 178)], fill=(66, 142, 252))
        ap = phase(t, 6.45, 7.0)
        ax = 695 + 90 * (1 - ap)
        round_box(d, (ax, y, ax + 475, y + 350), 29, (255, 255, 255), (207, 225, 249), 2)
        round_box(d, (ax + 24, y + 24, ax + 78, y + 78), 16, (225, 237, 255))
        text(d, (ax + 51, y + 51), "✦", 28, BLUE, True, "mm")
        text(d, (ax + 93, y + 33), "Mailflare assistant", 18, INK, True)
        text(d, (ax + 93, y + 59), "Working with your inbox", 13, (126, 147, 176))
        d.line((ax + 24, y + 99, ax + 450, y + 99), fill=(230, 238, 249), width=2)
        text(d, (ax + 27, y + 125), "Draft a warm reply to Maya", 18, (53, 78, 113), True)
        q = phase(t, 7.06, 7.62)
        round_box(d, (ax + 24, y + 168, ax + 450, y + 276), 18, (239, 246, 255))
        text(d, (ax + 45, y + 191), "DRAFT READY", 12, BLUE, True)
        text(d, (ax + 45, y + 221), "Absolutely, Maya — the update", 17, INK)
        text(d, (ax + 45, y + 247), "is ready to share tomorrow…", 17, INK)
        if q > 0:
            round_box(d, (ax + 24, y + 292, ax + 249, y + 329), 17, rgba(BLUE, q))
            text(d, (ax + 136, y + 311), "Review to send  →", 15, rgba((255, 255, 255), q), True, "mm")
            if t > 8.08:
                ring = (t - 8.08) * 80
                d.ellipse((ax + 136 - ring, y + 311 - ring, ax + 136 + ring, y + 311 + ring), outline=(38, 112, 246, max(0, int(145 - ring * 2))), width=3)
        text(d, (640, 643), "The agent prepares. You approve.", 20, (84, 111, 148), True, "mm")
        if t > 8.95:
            im = crossfade(im, dark, phase(t, 8.95, 9.25))
        return im

    if t < 12.3:
        im = dark.copy()
        glow(im, (662, 330), 210, (23, 99, 246), 72)
        d = ImageDraw.Draw(im)
        draw_brand(d, 57, 36, 33, True)
        text(d, (1222, 56), "YOUR WORKFLOW", 13, (107, 179, 255), True, "rm")
        text(d, (640, 130), "One home for every address.", 47, (255, 255, 255), True, "mm")
        text(d, (640, 177), "Built around your domain. Ready for your tools.", 19, (164, 191, 226), False, "mm")
        pp = [phase(t, 9.5 + i * 0.17, 10.07 + i * 0.17) for i in range(4)]
        positions = [(114, 280), (383, 318), (652, 280), (921, 318)]
        cards = [
            ("Custom domains", "Your identity, everywhere", "@"),
            ("Smart routing", "Mail lands where it should", "↗"),
            ("API + webhooks", "Connect your stack", "⌘"),
            ("Agent access", "MCP-ready workflows", "✦"),
        ]
        for i, (x, y) in enumerate(positions):
            feature_card(im, (x, y, 245, 205), *cards[i], pp[i])
        d = ImageDraw.Draw(im)
        p = phase(t, 11.35, 11.8)
        round_box(d, (418, 599, 862, 645), 22, rgba((30, 75, 139), p))
        text(d, (640, 622), "Self-hosted • Cloudflare-powered", 17, rgba((194, 223, 252), p), True, "mm")
        if t > 12.0:
            blue = Image.new("RGBA", (W, H), (29, 103, 236, 255))
            im = crossfade(im, blue, phase(t, 12.0, 12.3))
        return im

    im = Image.new("RGBA", (W, H), (29, 103, 236, 255))
    glow(im, (640, 330), 245, (90, 184, 255), 50)
    d = ImageDraw.Draw(im)
    for i in range(28):
        a = i * 2 * math.pi / 28 + t * 0.18
        r = 320 + 13 * math.sin(t * 2 + i)
        x = 640 + math.cos(a) * r
        y = 333 + math.sin(a) * r
        d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(135, 202, 255, 92))
    p = phase(t, 12.42, 13.03)
    scale = mix(0.72, 1.0, p) + 0.018 * math.sin(t * 3)
    icon = logo.resize((int(120 * scale), int(120 * scale)), Image.Resampling.LANCZOS)
    im.alpha_composite(icon, (int(640 - icon.width / 2), int(187 - icon.height / 2)))
    d = ImageDraw.Draw(im)
    text(d, (640, 322 + 38 * (1 - p)), "mailflare", 81, (255, 255, 255), True, "mm")
    q = phase(t, 13.1, 13.75)
    text(d, (640, 416), "Email for humans + agents.", 27, rgba((225, 241, 255), q), False, "mm")
    d.rounded_rectangle((640 - 88 * q, 470, 640 + 88 * q, 474), radius=2, fill=rgba((170, 227, 255), q))
    text(d, (640, 526), "YOUR MAIL. YOUR MOMENTUM.", 15, rgba((202, 231, 255), phase(t, 13.7, 14.25)), True, "mm")
    return im


def crossfade(a, b, p):
    return Image.blend(a, b, clamp(p))


def make_audio(path):
    rate = 44100
    beats = (0.14, 0.72, 1.34, 2.65, 3.45, 4.38, 5.68, 6.54, 7.45, 8.12, 9.26, 9.78, 10.26, 10.75, 11.25, 12.34, 13.15)
    with wave.open(path, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        chunk = bytearray()
        for i in range(rate * DURATION):
            t = i / rate
            section = 0.5 + 0.5 * math.sin(t * math.pi / DURATION)
            pad = (math.sin(2 * math.pi * 110 * t) + 0.53 * math.sin(2 * math.pi * 164.81 * t) + 0.31 * math.sin(2 * math.pi * 220 * t)) * 0.035 * section
            rhythm = 0.0
            for b in beats:
                dt = t - b
                if 0 <= dt < 0.28:
                    rhythm += math.sin(2 * math.pi * (108 - 55 * dt) * dt) * math.exp(-24 * dt) * 0.18
                if 0 <= dt < 0.10:
                    rhythm += math.sin(2 * math.pi * 920 * dt) * math.exp(-48 * dt) * 0.024
            shimmer = math.sin(2 * math.pi * 440 * t) * math.sin(2 * math.pi * 0.7 * t) * 0.009
            sample = max(-1, min(1, pad + rhythm + shimmer))
            chunk += struct.pack("<h", int(sample * 32767))
            if len(chunk) > 65536:
                wav.writeframes(chunk)
                chunk.clear()
        if chunk:
            wav.writeframes(chunk)


def render_video():
    dark, light = base_dark(), base_light()
    ui = draw_ui(4.0)
    logo = Image.open(ROOT / "public/icon-96.png").convert("RGBA")
    with tempfile.TemporaryDirectory() as tmp:
        silent = os.path.join(tmp, "silent.mp4")
        audio = os.path.join(tmp, "sound.wav")
        encoder = subprocess.Popen([
            "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264",
            "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent
        ], stdin=subprocess.PIPE)
        for n in range(FPS * DURATION):
            frame = render_frame(n / FPS, dark, light, ui, logo).convert("RGB")
            encoder.stdin.write(frame.tobytes())
        encoder.stdin.close()
        encoder.wait()
        make_audio(audio)
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", audio,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", str(DURATION),
            "-movflags", "+faststart", str(OUT)
        ], check=True)
    print(OUT)
