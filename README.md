# 🌀 Naruto Jutsu AR (`naruto-jutsu-ar`)

> Real-time Naruto Jutsu & Dōjutsu Augmented Reality web experience powered by MediaPipe, WebGL particles, hand-sign recognition, and procedural Web Audio synthesis.

---

## ⚡ Features

### ✋ Hand Jutsus (Single & Dual Hand)
- **Rasengan (螺旋丸)**: Open palm facing forward.
- **Odama Rasengan (大玉螺旋丸)**: Two cupped palms cradling a giant swirling sphere.
- **Rasenshuriken (螺旋手裏剣)**: Three fingers extended with whirling wind blades.
- **Chidori (千鳥)**: Half-seal hand gesture with surging electric sparks & birds SFX.
- **Fireball Jutsu (火遁・豪火球の術)**: Index point aim or mouth-open detection.
- **Amaterasu (天照)**: Pinch fingers with black flames.
- **Bijudama (尾獣玉)**: Two fists facing each other with dark tailed-beast chakra condensation.
- **Summoning Jutsu (口寄せの術)**: Rapid downward palm/fist ground slam.

### 🧘 Body Modes (Two-Hand Seals)
- **Shadow Clone Technique (影分身の術)**: Cross index & middle fingers (`十字印`).
- **Sage Mode (仙人モード)**: Upright prayer hands pressed together (`🙏`).
- **Kurama Chakra Mode (九喇嘛モード)**: Crossed wrists/fists.
- **Six Paths Mode (六道モード)**: Raised open palms.

### 👁️ Dōjutsu (Eye-Tracking & Wink Triggers)
- **Sharingan (写輪眼 - 3 Tomoe)**: Wink left eye (or right).
- **Mangekyō Sharingan (万華鏡写輪眼)**: Wink opposite eye.
- **Rinnegan (輪廻眼)**: Dual upright half-seals side-by-side.
- **Byakugan (白眼)**: Shaka hand gesture (`🤙`).

### 🎯 Motion Controls
- **Swipe-to-Throw**: Throw charged orbs across the screen with release momentum.
- **Index Point Steering**: Aim index finger to steer guided projectiles mid-air.
- **Fist Clench Detonation**: Clench fist to detonate active guided projectiles.

---

## 🚀 Quick Start

### 1. Requirements
- A modern browser with webcam support (Chrome, Edge, Firefox, or Brave).
- Python 3 installed (for running the local HTTP server).

### 2. Launch
Double-click `start.bat` on Windows, or run:
```bash
python -m http.server 8080
```
Then open [http://localhost:8080](http://localhost:8080) in your browser and allow webcam permissions.

---

## 🛠️ Tech Stack
- **Vision & Tracking**: MediaPipe Hands & Face Mesh (via CDN)
- **Rendering**: HTML5 2D Canvas & WebGL Particles
- **Audio**: Web Audio API (procedurally generated synthesis + audio buffers)
- **Language**: Vanilla JavaScript (ES6+ modular architecture)

---

## 📜 License
MIT License.
