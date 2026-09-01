# Drop-in 3D models

The hero scene uses a real `.glb` the moment one exists at these paths, and
falls back to the built-from-primitives version until then. **No code change
is needed** — put the file here, reload, done.

| Path | Replaces | Required |
|---|---|---|
| `public/models/truck.glb` | `BuiltTruck` in `components/home/HeroScene.tsx` | wheel nodes named (see below) |
| `public/models/forklift.glb` | `BuiltForklift` | nothing |

Presence is probed with a `HEAD` request, not a build-time import — a missing
file degrades to the primitive build instead of throwing inside the canvas,
where there is no React error boundary to catch it.

## Truck requirements

**Orientation and scale.** Nose along **+Z**, up along **+Y**, origin at the
centre of the chassis on the **ground plane** (y = 0 is where the tyres touch).
The rig assumes a real-world-scale vehicle roughly:

```
length  ~9.4      (nose at z = +4.3, rear doors at z = -5.0)
width   ~2.6      (x = -1.3 .. +1.3)
height  ~3.9
tyre radius 0.72  <- this one matters, see below
```

**Tyre radius is not cosmetic.** Wheel spin is computed as
`distance travelled / 0.72`. A model with a different radius will visibly
slip. Either scale the model so its tyres are 0.72 in radius, or change the
divisor in `HeroScene.tsx` (search for `/ 0.72`) to match.

**Wheel nodes.** Any node whose name matches `/wheel|tyre|tire/i` is
re-parented into the spin group with `Object3D.attach()`, so world transforms
survive. Each wheel's own origin must be at its **hub**, or it will orbit
rather than roll.

**Livery.** Any material named to match `/livery|decal|logo|brand/i` gets
`/logo.png` bound as its `map`. Give that material UVs covering the flank
panel. Otherwise leave the flank blank and the primitive livery planes handle
it.

**Rear doors.** The rig cannot hinge doors on an imported model — the primitive
`doors` group is skipped. The container's warm interior light and its ground
spill still animate, because both live on the truck group at fixed
coordinates. If you want the doors to open, model them as two children named
`left` and `right` and extend `Truck()` to pass them through.

## Both models

- **Format**: `.glb` (binary glTF 2.0). Draco compression is **not** wired up —
  export uncompressed, or add `DRACOLoader` to the `GLTFLoader` in
  `HeroScene.tsx`.
- **Budget**: keep each under ~4 MB and ~150k triangles. The hero already runs
  a bloom pass and shadow maps; this is a website header, not a turntable.
- **Materials**: PBR metallic-roughness. Shadow flags and `envMapIntensity`
  are forced on every mesh at load, so don't fight them in the exporter.
- **Textures**: embed them in the `.glb`. External `.bin`/texture siblings are
  not served from this folder.
- **Y-up**: glTF is Y-up by default; if you export from Z-up (Blender's
  default world), tick the exporter's +Y up option.

## Not wired up

A **rigged, animated human** would need its own `AnimationMixer` and clip-name
matching — that is an integration, not a drop-in, so no hook is stubbed for it.
Dock workers are built from primitives with a sine-driven walk cycle
(`Worker` in `HeroScene.tsx`). Ask before buying a rigged character model.
