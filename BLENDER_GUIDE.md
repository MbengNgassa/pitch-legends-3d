# Upgrading Graphics with Blender (`.glb` Drop-In Guide)

**Pitch Legends 3D** is built on Three.js with a drop-in `GLTFLoader` asset pipeline (`src/game/ModelLoader.js`) so you and your sons can upgrade the soccer ball, individual real players, or entire stadiums with custom **Blender** models later without rewriting game code.

## Step 1: Export from Blender as `.glb`
1. In Blender, finish your model with PBR materials (Principled BSDF).
2. Click **File → Export → glTF 2.0 (.glb/.gltf)**.
3. Choose **Format: glTF Binary (.glb)**.
4. Enable **+Y Up** (Blender's default for glTF export) and **Apply Modifiers**.
5. Save the file inside `public/models/`:
   - Ball: `public/models/ball.glb`
   - Player: `public/models/players/mbappe.glb` (or `haaland.glb`, `messi.glb`, etc.)
   - Stadium: `public/models/stadiums/bernabeu.glb`

## Step 2: Register the Model in `public/models/manifest.json`
Open `public/models/manifest.json` and replace `null` with your model's path:

```json
{
  "ball": "/models/ball.glb",
  "defaultPlayer": null,
  "players": {
    "mbappe": "/models/players/mbappe.glb",
    "haaland": "/models/players/haaland.glb"
  },
  "stadiums": {
    "bernabeu": "/models/stadiums/bernabeu.glb"
  }
}
```

## Step 3: Refresh the Browser!
The game automatically:
- Loads your `.glb` file via Three.js `GLTFLoader`
- Enables real-time soft shadows (`castShadow` & `receiveShadow`)
- Auto-scales players and the ball to match the pitch dimensions cleanly
- Falls back to the built-in 3D procedural meshes for anything still set to `null`
