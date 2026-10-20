"""
Look Up · 占位声音：用程序合成，放在 look-up/sound/。之后换成 Kiara 录的纸翅膀声，文件名不变即可。

用法：python3 look-up/tools/make_sounds.py

- street.wav   街道底噪（低沉的城市嗡声）           地面最响
- traffic.wav  车流（一辆辆车经过）                   地面到屋顶之间渐弱
- steps.wav    脚步                                   只在地面附近
- wind.wav     风                                     屋顶以上，越高越轻
- feather.wav  羽毛落下时很轻的一声
全部循环无缝（首尾交叉淡化），22.05 kHz 单声道。
"""
import wave
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / "sound"
SR = 22050
rng = np.random.default_rng(7)


def pink(n):
    # Voss-McCartney 的简化版：白噪声做 1/f 滤波
    w = rng.standard_normal(n)
    f = np.fft.rfft(w)
    k = np.arange(len(f))
    k[0] = 1
    f /= np.sqrt(k)
    return np.fft.irfft(f, n)


def lowpass(x, cutoff):
    f = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    f *= 1 / (1 + (freqs / cutoff) ** 4)
    return np.fft.irfft(f, len(x))


def bandpass(x, lo, hi):
    f = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    f *= (1 / (1 + (lo / np.maximum(freqs, 1)) ** 4)) * (1 / (1 + (freqs / hi) ** 4))
    return np.fft.irfft(f, len(x))


def loopable(x, fade_s=1.5):
    n = int(fade_s * SR)
    head, body, tail = x[:n], x[n:-n], x[-n:]
    t = np.linspace(0, 1, n)
    mixed = tail * (1 - t) + head * t
    return np.concatenate([body, mixed])


def norm(x, peak=0.7):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def save(name, x):
    OUT.mkdir(parents=True, exist_ok=True)
    data = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print(f"{name}: {len(x) / SR:.1f}s")


def street(sec=24):
    n = sec * SR
    hum = lowpass(pink(n), 260) * 1.0
    hiss = bandpass(rng.standard_normal(n), 900, 4000) * 0.08
    slow = 0.85 + 0.15 * np.sin(np.linspace(0, 2 * np.pi * 3, n))
    return norm(loopable((hum + hiss) * slow), 0.6)


def traffic(sec=30):
    n = sec * SR
    x = np.zeros(n)
    t = np.arange(n) / SR
    for _ in range(9):
        c = rng.uniform(1, sec - 1)
        width = rng.uniform(1.2, 2.6)
        env = np.exp(-((t - c) / width) ** 2)
        noise = bandpass(rng.standard_normal(n), rng.uniform(120, 220), rng.uniform(1200, 2400))
        x += noise * env * rng.uniform(0.5, 1.0)
    return norm(loopable(x), 0.7)


def steps(sec=16):
    n = sec * SR
    x = np.zeros(n)
    k = 0.0
    while k < sec - 0.6:
        k += rng.uniform(0.42, 0.6)
        i = int(k * SR)
        m = int(0.06 * SR)
        click = bandpass(rng.standard_normal(m * 4), 200, 2500)[:m] * np.exp(-np.linspace(0, 8, m))
        x[i:i + m] += click * rng.uniform(0.5, 1.0)
    return norm(loopable(x, 0.5), 0.5)


def wind(sec=30):
    n = sec * SR
    base = bandpass(pink(n), 120, 1400)
    t = np.linspace(0, 1, n)
    gust = 0.55 + 0.45 * (np.sin(2 * np.pi * (3 * t + 0.2 * np.sin(2 * np.pi * 1.3 * t))) * 0.5 + 0.5)
    return norm(loopable(base * gust), 0.6)


def feather(sec=3):
    n = sec * SR
    t = np.linspace(0, 1, n)
    env = np.sin(np.pi * t) ** 2
    x = bandpass(rng.standard_normal(n), 1500, 6000) * env
    return norm(x, 0.25)


if __name__ == "__main__":
    save("street.wav", street())
    save("traffic.wav", traffic())
    save("steps.wav", steps())
    save("wind.wav", wind())
    save("feather.wav", feather())
