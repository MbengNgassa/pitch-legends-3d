# Pitch Legends 3D

A fun, kid-friendly 3D football (soccer) web app with real clubs, real player names & stats, unlockable superstars & iconic 3D stadiums, Blender `.glb` drop-in support, and **3-device local Wi-Fi multiplayer**.

## Quick Start (Runs Locally)

```bash
npm install
npm run build
npm start
```

Open `http://localhost:3000` in your browser!

## Playing with 3 Devices on Home Wi-Fi

1. Start the server on one computer (`npm start`). It prints your home Wi-Fi address, e.g. `http://192.168.1.42:3000`.
2. On Device 1, click **Play with Friends → Create Room**. A 4-letter Room Code and a **scannable QR code** appear on screen.
3. On Devices 2 & 3 (phones, tablets, or laptops on the same Wi-Fi), scan the QR code (or open the Wi-Fi URL) and enter the Room Code!
4. Pick your team side (`Home` or `Away`) for **3-Player Co-op vs AI**, **2v1**, or **1v1**. Phones & tablets automatically show touch joystick + arcade buttons!

## Controls (Keyboard)

- **Move**: `WASD` or `Arrow Keys`
- **Pass / Switch Player / Tackle**: `Space` or `J`
- **Shoot (Hold to charge Power Shot)**: `K`, `Shift`, or `Enter`
- **Sprint**: `E` or `L`
- **360° Skill Spin**: `Q` or `I`

## Upgrading Graphics with Blender Later

See [`BLENDER_GUIDE.md`](./BLENDER_GUIDE.md) for how to drop `.glb` exports into `public/models/` and `public/models/manifest.json`.
