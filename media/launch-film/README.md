# Mailflare — Make it yours

15 seconds · 1920 × 1080 · 60 fps · stereo

## Creative direction

A friendly pearl-and-cobalt robot introduces a world of professional email. Large kinetic typography leads into a layered inbox, expands into a connected team, and resolves into the Mailflare mark. The actual Mailflare envelope mark is redrawn as vector geometry for crisp motion.

The character waves, points, blinks, floats, and speaks with mouth animation driven by the narration amplitude. Glass highlights, soft contact shadows, parallax, spring entrances, shutter sampling, and light sweeps supply depth. The original electronic score includes synchronized message sounds, transition sweeps, and a final resolving chord.

## Timeline and narration

| Time | Picture | Voice |
| --- | --- | --- |
| 0–3s | Presenter enters; generic email transforms into `hello@mailflare.co` | “Your business deserves a better address.” |
| 3–7s | Inbox assembles, messages arrive, reply is sent | “Mailflare gives you professional email on your own domain.” |
| 7–11s | Domain connects hello, support, hieu, and team; management controls appear | “Mailboxes, aliases, your whole team. One place.” |
| 11–15s | Kinetic slogan resolves into the Mailflare product hero | “Your domain. Your email. Mailflare.” |

Supporting text covers individuals, developers, startups, teams, permissions, and simple setup. UI is an illustrative product visualization.

## Files

- `mailflare-launch.mp4`: finished film, H.264 / AAC
- `poster.png`: final hero still
- `scene-*.png`: scene stills
- `soundtrack.wav`: full voice and original music mix
- `narration.wav`: clean ElevenLabs voiceover
- `score.wav`: original music and sound design
- `voice-*.mp3` and `voice-*.json`: narration takes and timing
- `utils.mjs`: editable animation, typography, character, and rendering functions
- `render.mjs`: render entry point
- `audio_utils.py`: audio construction functions
- `audio.py`: audio entry point

## Re-render

Requires Node.js, Python 3, FFmpeg, and `@napi-rs/canvas`. This production uses the isolated dependency directory `/tmp/mailflare-film-tools` and the project's existing Geist font. Recreate the tool directory if needed:

```sh
mkdir -p /tmp/mailflare-film-tools
npm install --prefix /tmp/mailflare-film-tools @napi-rs/canvas
python3 media/launch-film/audio.py
node media/launch-film/render.mjs
ffmpeg -y -i media/launch-film/picture.mp4 -i media/launch-film/soundtrack.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -t 15 -movflags +faststart media/launch-film/mailflare-launch.mp4
```

The ElevenLabs API key is not stored in these files. The voice is Brian, generated with Eleven Multilingual v2. New voice takes require a key with text-to-speech permission.
