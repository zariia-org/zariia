#!/usr/bin/env python3
"""Build the two channels of the demo record.

The demo has one job: make the difference between locked and unlocked unmistakable.
So the two channels are written as halves of one figure rather than as two sounds
that happen to co-exist.

  OPEN    a pulse and a drone. Deliberately spare. It sounds like something, and it
          sounds like something waiting.
  SEALED  the line that answers it, plus the harmony under that line. On its own it
          would float; over the open track it lands.

This is a test object, not a release — the label's music is authored, played by people
in a room, and none of it exists yet. Nothing here should ever be described as a Zariia
record. Stdlib only; writes 16-bit mono WAV at 44.1 kHz.
"""
import math
import struct
import wave

SR = 44100
BPM = 96
BEAT = 60.0 / BPM
BARS = 6
BEATS = BARS * 4
DUR = BEATS * BEAT


def blank():
    return [0.0] * int(SR * DUR)


def add(buf, t0, samples, gain=1.0):
    i0 = int(t0 * SR)
    for i, s in enumerate(samples):
        j = i0 + i
        if 0 <= j < len(buf):
            buf[j] += s * gain


def env(n, attack, decay, sustain=0.0, release=None):
    """Simple ADSR over n samples, all arguments in samples."""
    release = release if release is not None else n - attack - decay
    out = []
    for i in range(n):
        if i < attack:
            v = i / max(attack, 1)
        elif i < attack + decay:
            v = 1.0 - (1.0 - sustain) * (i - attack) / max(decay, 1)
        else:
            k = (i - attack - decay) / max(release, 1)
            v = sustain * max(0.0, 1.0 - k)
        out.append(v)
    return out


def tone(freq, dur, kind="sine", attack=0.005, decay=0.08, sustain=0.55):
    n = int(dur * SR)
    e = env(n, int(attack * SR), int(decay * SR), sustain)
    out = []
    for i in range(n):
        p = (freq * i / SR) % 1.0
        if kind == "sine":
            v = math.sin(2 * math.pi * p)
        elif kind == "tri":
            v = 4 * abs(p - 0.5) - 1
        else:  # soft saw, harmonics rolled off
            v = sum(math.sin(2 * math.pi * p * h) / (h * h) for h in (1, 2, 3, 4))
        out.append(v * e[i])
    return out


def kick(dur=0.34):
    n = int(dur * SR)
    out = []
    for i in range(n):
        k = i / n
        f = 108 * math.exp(-5.5 * k) + 44          # pitch drop
        a = math.exp(-7.0 * k)
        out.append(math.sin(2 * math.pi * f * i / SR) * a)
    return out


# ── the open track: a pulse and a drone, spare on purpose ──────────────────
o = blank()
for b in range(BEATS):
    if b % 2 == 0:
        add(o, b * BEAT, kick(), 0.52)
# drone on A, with a slow breath in it
n = len(o)
for i in range(n):
    k = i / n
    breath = 0.55 + 0.45 * math.sin(2 * math.pi * 0.18 * i / SR)
    fade = min(1.0, i / (SR * 0.8), (n - i) / (SR * 1.2))
    o[i] += 0.11 * breath * fade * math.sin(2 * math.pi * 110.0 * i / SR)
    o[i] += 0.05 * breath * fade * math.sin(2 * math.pi * 165.0 * i / SR)

# ── the sealed channel: the line that answers, and its harmony ─────────────
s = blank()
A3, C4, D4, E4, G4, A4 = 220.00, 261.63, 293.66, 329.63, 392.00, 440.00
# one phrase per two bars, answering the pulse rather than doubling it
phrase = [
    (0.5, E4, 0.9), (1.5, D4, 0.5), (2.0, C4, 1.4), (3.5, A3, 0.9),
    (4.5, G4, 0.9), (5.5, E4, 0.5), (6.0, D4, 1.4), (7.5, C4, 0.9),
    (8.5, A4, 1.2), (10.0, G4, 0.6), (10.5, E4, 1.9), (12.5, D4, 0.9),
    (13.5, C4, 0.5), (14.0, A3, 2.4), (17.0, E4, 0.9), (18.0, C4, 2.0),
]
for beat, f, dur_beats in phrase:
    add(s, beat * BEAT, tone(f, dur_beats * BEAT, "tri", 0.012, 0.10, 0.42), 0.30)
# a fifth underneath, so the line has a floor of its own
for beat, f, dur_beats in phrase[::2]:
    add(s, beat * BEAT, tone(f / 2, dur_beats * BEAT, "saw", 0.03, 0.20, 0.35), 0.16)

# ── write ─────────────────────────────────────────────────────────────────
def write(path, buf, peak=0.82):
    m = max(abs(v) for v in buf) or 1.0
    g = peak / m
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v * g)) * 32767)) for v in buf))
    print(f"wrote {path}  {DUR:.1f}s")


import sys
out = sys.argv[1] if len(sys.argv) > 1 else "."
write(f"{out}/demo-open.wav", o)
write(f"{out}/demo-second.wav", s)
