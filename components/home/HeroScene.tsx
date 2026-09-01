"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/* ── Scroll-driven 3D hero ───────────────────────────────────────────────
   Four phases along one continuous drive. The truck stays at the origin and
   the world slides past it, so "distance travelled" is a single number and
   wheel spin can be derived from it rather than faked.

   Scroll progress arrives as a ref, not a prop — the camera updates inside
   useFrame, so React never re-renders while you scroll.

   There are deliberately no OrbitControls: pointer-driven orbit fights the
   scroll that drives the story, so the camera is scroll's alone.

   The truck is a real .glb the moment one exists at TRUCK_GLB; until then
   the primitive build stands in. Everything else — camera, lighting, road,
   scenery — is identical either way, so dropping the model in is the whole
   of the swap. */

const TRAVEL = 380;

/** Where each scene sits along the route. These are not free parameters:
    scenery must sit at travelled(p) for the p that frames it, otherwise the
    truck arrives after it has already swept past the camera. */
/** The truck's nose points +Z, so the route runs +Z and the world slides
    -Z under it. The dock is the one landmark behind the start line: a truck
    loads with its rear doors against the building, then pulls away forward. */
const WAREHOUSE_Z = -20; // behind the start line — backed onto the dock
const COAST_Z = 298; // travelled(0.625)
const PORT_Z = 380; // travelled(0.875), fully stopped

/** Camera keyframes, one per phase. Targets sit left of the truck so the
    truck lands right-of-centre, clear of the headline. */
const SHOTS: Array<{ pos: [number, number, number]; target: [number, number, number] }> = [
  { pos: [-17, 3.6, 16.5], target: [-4.6, 2.3, -1] }, // 0–25%  warehouse dock
  { pos: [-26, 4.2, 3], target: [-6.8, 2.2, 0] }, // 25–50% highway side-track
  { pos: [-19, 13, 18], target: [-7, 1.2, -4] }, // 50–75% coastal, elevated
  // Pulled back and raised so the boom at y = 22.4 is inside the frustum:
  // at fov 38 the old pose cut the crane off just above the trolley.
  { pos: [-10, 13, -22], target: [16, 9, 7] }, // 75–100% yard arrival + park
];

/** Fog + key light per phase — daylight through to dusk at the yard. The
    fog band moves with the beat too: tight and hazy in the enclosed dock,
    thrown wide open on the highway, hauled back in at the dusk yard. That
    changing depth is the whole of the "volumetric atmosphere" read on a
    linear fog, and it costs two lerps a frame. */
/** Ambient is deliberately low and the key deliberately high. Raising the
    ambient fill to "brighten" a scene flattens it — fill is exactly the light
    that fills shadows in, and edges are read from the contrast across them.
    Crisp edges come from a strong single sun and a dark shadow side. */
const MOODS = [
  { fog: "#cda87c", key: "#fff4dc", keyI: 4.4, amb: 0.7, ambCol: "#cbb599", rim: 1.1, fogN: 240, fogF: 620, sky: 1.0 },
  { fog: "#e6c496", key: "#ffeac4", keyI: 4.8, amb: 0.74, ambCol: "#d8c3a4", rim: 1.5, fogN: 300, fogF: 660, sky: 1.06 },
  { fog: "#f0cb9a", key: "#ffe0af", keyI: 4.6, amb: 0.74, ambCol: "#d6bda0", rim: 1.9, fogN: 320, fogF: 680, sky: 1.02 },
  { fog: "#d9a065", key: "#ffc582", keyI: 4.1, amb: 0.66, ambCol: "#c9a279", rim: 2.3, fogN: 250, fogF: 620, sky: 0.82 },
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

/** CSS-style cubic-bezier(x1,y1,x2,y2) as a scalar easing function. Newton
    solves x(u)=t for u, then returns y(u). Smoothstep eases symmetrically
    and cannot express a slow lead-in with a fast settle; this can. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const xAt = (u: number) => ((ax * u + bx) * u + cx) * u;
  const dxAt = (u: number) => (3 * ax * u + 2 * bx) * u + cx;

  return (t: number) => {
    const x = clamp01(t);
    let u = x;
    for (let i = 0; i < 6; i++) {
      const dx = xAt(u) - x;
      if (Math.abs(dx) < 1e-5) break;
      const d = dxAt(u);
      if (Math.abs(d) < 1e-6) break;
      u -= dx / d;
    }
    return ((ay * u + by) * u + cy) * u;
  };
}

/** Camera timing: lingers on a beat, then crosses to the next decisively. */
const easeShot = cubicBezier(0.65, 0.02, 0.28, 1);

/** Split progress into a keyframe pair plus an eased blend between them.
    Keyframe i is anchored at the centre of band i — (i + 0.5) / n — so each
    beat owns its quarter of the scroll and the moves happen at the seams. */
function segment(p: number, n: number) {
  const s = clamp01(clamp01(p) * n - 0.5);
  const i = Math.min(n - 2, Math.floor(s));
  return { i, t: easeShot(clamp01(s - i)) };
}

/** Distance travelled. Smoothstep at both ends means the truck pulls away
    from rest at the dock and brakes to a genuine stop at the yard. */
/** Lateral sweep of the coastal bend: 0 → 1 → 0 across the coastal band. */
function bend(p: number) {
  return Math.sin(clamp01((p - 0.46) / 0.32) * Math.PI);
}

/** How far the coastal bend sweeps the truck across the road, in road-local
    units. Bounded by the carriageway, which is 17 wide with guardrails at
    x = +/-9.4: at the old value of 9 the truck sat at 7.7..10.3 through the
    apex — off the tarmac and straight through the right-hand rail. */
const BEND_X = 3.2;

/** The heading the truck must actually hold, from the ratio of its lateral
    speed to its forward speed.

    Yawing by a fraction of bend() looked plausible mid-curve and was flatly
    wrong at the apex, where lateral velocity is zero but that formula is at
    maximum yaw: 11.5 degrees of crab with the truck travelling dead ahead.
    Deriving it costs two extra evaluations of functions that are already
    pure, and it cannot disagree with the path. */
function drift(p: number) {
  const e = 1e-3;
  const dLat = (bend(p + e) - bend(p - e)) * BEND_X;
  const dFwd = travelled(p + e) - travelled(p - e);
  return dFwd > 1e-6 ? Math.atan2(dLat, dFwd) : 0;
}

/** Turn radius and reversing run of the yard manoeuvre. */
/** Where highway furniture stops. The park manoeuvre swings the truck out
    to x = -12.7 before reversing in, so guardrail running past here would be
    something for it to drive through. */
const RAIL_END = 330;

const PARK_R = 8.4;
const PARK_BACK = 28.4;

/** Yard manoeuvre: a forward left 90, then a reverse into the bay.

    travelled() is finished by p = 0.79 — the world has stopped sliding — so
    from here the truck is free to move in world space directly. That matters:
    turning the truck while keeping it at the origin would mean yawing the
    world instead, which swings six hundred units of road, sea and ridgeline
    straight through the lens.

    Returns signed distance rolled alongside the pose, so wheel spin stays
    derived from real movement. Driving the spin off travelled() alone would
    leave the tyres locked through thirty-seven units of manoeuvre. */
function park(p: number) {
  const turn = smooth(clamp01((p - 0.76) / 0.08));
  const back = smooth(clamp01((p - 0.84) / 0.055));
  const phi = turn * (Math.PI / 2);
  // Quarter circle about (-R, 0, 0): starts at the origin heading +Z, ends
  // at (-R, 0, R) heading -X. Reversing from there moves it back out in +X,
  // which lands the rear doors facing the container field and the quay.
  return {
    x: -PARK_R + PARK_R * Math.cos(phi) + back * PARK_BACK,
    z: PARK_R * Math.sin(phi),
    yaw: -phi,
    rolled: PARK_R * phi - back * PARK_BACK,
  };
}

/** The terminal gate, in world-local z, and the run the truck holds at.
    GATE_STOP is set from the gate: the nose sits 4.3 ahead of the origin, so
    stopping at 346 puts it 1.7 short of the boom. Close enough to read as
    waiting at the barrier, clear enough never to touch it. */
/** The four corners of a container, and therefore of everything that hangs
    off one: sheaves, falls, twistlocks, castings. */
const CORNER: Array<[number, number]> = [
  [-2.85, -1.1],
  [-2.85, 1.1],
  [2.85, -1.1],
  [2.85, 1.1],
];

const GATE_Z = 352;
const GATE_STOP = GATE_Z - 4.3 - 1.7;
const GATE_HOLD_A = 0.56;
const GATE_HOLD_B = 0.63;

/** Distance at which the barrier may start dropping again: the tail sits
    5.06 behind the origin, so the truck is wholly past the post by
    GATE_Z + 5.06, and four more units keeps the arm off the tailgate. */
const GATE_CLEAR = GATE_Z + 5.06 + 4;

/** Boom angle, 0 shut to 1 fully raised.

    Opening is driven by p and closing by travelled(), and each has to be
    that way round.

    Opening cannot read distance: travelled() is flat through the hold, so a
    distance cue would freeze with the arm half up and deadlock — the truck
    waiting on the barrier, the barrier waiting on the truck.

    Closing cannot read p: the arm must not begin to fall until the tail is
    actually clear of the post, and where the tail is, is a distance. Reading
    p there would drop the arm on the trailer the moment the timings were
    ever retuned. */
function gateOpen(p: number) {
  const up = smooth(clamp01((p - GATE_HOLD_A) / ((GATE_HOLD_B - GATE_HOLD_A) * 0.75)));
  const down = smooth(clamp01((travelled(p) - GATE_CLEAR) / 14));
  return up * (1 - down);
}

/** Distance run. Three legs: the dock-to-gate haul, a dead stop while the
    barrier lifts, then the creep through the gate into the yard.

    The hold is a genuine plateau rather than a slow section — velocity is
    differentiated from this curve, so a flat stretch stops the wheels, the
    suspension bounce and the tyre dust on its own, with nothing else to
    keep in sync. */
function travelled(p: number) {
  if (p <= GATE_HOLD_A) {
    return GATE_STOP * smooth(clamp01((p - 0.28) / (GATE_HOLD_A - 0.28)));
  }
  if (p < GATE_HOLD_B) return GATE_STOP;
  return (
    GATE_STOP +
    (TRAVEL - GATE_STOP) * smooth(clamp01((p - GATE_HOLD_B) / (0.79 - GATE_HOLD_B)))
  );
}

/** Deterministic scatter — a seeded PRNG keeps the container yard stable
    across renders instead of reshuffling on every mount. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Quality = "high" | "low";

const WHITE = "#f2f0ee";
const RED = "#b21f2d";
const DARK = "#1b1b1e";

/** Bevelled box. Sharp 90-degree corners are what make primitive geometry
    read as programmer art; a 3-4cm radius catches the key light along every
    edge and the same shape suddenly reads as sheet metal. */
function Rounded({ w, h, d, r = 0.07 }: { w: number; h: number; d: number; r?: number }) {
  const geo = useMemo(() => new RoundedBoxGeometry(w, h, d, 3, r), [w, h, d, r]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <primitive object={geo} attach="geometry" />;
}

/** Radial falloff used for lamp glow and the ground contact shadow. */
function radialTexture(stops: Array<[number, string]>) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 63);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Image-based lighting without shipping an HDR file: a sky-to-ground
    gradient run through PMREM. Gives materials something to reflect, which
    is most of what an HDRI buys here, for a few hundred bytes. */
function useProceduralEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = 1024;
    const H = 512;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    // Sunset: deep zenith, a hot band at the horizon, warm dark ground.
    // The band is what metal and clearcoat actually reflect, so its width
    // controls how "lit" the bodywork reads more than the sun spot does.
    g.addColorStop(0, "#2b4a86");
    g.addColorStop(0.3, "#8e6f8e");
    g.addColorStop(0.44, "#e8894a");
    g.addColorStop(0.5, "#ffc27a");
    g.addColorStop(0.56, "#7a5238");
    g.addColorStop(1, "#171310");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // A low sun. Without a bright spot the environment is a flat wash and
    // clearcoat has no highlight to pick up — the paint reads as matte.
    const sun = ctx.createRadialGradient(280, 248, 8, 280, 248, 170);
    sun.addColorStop(0, "rgba(255,246,222,1)");
    sun.addColorStop(0.35, "rgba(255,214,150,0.75)");
    sun.addColorStop(1, "rgba(255,190,120,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);

    // Cloud banding along the horizon. A perfectly clean gradient is what
    // makes a procedural sky read as a UI gradient rather than as air.
    const rand = prng(60318);
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 46; i++) {
      const cy = 190 + rand() * 90;
      const cw = 70 + rand() * 240;
      const ch = 5 + rand() * 13;
      const cx = rand() * W;
      const band = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
      band.addColorStop(0, "rgba(255,238,214,0)");
      band.addColorStop(0.5, `rgba(255,242,222,${0.35 + rand() * 0.4})`);
      band.addColorStop(1, "rgba(255,238,214,0)");
      ctx.fillStyle = band;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw / 2, ch, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromEquirectangular(tex).texture;
    scene.environment = env;
    // The same sky is the backdrop. It was a flat fill of the fog colour,
    // which is why the distance read as a void — nothing to look at behind
    // the geometry, and no horizon line at all.
    scene.background = tex;

    return () => {
      scene.environment = null;
      scene.background = null;
      env.dispose();
      pmrem.dispose();
      tex.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Procedural asphalt: a seeded grain used as both albedo and roughness, so
    the road scatters light unevenly instead of reading as flat plastic.
    ponytail: generated rather than shipped — a real 2K PBR set is ~6MB and
    at this camera distance the grain is all that survives. */
function useAsphalt(repeatY: number) {
  const maxAniso = useThree((st) => st.gl.capabilities.getMaxAnisotropy());

  return useMemo(() => {
    const SZ = 512;
    const c = document.createElement("canvas");
    c.width = SZ;
    c.height = SZ;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const rand = prng(99173);

    // Aggregate, not noise. Per-pixel noise was what this generated before,
    // and per-pixel noise mip-filters straight to flat grey — the road read
    // as uniform card from any distance at all. Asphalt is chips of stone in
    // a dark binder, so draw the chips: a few thousand small ellipses over a
    // near-black base, at a size that survives the mip chain.
    ctx.fillStyle = "#2b2b2e";
    ctx.fillRect(0, 0, SZ, SZ);
    for (let i = 0; i < 5200; i++) {
      const v = 58 + rand() * 62;
      const r = 1.2 + rand() * 3.4;
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`;
      ctx.beginPath();
      ctx.ellipse(rand() * SZ, rand() * SZ, r, r * (0.6 + rand() * 0.6), rand() * 3.14, 0, 6.29);
      ctx.fill();
    }

    // Sobel the aggregate into a tangent-space normal map. Stones give this
    // real relief to find; the old noise gave it nothing but hash.
    const n = document.createElement("canvas");
    n.width = SZ;
    n.height = SZ;
    const nctx = n.getContext("2d");
    if (nctx) {
      const src = ctx.getImageData(0, 0, SZ, SZ).data;
      const out = nctx.createImageData(SZ, SZ);
      const at = (x: number, y: number) =>
        src[(((y + SZ) % SZ) * SZ + ((x + SZ) % SZ)) * 4] / 255;
      for (let y = 0; y < SZ; y++) {
        for (let x = 0; x < SZ; x++) {
          const dx = at(x + 1, y) - at(x - 1, y);
          const dy = at(x, y + 1) - at(x, y - 1);
          const i = (y * SZ + x) * 4;
          out.data[i] = 128 - dx * 165;
          out.data[i + 1] = 128 - dy * 165;
          out.data[i + 2] = 255;
          out.data[i + 3] = 255;
        }
      }
      nctx.putImageData(out, 0, 0);
    }

    // Roughness carries two things the albedo must not: standing water, and
    // the polished bands where tyres have run. Both are pure roughness
    // effects — the tarmac is the same colour either way, it just stops
    // scattering, which is exactly what a wheel track looks like in low sun.
    const w = document.createElement("canvas");
    w.width = SZ;
    w.height = SZ;
    const wctx = w.getContext("2d");
    if (wctx) {
      wctx.drawImage(c, 0, 0);
      const puddle = prng(4471);
      for (let i = 0; i < 16; i++) {
        const px = puddle() * SZ;
        const py = puddle() * SZ;
        const pr = 32 + puddle() * 88;
        const g2 = wctx.createRadialGradient(px, py, 1, px, py, pr);
        g2.addColorStop(0, "rgba(0,0,0,0.95)");
        g2.addColorStop(0.7, "rgba(0,0,0,0.45)");
        g2.addColorStop(1, "rgba(0,0,0,0)");
        wctx.fillStyle = g2;
        wctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
    }

    const make = (from: HTMLCanvasElement, srgb: boolean, rx = 4, ry = repeatY) => {
      const t = new THREE.CanvasTexture(from);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = maxAniso;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return {
      map: make(c, true),
      // Puddles tile an order of magnitude slower than the grain, otherwise
      // the same wet patch repeats every few metres and reads as wallpaper.
      roughnessMap: make(w, false, 1, Math.max(2, repeatY / 9)),
      normalMap: make(n, false),
    };
  }, [repeatY, maxAniso]);
}

/** Corrugated steel: vertical ribs baked straight into a tangent-space
    normal map. It is the ribbing, more than the colour, that separates a
    shipping container from a coloured box. */
function useCorrugation() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 4;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(128, 4);
    for (let x = 0; x < 128; x++) {
      const nx = Math.sin((x / 128) * Math.PI * 16);
      for (let y = 0; y < 4; y++) {
        const i = (y * 128 + x) * 4;
        img.data[i] = 128 + nx * 120;
        img.data[i + 1] = 128;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 1);
    return t;
  }, []);
}

/** A mountain range as real geometry rather than a painted silhouette: a
    ring of three vertex rows — foot, crest, back slope — with the crest
    height summed from four sine octaves at integer frequencies, so the
    profile closes seamlessly where the ring wraps.

    Three rows rather than a curtain is the point. A vertical wall has no
    surface for the sun to rake across, so it reads as a cutout no matter
    what texture is on it; a sloped face takes the key light and the peaks
    shade themselves. */
function ridgeGeometry(r: number, h: number, seed: number, segs: number) {
  const rand = prng(seed);
  const ph = [rand() * 7, rand() * 7, rand() * 7, rand() * 7];
  const rows = [
    { dr: 30, y: 0 },
    { dr: 0, y: 1 },
    { dr: -38, y: 0.42 },
  ];

  const pos: number[] = [];
  const idx: number[] = [];
  for (const row of rows) {
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const e =
        Math.sin(a * 3 + ph[0]) * 0.5 +
        Math.sin(a * 7 + ph[1]) * 0.27 +
        Math.sin(a * 13 + ph[2]) * 0.14 +
        Math.sin(a * 29 + ph[3]) * 0.07;
      const peak = Math.max(0.12, 0.46 + e * 0.34) * h;
      const rad = r + row.dr;
      pos.push(Math.sin(a) * rad, peak * row.y, Math.cos(a) * rad);
    }
  }

  const stride = segs + 1;
  for (let row = 0; row < rows.length - 1; row++) {
    for (let i = 0; i < segs; i++) {
      const a0 = row * stride + i;
      const a1 = a0 + stride;
      idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Two ranges along the horizon. Fixed in world space, not parented to the
    world group: the route slides 380 units under a camera that barely moves,
    so terrain that must stay distant has to stay still. */
function Horizon() {
  const far = useMemo(() => ridgeGeometry(340, 96, 4211, 240), []);
  const near = useMemo(() => ridgeGeometry(262, 54, 9137, 200), []);
  useEffect(
    () => () => {
      far.dispose();
      near.dispose();
    },
    [far, near],
  );

  return (
    <group position={[0, -6, 0]}>
      {[
        { geo: far, color: "#8ea3bb", key: "far" },
        { geo: near, color: "#63707f", key: "near" },
      ].map(({ geo, color, key }) => (
        <mesh key={key} geometry={geo}>
          {/* DoubleSide rather than a hand-checked winding order: the camera
              sits inside the ring, and one material flag is cheaper than
              debugging triangle order that cannot be seen from here. */}
          <meshStandardMaterial
            color={color}
            roughness={1}
            metalness={0}
            envMapIntensity={0.5}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Height field to tangent-space normal map. Both the road and the tyres
    want this and each had its own copy of the loop. */
function sobelNormal(src: HTMLCanvasElement, size: number, strength: number) {
  const n = document.createElement("canvas");
  n.width = size;
  n.height = size;
  const nctx = n.getContext("2d");
  const sctx = src.getContext("2d");
  if (!nctx || !sctx) return null;
  const data = sctx.getImageData(0, 0, size, size).data;
  const out = nctx.createImageData(size, size);
  const at = (x: number, y: number) =>
    data[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const i = (y * size + x) * 4;
      out.data[i] = 128 - dx * strength;
      out.data[i + 1] = 128 - dy * strength;
      out.data[i + 2] = 255;
      out.data[i + 3] = 255;
    }
  }
  nctx.putImageData(out, 0, 0);
  return n;
}

/** Rust and wash streaks running down a container flank.

    Applied to roughness, not to colour. Under a low sun a repainted box and
    a rusted one are close to the same hue — what separates them is that one
    still scatters evenly and the other has stopped. Streaking the albedo
    instead would have every box in the field wearing the same stain, since
    they share one texture; roughness varies per box already, so this reads
    as different boxes rather than a repeated decal. */
function useWeather() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(0, 0, 128, 128);
    const rand = prng(3391);
    for (let i = 0; i < 90; i++) {
      const x = rand() * 128;
      const w = 0.6 + rand() * 2.6;
      const top = rand() * 40;
      const len = 30 + rand() * 88;
      const g = ctx.createLinearGradient(0, top, 0, top + len);
      // Brighter is rougher: rust has stopped reflecting, paint has not.
      g.addColorStop(0, `rgba(252,248,242,${0.2 + rand() * 0.5})`);
      g.addColorStop(1, "rgba(252,248,242,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, top, w, len);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
}

/** Yellow-and-black hazard striping, for bollards, barrier booms and dock
    bumpers. Diagonal bands drawn once and repeated round the geometry. */
function useHazard() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#f2b21a";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#17181b";
    // Drawn past both edges so the diagonal meets itself where it wraps.
    for (let i = -1; i < 5; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32 + 16, 0);
      ctx.lineTo(i * 32 + 16 + 64, 64);
      ctx.lineTo(i * 32 + 64, 64);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
}

/** Chain-link, as an alpha mask rather than geometry. A woven fence modelled
    as meshes is thousands of draw calls for something read at 30 metres;
    one alphaTest plane per panel is the same picture. */
function useChainLink() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = "#c9ced6";
    ctx.lineWidth = 3.5;
    for (let i = -4; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 16, 0);
      ctx.lineTo(i * 16 + 64, 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i * 16, 64);
      ctx.lineTo(i * 16 + 64, 0);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }, []);
}

/** Tyre rubber: a tread block pattern as a bump map. Tyres are the one part
    of a truck a viewer has seen up close, and a perfectly smooth black
    cylinder is the tell that gives a render away. */
function useRubber() {
  return useMemo(() => {
    const SZ = 128;
    const c = document.createElement("canvas");
    c.width = SZ;
    c.height = SZ;
    const ctx = c.getContext("2d");
    if (!ctx) return null;

    // Grooves dark, blocks proud. Two circumferential channels and staggered
    // lugs between them, which is how a drive tyre is actually cut.
    ctx.fillStyle = "#151515";
    ctx.fillRect(0, 0, SZ, SZ);
    ctx.fillStyle = "#f0f0f0";
    for (let row = 0; row < 10; row++) {
      for (let band = 0; band < 4; band++) {
        const y = band * 32 + (row % 2 ? 4 : 0);
        ctx.fillRect(row * 13 + (band % 2 ? 6 : 0), y + 3, 10, 24);
      }
    }
    // Sipes: fine cuts across each lug, the detail that reads as tread
    // rather than as a checkerboard.
    ctx.fillStyle = "#151515";
    for (let row = 0; row < 10; row++) {
      for (let band = 0; band < 4; band++) {
        const y = band * 32 + (row % 2 ? 4 : 0);
        for (let k = 1; k < 4; k++) ctx.fillRect(row * 13 + (band % 2 ? 6 : 0), y + 3 + k * 6, 10, 1.6);
      }
    }

    const nrm = sobelNormal(c, SZ, 230);
    if (!nrm) return null;
    const t = new THREE.CanvasTexture(nrm);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 1);
    return t;
  }, []);
}

/** One soft round sprite, shared by every particle system on the page. */
function useMote() {
  return useMemo(
    () =>
      radialTexture([
        [0, "rgba(255,255,255,0.95)"],
        [0.42, "rgba(255,255,255,0.3)"],
        [1, "rgba(255,255,255,0)"],
      ]),
    [],
  );
}

/** Airborne motes inside a box volume, wrapping at the edges so the system
    never empties. Positions advance in JS — at a couple of hundred points
    that is cheaper than compiling a second shader, and every stage gets its
    own drift off one material.

    `alpha` is a ref rather than a prop so a stage can fade its dust in and
    out from inside useFrame without re-rendering the tree. */
function Dust({
  count,
  volume,
  drift,
  color,
  size,
  alpha,
  seed,
}: {
  count: number;
  volume: [number, number, number];
  drift: [number, number, number];
  color: string;
  size: number;
  alpha: MutableRefObject<number>;
  seed: number;
}) {
  const tex = useMote();
  const pts = useRef<THREE.Points>(null);
  const mat = useRef<THREE.PointsMaterial>(null);
  const [vx, vy, vz] = volume;

  const { geometry, phase } = useMemo(() => {
    const rand = prng(seed);
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * vx;
      pos[i * 3 + 1] = rand() * vy;
      pos[i * 3 + 2] = (rand() - 0.5) * vz;
      ph[i] = rand() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geometry: g, phase: ph };
  }, [count, vx, vy, vz, seed]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }, delta) => {
    const a = alpha.current;
    if (mat.current) mat.current.opacity = a;
    // Invisible motes do not need integrating — this is the whole reason
    // three particle systems can coexist without costing three budgets.
    if (!pts.current || a < 0.01) return;
    const arr = pts.current.geometry.attributes.position.array as Float32Array;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      arr[j] += (drift[0] + Math.sin(t * 0.7 + phase[i]) * 0.22) * delta;
      arr[j + 1] += (drift[1] + Math.cos(t * 0.5 + phase[i]) * 0.16) * delta;
      arr[j + 2] += drift[2] * delta;
      if (arr[j] > vx / 2) arr[j] -= vx;
      else if (arr[j] < -vx / 2) arr[j] += vx;
      if (arr[j + 1] > vy) arr[j + 1] -= vy;
      else if (arr[j + 1] < 0) arr[j + 1] += vy;
      if (arr[j + 2] > vz / 2) arr[j + 2] -= vz;
      else if (arr[j + 2] < -vz / 2) arr[j + 2] += vz;
    }
    pts.current.geometry.attributes.position.needsUpdate = true;
  });

  if (!tex) return null;
  return (
    <points ref={pts} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={mat}
        map={tex}
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Light shafts. True volumetrics need a raymarch; these are additive slabs
    with a soft edge and a dissolving far end, which is what the effect reads
    as at this distance for three transparent quads.
    ponytail: swap for a raymarched pass only if the shafts ever have to be
    occluded by geometry — these cannot be. */
function LightShafts({ alpha }: { alpha: MutableRefObject<number> }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const g = ctx.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    // Punch out the far end so the beam dissolves instead of stopping on a
    // hard line where the quad happens to end.
    const v = ctx.createLinearGradient(0, 0, 0, 64);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(0.55, "rgba(0,0,0,0.35)");
    v.addColorStop(1, "rgba(0,0,0,1)");
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: tex ?? undefined,
        color: "#ffc98a",
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [tex],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    material.opacity = alpha.current * 0.06;
  });

  if (!tex) return null;
  return (
    // Slanted the way the key light is: down and across from -x, so the
    // beams agree with the shadows already on the ground.
    <group rotation={[0, 0, -0.42]}>
      {[-26, -6, 14].map((z) => (
        <mesh key={z} material={material} position={[-14, 16, z]} rotation={[0, 0.3, 0]}>
          <planeGeometry args={[9, 46]} />
        </mesh>
      ))}
    </group>
  );
}

/** Lamp glow only: RenderPass → Bloom → Output. No depth of field — a
    defocus pass is the one effect that can only ever remove detail, and the
    truck has to stay sharp at every point on the scroll.

    The composer's own target carries 4x MSAA, because the canvas `antialias`
    flag applies to the default framebuffer and post-processing never touches
    it — without this, adding bloom silently costs you every edge.

    Rendering into that target also means the renderer skips tone mapping, so
    bloom thresholds against real HDR values and OutputPass tone maps exactly
    once at the end. */
function Effects({ progress }: { progress: MutableRefObject<number> }) {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  const dpr = useThree((st) => st.viewport.dpr);

  const { composer, bloom } = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    const comp = new EffectComposer(gl, target);
    comp.addPass(new RenderPass(scene, camera));
    // Tight radius and a threshold above the lit sky: only lamp filaments and
    // chrome highlights bloom. A wide radius here is indistinguishable from
    // a soft-focus filter over the whole frame.
    const glow = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.32, 1.05);
    comp.addPass(glow);
    comp.addPass(new OutputPass());
    return { composer: comp, bloom: glow };
  }, [gl, scene, camera]);

  useEffect(() => () => composer.dispose(), [composer]);

  useEffect(() => {
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
  }, [composer, size, dpr]);

  useFrame(() => {
    // Bloom earns its keep only once the lamps are the subject: near-nothing
    // in the day-lit dock, strongest at the dusk yard.
    const p = clamp01(progress.current);
    bloom.strength = 0.08 + smooth(clamp01((p - 0.26) / 0.5)) * 0.2;
    composer.render();
  }, 1);

  return null;
}

/** Soft contact shadow so the truck sits on the road rather than hovering. */
function ContactShadow() {
  const tex = useMemo(
    () =>
      radialTexture([
        [0, "rgba(0,0,0,0.68)"],
        [0.55, "rgba(0,0,0,0.3)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    [],
  );
  if (!tex) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -0.6]}>
      <planeGeometry args={[7.5, 12]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/** Drop an exported truck here and the rig uses it instead of the primitive
    build below — same camera, same lighting, same wheel-spin source. */
const TRUCK_GLB = "/models/truck.glb";

/** True once the asset is confirmed to exist. Probed with HEAD rather than
    imported, because a 404 inside useLoader throws into a canvas that has no
    error boundary — this way a missing model degrades instead of blanking. */
function useAsset(url: string) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch(url, { method: "HEAD" })
      .then((r) => {
        if (live) setOk(r.ok);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [url]);
  return ok;
}

/** The real model. Shadow flags and env intensity are forced on every mesh
    because exporters rarely set them, and the logo is applied to whichever
    material the exporter named for the flank livery. */
function ModelTruck({
  wheels,
  quality,
}: {
  wheels: MutableRefObject<THREE.Group | null>;
  quality: Quality;
}) {
  const gltf = useLoader(GLTFLoader, TRUCK_GLB);
  const shared = useLogo();
  // A clone, not the shared texture: glTF UVs need flipY off, and useLoader
  // hands back one cached object per URL — setting it here would have turned
  // every other decal in the scene upside down the moment a .glb appeared.
  const logo = useMemo(() => shared.clone(), [shared]);
  const model = useMemo(() => gltf.scene.clone(true), [gltf]);

  useEffect(() => {
    logo.flipY = false;
    logo.needsUpdate = true;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = quality === "high";
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (!mat) return;
      mat.envMapIntensity = 1.6;
      if (/livery|decal|logo|brand/i.test(mat.name || o.name)) {
        mat.map = logo;
        mat.needsUpdate = true;
      }
    });

    // Anything the exporter called a wheel joins the spin group, so the
    // rig's distance-derived rotation drives the real model untouched.
    // attach() rather than add() so world transforms survive the reparent.
    const rig = wheels.current;
    if (rig) {
      const found: THREE.Object3D[] = [];
      model.traverse((o) => {
        if (/wheel|tyre|tire/i.test(o.name)) found.push(o);
      });
      for (const o of found) rig.attach(o);
    }
  }, [model, logo, quality, wheels]);

  return (
    <>
      <ContactShadow />
      <primitive object={model} />
      <group ref={wheels} />
    </>
  );
}

function Truck(props: {
  wheels: MutableRefObject<THREE.Group | null>;
  doors: MutableRefObject<THREE.Group | null>;
  quality: Quality;
}) {
  const model = useAsset(TRUCK_GLB);
  if (!model) return <BuiltTruck {...props} />;
  // The primitive build is the fallback, so the hero never shows a hole
  // while a multi-megabyte .glb streams in.
  return (
    <Suspense fallback={<BuiltTruck {...props} />}>
      <ModelTruck wheels={props.wheels} quality={props.quality} />
    </Suspense>
  );
}

function BuiltTruck({
  wheels,
  doors,
  quality,
}: {
  wheels: MutableRefObject<THREE.Group | null>;
  doors: MutableRefObject<THREE.Group | null>;
  quality: Quality;
}) {
  const logo = useLogo();
  const rubber = useRubber();

  const cast = quality === "high";
  // 16 wheels, laid out like the real vehicle: twin steer axles running
  // single tyres, three rear axles running duals.
  const axles: Array<{ z: number; dual: boolean }> = [
    { z: 2.9, dual: false },
    { z: 1.5, dual: false },
    { z: -1.2, dual: true },
    { z: -2.4, dual: true },
    { z: -3.6, dual: true },
  ];

  return (
    <group>
      <ContactShadow />

      {/* Container body — clearcoat over the paint gives it a lacquered
          highlight that plain roughness cannot produce. */}
      <mesh position={[0, 2.5, -1.35]} castShadow={cast} receiveShadow={cast}>
        <Rounded w={2.6} h={2.85} d={7.3} r={0.09} />
        <meshPhysicalMaterial
          color={WHITE}
          roughness={0.42}
          metalness={0.08}
          clearcoat={0.55}
          clearcoatRoughness={0.28}
          envMapIntensity={0.9}
        />
      </mesh>
      {/* Body ribs + skirt */}
      {[-3.4, -1.8, -0.2, 1.4].map((z) => (
        <mesh key={z} position={[0, 2.5, z]}>
          <boxGeometry args={[2.66, 2.7, 0.07]} />
          <meshStandardMaterial color="#e4e1dd" roughness={0.6} metalness={0.1} />
        </mesh>
      ))}
      {[-1.34, 1.34].map((x) => (
        <mesh key={x} position={[x, 1.28, -1.35]}>
          <boxGeometry args={[0.09, 0.55, 7.1]} />
          <meshStandardMaterial color="#3a3a3f" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}

      {/* Livery panel, both flanks */}
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[side * 1.31, 2.62, -1.1]}
          rotation={[0, side * Math.PI * 0.5, 0]}
        >
          <planeGeometry args={[4.2, 1.54]} />
          {/* Standard, not basic: an unlit decal holds constant brightness
              while the panel around it moves through four lighting moods,
              which is what makes a livery read as a sticker. */}
          <meshStandardMaterial map={logo} roughness={0.42} metalness={0.08} {...DECAL} />
        </mesh>
      ))}

      {/* Rear doors, hinged at the outer edges. Phase 4 swings them open.
          Each leaf carries a hydraulic ram and a locking bar named for the
          rig, which extends the ram as the leaf swings — secondary motion is
          what stops a hinge reading as a flat rotate. */}
      <group ref={doors} position={[0, 2.5, -5.0]}>
        {[-1, 1].map((side) => (
          <group key={side} name={side > 0 ? "right" : "left"} position={[side * 1.28, 0, 0]}>
            <mesh position={[(-side * 1.28) / 1, 0, 0]} castShadow={cast}>
              <boxGeometry args={[2.56, 2.8, 0.1]} />
              <meshStandardMaterial color={WHITE} roughness={0.7} metalness={0.08} />
            </mesh>
            {/* Vertical locking bars */}
            {[0.45, 1.95].map((off) => (
              <mesh key={off} position={[-side * off, 0, -0.09]}>
                <cylinderGeometry args={[0.045, 0.045, 2.7, 8]} />
                <meshStandardMaterial color="#aeb4bc" roughness={0.18} metalness={1} envMapIntensity={2.2} />
              </mesh>
            ))}
            {/* Ram: a polished rod inside a body, scaled on Y by the rig. */}
            <group name="ram" position={[-side * 0.9, -0.95, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh>
                <cylinderGeometry args={[0.06, 0.06, 0.9, 8]} />
                <meshStandardMaterial color="#4a4e57" roughness={0.4} metalness={0.9} />
              </mesh>
              <mesh position={[0, 0.5, 0]}>
                <cylinderGeometry args={[0.035, 0.035, 0.8, 8]} />
                <meshStandardMaterial color="#dfe4ea" roughness={0.05} metalness={1} envMapIntensity={2.6} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      {/* Pallets on the container floor. The crates the forklift carries in
          during phase 1 land on these — see Warehouse. */}
      {[-4.1].map((z) => (
        <group key={z} position={[0, 1.28, z]}>
          <mesh castShadow={cast} receiveShadow={cast}>
            <boxGeometry args={[2.4, 0.09, 1.2]} />
            <meshStandardMaterial color="#9a7444" roughness={0.95} />
          </mesh>
          {[-0.95, 0, 0.95].map((x) => (
            <mesh key={x} position={[x, -0.08, 0]}>
              <boxGeometry args={[0.3, 0.1, 1.2]} />
              <meshStandardMaterial color="#7d5a34" roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Cab. Automotive paint is a dielectric with metallic flake in it,
          not a metal: at metalness 0.8 the base colour tints a mirror instead
          of colouring the surface, and a red cab came out closer to dark
          chrome than to red. Low metalness for the flake, clearcoat 1 for the
          lacquer, and the colour survives. */}
      <mesh position={[0, 2.1, 3.05]} castShadow={cast} receiveShadow={cast}>
        <Rounded w={2.5} h={2.1} d={2.3} r={0.16} />
        <meshPhysicalMaterial
          color={RED}
          roughness={0.28}
          metalness={0.15}
          clearcoat={1}
          clearcoatRoughness={0.05}
          envMapIntensity={2.0}
        />
      </mesh>
      {/* Cab interior. Widened and pushed back so it sits behind the side
          windows as well as the windscreen — transmission refracts what is
          behind the pane, and a pane with nothing behind it refracts the
          scenery on the far side of the truck. */}
      <mesh position={[0, 2.4, 3.3]}>
        <boxGeometry args={[2.34, 1.5, 2.0]} />
        <meshStandardMaterial color="#0e1013" roughness={0.9} />
      </mesh>
      {/* Seats and wheel, so the refraction lands on something with shape. */}
      {[-0.5, 0.5].map((x) => (
        <mesh key={`seat${x}`} position={[x, 2.15, 3.1]}>
          <boxGeometry args={[0.5, 0.7, 0.5]} />
          <meshStandardMaterial color="#1b1e24" roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[-0.5, 2.42, 3.7]} rotation={[1.15, 0, 0]}>
        <torusGeometry args={[0.19, 0.035, 8, 16]} />
        <meshStandardMaterial color="#17181b" roughness={0.7} />
      </mesh>
      {/* Mirrors */}
      {[-1.42, 1.42].map((x) => (
        <group key={x} position={[x, 2.72, 3.95]}>
          {/* Housing */}
          <mesh castShadow={cast}>
            <boxGeometry args={[0.1, 0.66, 0.22]} />
            <meshPhysicalMaterial
              color={RED}
              roughness={0.3}
              metalness={0.15}
              clearcoat={1}
              clearcoatRoughness={0.06}
            />
          </mesh>
          {/* Glass. A mirror is metalness 1 at near-zero roughness — that is
              the whole material, and it costs nothing extra. */}
          <mesh position={[x > 0 ? -0.055 : 0.055, 0, 0]}>
            <boxGeometry args={[0.012, 0.58, 0.19]} />
            <meshPhysicalMaterial
              color="#e8edf2"
              roughness={0.02}
              metalness={1}
              envMapIntensity={3.2}
            />
          </mesh>
          <mesh position={[0, 0, -0.3]}>
            <boxGeometry args={[0.07, 0.22, 0.42]} />
            <meshStandardMaterial color="#26282e" roughness={0.5} metalness={0.6} />
          </mesh>
        </group>
      ))}
      {/* Chrome exhaust stack and side fuel tank */}
      <mesh position={[1.38, 2.6, 2.1]}>
        <cylinderGeometry args={[0.11, 0.11, 2.6, 12]} />
        <meshStandardMaterial color="#cdd2d9" roughness={0.06} metalness={1} envMapIntensity={2.6} />
      </mesh>
      <mesh position={[-1.1, 1.15, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 1.2, 16]} />
        <meshStandardMaterial color="#b6bcc4" roughness={0.12} metalness={1} envMapIntensity={2.2} />
      </mesh>
      {/* Mudflaps */}
      {[-1.24, 1.24].map((x) => (
        <mesh key={x} position={[x, 0.42, -3.75]}>
          <boxGeometry args={[0.8, 0.72, 0.05]} />
          <meshStandardMaterial color="#141416" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 3.32, 2.75]} castShadow={cast}>
        <Rounded w={2.3} h={0.5} d={1.5} r={0.14} />
        <meshPhysicalMaterial
          color={RED}
          roughness={0.3}
          metalness={0.15}
          clearcoat={1}
          clearcoatRoughness={0.06}
        />
      </mesh>
      {/* Windscreen and side windows. */}
      <mesh position={[0, 2.5, 4.22]}>
        <boxGeometry args={[2.2, 0.95, 0.08]} />
        <meshPhysicalMaterial {...glass(quality, "#0a1216", 0.72)} />
      </mesh>
      {[-1.26, 1.26].map((x) => (
        <mesh key={`sw${x}`} position={[x, 2.52, 3.35]}>
          <boxGeometry args={[0.06, 0.78, 1.45]} />
          <meshPhysicalMaterial {...glass(quality, "#0a1216", 0.7)} />
        </mesh>
      ))}
      {/* Window rubbers, so the pane has an edge rather than floating in the
          panel. */}
      {[-1.24, 1.24].map((x) => (
        <mesh key={`swf${x}`} position={[x, 2.52, 3.35]}>
          <boxGeometry args={[0.03, 0.9, 1.6]} />
          <meshStandardMaterial color="#17181b" roughness={0.85} />
        </mesh>
      ))}
      {/* Chrome bumper and grille */}
      <mesh position={[0, 1.35, 4.2]}>
        <boxGeometry args={[2.4, 0.5, 0.24]} />
        <meshStandardMaterial color="#c9ced6" roughness={0.06} metalness={1} envMapIntensity={2.6} />
      </mesh>
      <mesh position={[0, 1.86, 4.18]}>
        <boxGeometry args={[2.1, 0.5, 0.16]} />
        <meshStandardMaterial color="#8e939b" roughness={0.3} metalness={0.95} />
      </mesh>
      {[-0.14, 0.02, 0.18].map((y) => (
        <mesh key={y} position={[0, 1.86 + y, 4.27]}>
          <boxGeometry args={[2.0, 0.06, 0.05]} />
          <meshStandardMaterial color="#d5dae1" roughness={0.05} metalness={1} envMapIntensity={2.6} />
        </mesh>
      ))}

      {/* Head and tail lamps. Emissive only — the glow is the bloom pass
          reading real HDR values, not a sprite pasted over the bodywork. A
          quad here sat between the camera and the cab and hazed the paint. */}
      {[-0.85, 0.85].map((x) => (
        <group key={`h${x}`}>
          {/* Emitter, recessed. */}
          <mesh position={[x, 1.6, 4.3]}>
            <boxGeometry args={[0.5, 0.24, 0.12]} />
            <meshStandardMaterial
              color="#fff3d8"
              emissive="#ffd9a0"
              emissiveIntensity={3.2}
              toneMapped={false}
            />
          </mesh>
          {/* Lens in front of it. The reflection off a clear cover is what
              identifies a headlamp when it is off, and what gives the flare
              an edge to catch when it is on. */}
          <mesh position={[x, 1.6, 4.375]}>
            <boxGeometry args={[0.54, 0.28, 0.04]} />
            <meshPhysicalMaterial {...glass(quality, "#dfeaf2", 0.3)} />
          </mesh>
        </group>
      ))}
      {[-1.0, 1.0].map((x) => (
        <group key={`t${x}`}>
          <mesh position={[x, 1.5, -5.06]}>
            <boxGeometry args={[0.34, 0.5, 0.08]} />
            <meshStandardMaterial
              color="#ff5a3c"
              emissive="#ff2f14"
              emissiveIntensity={2.8}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 1.02, 0.4]}>
        <boxGeometry args={[2.1, 0.42, 8.6]} />
        <meshStandardMaterial color={DARK} roughness={0.85} />
      </mesh>

      <group ref={wheels}>
        {axles.flatMap(({ z, dual }) =>
          [-1, 1].flatMap((side) =>
            // A dual axle is the same tyre twice, shoulder to shoulder.
            (dual ? [0.86, 1.26] : [1.24]).map((off) => (
              <group key={`${z}-${side}-${off}`} position={[side * off, 0.72, z]}>
                {/* Matte black rubber with a normal-mapped tread. The colour
                    can go this dark now that the tread carries real relief —
                    it is the grooves catching the sun that keep the tyre from
                    reading as a flat hole, not the base grey. */}
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow={cast}>
                  <cylinderGeometry args={[0.72, 0.72, 0.4, quality === "high" ? 22 : 10]} />
                  <meshStandardMaterial
                    color="#141518"
                    roughness={1}
                    metalness={0}
                    normalMap={rubber}
                    normalScale={new THREE.Vector2(1.4, 1.4)}
                  />
                </mesh>
                {/* Only the outer tyre of a pair shows a rim. */}
                {(!dual || off > 1.2) && (
                  <group position={[side * 0.21, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    <mesh>
                      <cylinderGeometry args={[0.42, 0.42, 0.04, quality === "high" ? 20 : 8]} />
                      <meshStandardMaterial
                        color="#ccd2d9"
                        roughness={0.2}
                        metalness={0.8}
                        envMapIntensity={2.6}
                      />
                    </mesh>
                    {/* Recessed hub: one extra ring is what stops a rim
                        reading as a flat silver disc. */}
                    <mesh position={[0, side * 0.012, 0]}>
                      <cylinderGeometry args={[0.24, 0.24, 0.05, quality === "high" ? 16 : 8]} />
                      <meshStandardMaterial
                        color="#8b9199"
                        roughness={0.3}
                        metalness={1}
                        envMapIntensity={1.8}
                      />
                    </mesh>
                  </group>
                )}
              </group>
            )),
          ),
        )}
      </group>
    </group>
  );
}

const HIVIS = "#f2b21a";

/** Glass. Transmission refracts whatever is actually behind the surface, so
    it is only an upgrade where something has been modelled back there. It is
    now: the cab carries an interior shell and each lamp has its emitter. On
    bare geometry the same setting shows the road straight through the truck,
    which is why this was held back until the interior existed.

    ponytail: transmissive materials make the renderer draw the scene a second
    time into a transmission buffer, on top of the composer's own passes — so
    phones keep the reflective dielectric, which reads nearly the same at the
    distance the hero ever shows the cab. */
function glass(quality: Quality, tint: string, opacity: number) {
  return quality === "high"
    ? {
        color: tint,
        roughness: 0.1,
        metalness: 0,
        transmission: 0.9,
        thickness: 0.4,
        ior: 1.52,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 3.2,
      }
    : {
        color: tint,
        roughness: 0.05,
        metalness: 0,
        ior: 1.52,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        transparent: true,
        opacity,
        envMapIntensity: 3.4,
      };
}

/** /logo.png has no alpha channel at all — it is an opaque RGB rectangle, a
    black badge on pure white. No material flag can cut that out, which is
    why the flanks showed a white line boxing the mark in. This is the
    matte-extracted version; regenerate it if the brand asset changes. */
const LOGO = "/logo-cutout.png";

/** Decal material settings, shared by every surface carrying the livery.
    alphaTest rather than plain blending: a matte cut-out has no soft edge
    worth preserving, and alphaTest keeps the decal in the opaque pass so it
    can never sort wrong against the panel behind it. polygonOffset stops the
    plane — which sits 1cm proud of the bodywork — from z-fighting it. */
const DECAL = {
  transparent: true,
  alphaTest: 0.5,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
} as const;

function useLogo() {
  const tex = useLoader(THREE.TextureLoader, LOGO);
  const aniso = useThree((st) => st.gl.capabilities.getMaxAnisotropy());
  tex.colorSpace = THREE.SRGBColorSpace;
  // The flanks are read at a grazing angle for most of the sequence. Without
  // anisotropic filtering the lettering smears into a grey band well before
  // it is small enough not to matter.
  if (tex.anisotropy !== aniso) {
    tex.anisotropy = aniso;
    tex.needsUpdate = true;
  }
  return tex;
}

/** A dock worker. Primitives, but posed and proportioned rather than stacked
    boxes: at this distance the read comes from the silhouette — hi-vis vest,
    hard hat, counter-swinging arms — not from polygon count.

    ponytail: no rig and no skinning. Limbs are two counter-phased sines on
    four groups, which is the whole of a walk cycle at this scale. A rigged
    .glb would need its own animation mixer and clip names to match; that is
    a real integration, not a drop-in, so it is not stubbed here. */
function Worker({ phase, vest = HIVIS }: { phase: number; vest?: string }) {
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const sw = Math.sin(clock.elapsedTime * 5.2 + phase) * 0.6;
    if (legL.current) legL.current.rotation.x = sw;
    if (legR.current) legR.current.rotation.x = -sw;
    // Arms opposing the legs is most of what sells a walk.
    if (armL.current) armL.current.rotation.x = -sw * 0.72;
    if (armR.current) armR.current.rotation.x = sw * 0.72;
  });

  return (
    <group>
      {[legL, legR].map((ref, i) => (
        <group key={i} ref={ref} position={[i ? 0.11 : -0.11, 0.82, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.56, 4, 8]} />
            <meshStandardMaterial color="#2f3a4a" roughness={0.88} />
          </mesh>
          <mesh position={[0, -0.76, 0.05]} castShadow>
            <boxGeometry args={[0.16, 0.1, 0.26]} />
            <meshStandardMaterial color="#191a1c" roughness={0.9} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 1.16, 0]} castShadow>
        <capsuleGeometry args={[0.165, 0.32, 4, 10]} />
        <meshStandardMaterial color="#3b4351" roughness={0.88} />
      </mesh>
      {/* Vest, slightly proud of the torso, plus its two retroreflective
          bands — the bands are what read as hi-vis under the dock lamps. */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.185, 0.26, 4, 10]} />
        <meshStandardMaterial color={vest} roughness={0.55} emissive={vest} emissiveIntensity={0.2} />
      </mesh>
      {[1.07, 1.23].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.191, 0.191, 0.045, 14, 1, true]} />
          <meshStandardMaterial
            color="#eef3f8"
            roughness={0.22}
            metalness={0.55}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {[armL, armR].map((ref, i) => (
        <group key={i} ref={ref} position={[i ? 0.235 : -0.235, 1.32, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.062, 0.38, 4, 8]} />
            <meshStandardMaterial color="#3b4351" roughness={0.88} />
          </mesh>
          <mesh position={[0, -0.48, 0]}>
            <sphereGeometry args={[0.062, 8, 6]} />
            <meshStandardMaterial color="#b98a68" roughness={0.75} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 1.47, 0]} castShadow>
        <sphereGeometry args={[0.098, 12, 10]} />
        <meshStandardMaterial color="#b98a68" roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.51, 0]} castShadow>
        <sphereGeometry args={[0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshPhysicalMaterial color="#ffd21e" roughness={0.3} clearcoat={0.7} envMapIntensity={1.4} />
      </mesh>
      <mesh position={[0, 1.508, 0.045]}>
        <cylinderGeometry args={[0.15, 0.15, 0.014, 16]} />
        <meshPhysicalMaterial color="#ffd21e" roughness={0.3} clearcoat={0.7} />
      </mesh>
    </group>
  );
}

/** Two-wheel sack truck with a carton strapped to the toe plate. */
function HandTrolley() {
  return (
    <group>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.62, -0.1]} rotation={[0, 0, 0.12]}>
          <boxGeometry args={[0.05, 1.2, 0.05]} />
          <meshStandardMaterial color="#8d939b" roughness={0.35} metalness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.16]}>
        <boxGeometry args={[0.52, 0.04, 0.34]} />
        <meshStandardMaterial color="#8d939b" roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[0, 1.18, -0.24]}>
        <boxGeometry args={[0.56, 0.05, 0.05]} />
        <meshStandardMaterial color="#22242a" roughness={0.8} />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.16, -0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 0.07, 12]} />
          <meshStandardMaterial color="#141416" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0.1]} castShadow>
        <boxGeometry args={[0.5, 0.68, 0.42]} />
        <meshStandardMaterial color="#c9a077" roughness={0.98} />
      </mesh>
    </group>
  );
}

/** Pallet racking down the walls: uprights, three beam levels, and pallets
    of stock on them. Empty walls are what makes a warehouse read as a shed. */
function Racking({
  bays,
  seed,
  ribs,
}: {
  bays: number;
  seed: number;
  ribs: THREE.Texture | null;
}) {
  const stock = useMemo(() => {
    const rand = prng(seed);
    const out: Array<{ x: number; y: number; wide: boolean; timber: boolean }> = [];
    for (let b = 0; b < bays; b++) {
      for (let lvl = 0; lvl < 3; lvl++) {
        if (rand() < 0.18) continue; // a few empty slots — a full rack looks fake
        out.push({
          x: b * 2.8 + 1.4,
          y: 0.1 + lvl * 2.05,
          wide: rand() > 0.45,
          timber: rand() > 0.5,
        });
      }
    }
    return out;
  }, [bays, seed]);

  return (
    <group>
      {Array.from({ length: bays + 1 }, (_, b) => (
        <mesh key={b} position={[b * 2.8, 3.1, 0]} castShadow>
          <boxGeometry args={[0.14, 6.2, 1.1]} />
          <meshStandardMaterial color="#3f6ea8" roughness={0.5} metalness={0.7} />
        </mesh>
      ))}
      {[0.1, 2.15, 4.2].map((y) =>
        [-0.42, 0.42].map((z) => (
          <mesh key={`${y}-${z}`} position={[(bays * 2.8) / 2, y, z]}>
            <boxGeometry args={[bays * 2.8, 0.12, 0.09]} />
            <meshStandardMaterial color="#e08a24" roughness={0.5} metalness={0.5} />
          </mesh>
        )),
      )}
      {stock.map((p, i) => (
        <group key={i} position={[p.x, p.y, 0]}>
          <mesh position={[0, 0.13, 0]}>
            <boxGeometry args={[1.9, 0.11, 0.95]} />
            <meshStandardMaterial color="#9a7444" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.72, 0]} castShadow>
            <boxGeometry args={[p.wide ? 1.85 : 1.3, 1.05, 0.9]} />
            <meshStandardMaterial
              color={p.timber ? "#b98a4e" : "#c9a077"}
              roughness={p.timber ? 0.9 : 0.98}
              normalMap={p.timber ? null : ribs}
              normalScale={new THREE.Vector2(0.3, 0.3)}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const FORKLIFT_GLB = "/models/forklift.glb";

/** Same optional-asset path as the truck: an exported forklift the moment
    one exists at FORKLIFT_GLB, the primitive build until then. */
function ModelForklift() {
  const gltf = useLoader(GLTFLoader, FORKLIFT_GLB);
  const model = useMemo(() => gltf.scene.clone(true), [gltf]);
  useEffect(() => {
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
  }, [model]);
  return <primitive object={model} />;
}

function Forklift({
  body,
  carriage,
}: {
  body: MutableRefObject<THREE.Group | null>;
  carriage: MutableRefObject<THREE.Group | null>;
}) {
  const model = useAsset(FORKLIFT_GLB);
  return (
    <group ref={body} position={[0, 0, -9]}>
      {model ? (
        <Suspense fallback={<BuiltForklift carriage={carriage} />}>
          <ModelForklift />
        </Suspense>
      ) : (
        <BuiltForklift carriage={carriage} />
      )}
    </group>
  );
}

/** Counterbalance forklift, forks forward (+Z). The carriage is its own
    group so the rig can raise it with the crate instead of the crate
    levitating off a static pair of tines. */
function BuiltForklift({ carriage }: { carriage: MutableRefObject<THREE.Group | null> }) {
  return (
    <group>
      {/* Counterweight body and operator cage */}
      <mesh position={[0, 0.95, -0.45]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.2, 2.3]} />
        <meshPhysicalMaterial
          color="#e08a24"
          roughness={0.34}
          metalness={0.3}
          clearcoat={0.8}
          clearcoatRoughness={0.22}
          envMapIntensity={1.5}
        />
      </mesh>
      <mesh position={[0, 1.72, -1.25]} castShadow>
        <meshPhysicalMaterial
          color="#c4761c"
          roughness={0.38}
          metalness={0.25}
          clearcoat={0.7}
          clearcoatRoughness={0.25}
          envMapIntensity={1.4}
        />
        <boxGeometry args={[1.36, 0.8, 0.75]} />
      </mesh>
      <mesh position={[0, 1.62, -0.35]}>
        <boxGeometry args={[1.1, 0.7, 0.9]} />
        <meshStandardMaterial color="#26282e" roughness={0.5} />
      </mesh>
      {/* Operator, seated. Built inline rather than reusing <Worker>: a
          seated figure has no walk cycle and no standing legs, so sharing the
          component would mean a pose flag and two dead limb groups. */}
      <group position={[0, 1.66, -0.34]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.165, 0.3, 4, 10]} />
          <meshStandardMaterial color="#3b4351" roughness={0.88} />
        </mesh>
        <mesh castShadow>
          <capsuleGeometry args={[0.185, 0.24, 4, 10]} />
          <meshStandardMaterial color={HIVIS} roughness={0.55} emissive={HIVIS} emissiveIntensity={0.2} />
        </mesh>
        {/* Thighs forward, shins down — seated at the wheel. */}
        {[-0.11, 0.11].map((x) => (
          <group key={x} position={[x, -0.2, 0]}>
            <mesh position={[0, -0.05, 0.22]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <capsuleGeometry args={[0.085, 0.36, 4, 8]} />
              <meshStandardMaterial color="#2f3a4a" roughness={0.88} />
            </mesh>
            <mesh position={[0, -0.36, 0.42]} castShadow>
              <capsuleGeometry args={[0.08, 0.3, 4, 8]} />
              <meshStandardMaterial color="#2f3a4a" roughness={0.88} />
            </mesh>
          </group>
        ))}
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.02, 0.24]} rotation={[1.15, 0, 0]} castShadow>
            <capsuleGeometry args={[0.06, 0.34, 4, 8]} />
            <meshStandardMaterial color="#3b4351" roughness={0.88} />
          </mesh>
        ))}
        <mesh position={[0, 0.32, 0]} castShadow>
          <sphereGeometry args={[0.098, 12, 10]} />
          <meshStandardMaterial color="#b98a68" roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.36, 0]} castShadow>
          <sphereGeometry args={[0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial color="#ffd21e" roughness={0.3} clearcoat={0.7} />
        </mesh>
        <mesh position={[0, 0.358, 0.045]}>
          <cylinderGeometry args={[0.15, 0.15, 0.014, 16]} />
          <meshPhysicalMaterial color="#ffd21e" roughness={0.3} clearcoat={0.7} />
        </mesh>
      </group>
      {[-0.6, 0.6].map((x) => (
        <mesh key={`p${x}`} position={[x, 2.35, -0.35]}>
          <boxGeometry args={[0.08, 1.4, 0.08]} />
          <meshStandardMaterial color="#3a3d44" roughness={0.6} metalness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 3.06, -0.35]} castShadow>
        <boxGeometry args={[1.36, 0.09, 1.1]} />
        <meshStandardMaterial color="#3a3d44" roughness={0.6} metalness={0.6} />
      </mesh>
      {/* Mast rails */}
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x, 1.9, 0.9]} castShadow>
          <boxGeometry args={[0.13, 3.6, 0.16]} />
          <meshStandardMaterial color="#4a4e57" roughness={0.45} metalness={0.75} />
        </mesh>
      ))}
      {/* Carriage: backrest plus tines, raised by the rig. */}
      <group ref={carriage} position={[0, 0.3, 0]}>
        <mesh position={[0, 0.55, 1.02]}>
          <boxGeometry args={[1.0, 1.0, 0.08]} />
          <meshStandardMaterial color="#4a4e57" roughness={0.5} metalness={0.7} />
        </mesh>
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, 0.05, 2.0]} castShadow>
            <boxGeometry args={[0.16, 0.08, 2.0]} />
            <meshStandardMaterial color="#9aa0a8" roughness={0.3} metalness={0.9} />
          </mesh>
        ))}
        {/* The pallet rides the tines, and the crate rides the pallet. It is
            the layer that was missing: crates were sitting 0.24 below the
            tine tops, which is to say the steel passed through them. */}
        <mesh position={[0, 0.145, 1.95]} castShadow receiveShadow>
          <boxGeometry args={[1.2, 0.11, 1.15]} />
          <meshStandardMaterial color="#9a7444" roughness={0.95} />
        </mesh>
        {[-0.45, 0, 0.45].map((x) => (
          <mesh key={`pb${x}`} position={[x, 0.065, 1.95]}>
            <boxGeometry args={[0.22, 0.09, 1.15]} />
            <meshStandardMaterial color="#7d5a34" roughness={0.95} />
          </mesh>
        ))}
      </group>
      {/* Big drive wheels front, small steer wheels back. */}
      {[
        [-0.68, 0.42, 0.5],
        [0.68, 0.42, 0.5],
        [-0.6, 0.3, -1.35],
        [0.6, 0.3, -1.35],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[y, y, 0.26, 14]} />
          <meshStandardMaterial color="#141416" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Where each crate ends up on the container's two pallets — four on the
    deck, one stacked on top. Truck-local coordinates. */
/** Where the forklift parks to load: mast at -5.07, a hand's width outside
    the container opening at -5.00. It cannot go further in — the mast is
    taller than the opening and the counterweight would be inside the
    trailer. */
const DOOR_Z = -6.05;

/** Offset of the pallet on the tines, in forklift-local space. Every slot's
    z is DOOR_Z + PALLET_Z, because that is simply where a pallet ends up
    when a forklift parked at the door sets it down. Slots chosen anywhere
    else are slots the machine cannot reach, and the crate has to fly the
    last stretch on its own to get there. */
const PALLET_Z = 1.95;

/** Two wide, two high, one bay deep. */
const SLOTS: Array<[number, number, number]> = [
  [-0.62, 1.85, DOOR_Z + PALLET_Z],
  [0.62, 1.85, DOOR_Z + PALLET_Z],
  [-0.62, 2.9, DOOR_Z + PALLET_Z],
  [0.62, 2.9, DOOR_Z + PALLET_Z],
];

/** Where each crate waits its turn on the dock floor. */
const STACK: Array<[number, number]> = [
  [-6.4, -12.4],
  [-7.35, -13.3],
  [-6.4, -14.2],
  [-7.35, -15.1],
];

/** Crew walking legs: [fromX, fromZ, toX, toZ, speed, phase offset]. */
const CREW: Array<[number, number, number, number, number, number]> = [
  // Index 0 is the sack-truck worker on purpose: the frame loop pairs child
  // index with CREW index, and this is the one that survives the phone cut.
  [7.8, -11.5, 3.2, -7.6, 0.11, 1.35], // sack truck, opposite flank
  [-13.5, -13.2, -5.2, -13.2, 0.14, 0], // along the racking, behind the lane
  [9.5, -13, 9.5, -7.4, 0.19, 0.7], // far side, clear of everything
];

/** Dock, shell, forklift and the crates loaded during phase 1. */
function Warehouse({
  progress,
  quality,
}: {
  progress: MutableRefObject<number>;
  quality: Quality;
}) {
  const lite = quality === "low";
  const crates = useRef<THREE.Group>(null);
  const lift = useRef<THREE.Group>(null);
  const forks = useRef<THREE.Group>(null);
  const crew = useRef<THREE.Group>(null);
  const ribs = useCorrugation();
  const concrete = useAsphalt(9);
  const haze = useRef(0);
  const hazard = useHazard();
  const logo = useLogo();
  const flute = useCorrugation();
  // One decal material for every carton face — twenty planes, one material.
  const brand = useMemo(
    () => new THREE.MeshStandardMaterial({ map: logo, roughness: 0.95, ...DECAL }),
    [logo],
  );
  useEffect(() => () => brand.dispose(), [brand]);

  useFrame(({ clock }) => {
    const p = progress.current;
    const t = clamp01((p - 0.02) / 0.215);

    // Crew. Each walks a leg back and forth on its own beat; a triangle wave
    // gives the turn-around for free and the sign of it gives the facing.
    // Nobody's path crosses the bay mouth at z > -6.4 — that lane belongs to
    // the forklift, and two things sharing it would intersect.
    if (crew.current) {
      const now = clock.elapsedTime;
      crew.current.children.forEach((w, i) => {
        const [ax, az, bx, bz, speed, off] = CREW[i];
        const u = (((now * speed + off) % 2) + 2) % 2;
        const fwd = u < 1;
        const k = fwd ? u : 2 - u;
        w.position.x = THREE.MathUtils.lerp(ax, bx, k);
        w.position.z = THREE.MathUtils.lerp(az, bz, k);
        w.rotation.y = Math.atan2(bx - ax, bz - az) + (fwd ? 0 : Math.PI);
      });
    }
    // Dust only exists while the dock is on screen — carrying it down the
    // highway would be two hundred points integrated for nothing.
    haze.current = 1 - smooth(clamp01((p - 0.28) / 0.09));
    if (crates.current) {
      // The crates live in the world group but end up on the truck's pallets,
      // and the truck does not move — the world slides under it. So once a
      // crate is loaded (ct = 1) it has to cancel the world transform, or it
      // gets left standing at the dock when the truck pulls away.
      const slide = travelled(p);
      const arc = bend(p) * BEND_X;
      // The truck's full pose, so cargo that is already aboard can be placed
      // from it. Compensating only for the world slide left the crates
      // standing at the origin while the truck turned and reversed away —
      // the load visibly stayed behind at the yard.
      const pk = park(p);
      const yaw = drift(p) + pk.yaw;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      // One forklift, so one crate at a time — the old windows overlapped
      // five deep, which is why the boxes had to fly: there was no machine
      // free to carry them.
      const N = SLOTS.length;
      const cyc = 1 / N;
      const active = Math.min(N - 1, Math.floor(t / cyc));
      const k = clamp01((t - active * cyc) / (cyc * 0.95));

      // The forklift's pose is the single source of truth. Everything the
      // crate does is read off it, so the two cannot drift apart.
      const [sx, sz] = STACK[active];
      const [ax, ay] = SLOTS[active];
      const out = smooth(clamp01((k - 0.15) / 0.4)); // stack -> door
      const home = smooth(clamp01((k - 0.65) / 0.35)); // door -> stack
      const along = out - home;
      const rise = smooth(clamp01((k - 0.2) / 0.3));
      const drop = smooth(clamp01((k - 0.62) / 0.15));

      const fx = THREE.MathUtils.lerp(sx, ax, along);
      const fz = THREE.MathUtils.lerp(sz, DOOR_Z, along);
      const fyaw = (1 - along) * -0.85;
      const forkY = THREE.MathUtils.lerp(0.05, ay - 0.725, rise - drop);

      if (lift.current && forks.current) {
        lift.current.position.set(fx, 0, fz);
        lift.current.rotation.y = fyaw;
        forks.current.position.y = forkY;
      }

      crates.current.children.forEach((crate, i) => {
        const [tx, ty, tz] = SLOTS[i];

        // Placed: rides the truck from here, yard manoeuvre included.
        if (i < active || (i === active && k >= 0.6)) {
          crate.position.set(
            pk.x + tx * cy + tz * sy + arc,
            ty,
            pk.z - tx * sy + tz * cy + slide,
          );
          crate.rotation.y = yaw;
          return;
        }

        // Waiting its turn on the dock floor.
        if (i > active || k < 0.15) {
          crate.position.set(STACK[i][0], 0.635, STACK[i][1]);
          crate.rotation.y = 0.55;
          return;
        }

        // On the forks. Derived from the forklift's pose rather than
        // animated alongside it — the box is on the pallet by construction,
        // and no amount of retiming can shake it loose.
        crate.position.set(
          fx + PALLET_Z * Math.sin(fyaw),
          forkY + 0.725,
          fz + PALLET_Z * Math.cos(fyaw),
        );
        crate.rotation.y = fyaw;
      });
    }
  });

  return (
    <group position={[0, 0, WAREHOUSE_Z]}>
      <mesh position={[0, 7, -16]}>
        <boxGeometry args={[46, 15, 1]} />
        <meshStandardMaterial color="#15161c" roughness={0.95} />
      </mesh>
      {[-19, 19].map((x) => (
        <mesh key={x} position={[x, 7, -2]}>
          <boxGeometry args={[1, 15, 30]} />
          <meshStandardMaterial color="#15161c" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 14.2, -2]}>
        <boxGeometry args={[40, 1, 30]} />
        <meshStandardMaterial color="#101116" roughness={1} />
      </mesh>

      {/* Concrete bay floor — poured slab with expansion joints, so the dock
          reads as an industrial building rather than a hole in the road. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -2]} receiveShadow>
        <planeGeometry args={[38, 34]} />
        <meshStandardMaterial
          color="#6b6862"
          roughness={0.78}
          metalness={0.12}
          envMapIntensity={0.9}
          normalScale={new THREE.Vector2(0.5, 0.5)}
          {...(concrete ?? {})}
        />
      </mesh>
      {[-12, -4, 4, 12].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, -2]}>
          <planeGeometry args={[0.12, 34]} />
          <meshStandardMaterial color="#4c4a45" roughness={1} />
        </mesh>
      ))}

      {/* A row of dock bays, not one hole in a wall. The truck occupies the
          middle one; the neighbours give the building a reason to be this
          wide and read as a working godown. */}
      {[-13.5, 0, 13.5].map((bay) => (
        <group key={bay} position={[bay, 0, 11]}>
          {[-4.6, 4.6].map((x) => (
            <mesh key={x} position={[x, 4.5, 0]} castShadow>
              <boxGeometry args={[0.55, 9, 0.55]} />
              <meshStandardMaterial color="#2c2e36" roughness={0.8} />
            </mesh>
          ))}
          <mesh position={[0, 9.1, 0]}>
            <boxGeometry args={[9.8, 0.55, 0.55]} />
            <meshStandardMaterial color="#2c2e36" roughness={0.8} />
          </mesh>
          {/* Roller shutter, down on the bays nobody is working. */}
          {bay !== 0 && (
            <mesh position={[0, 4.6, -0.3]}>
              <boxGeometry args={[8.9, 8.8, 0.12]} />
              <meshStandardMaterial color="#7d8189" roughness={0.55} metalness={0.6} />
            </mesh>
          )}
        </group>
      ))}

      {/* Pallet racking down the back wall and the near return. */}
      <group position={[0, 0, -WAREHOUSE_Z]}>
        <group position={[-16.4, 0, -14.6]}>
          <Racking bays={lite ? 6 : 11} seed={5501} ribs={ribs} />
        </group>
        {!lite && (
          <>
            <group position={[-17.4, 0, -18]} rotation={[0, Math.PI / 2, 0]}>
              <Racking bays={4} seed={9902} ribs={ribs} />
            </group>
            <group position={[9.6, 0, -14.6]}>
              <Racking bays={3} seed={3310} ribs={ribs} />
            </group>
          </>
        )}
      </group>

      {/* Dock leveller: the hinged plate that bridges the bay floor to the
          trailer sill. Without it the forklift drives at a floating deck. */}
      <group position={[0, 0, -WAREHOUSE_Z]}>
        <mesh position={[0, 0.66, -6.3]} rotation={[-0.19, 0, 0]} receiveShadow>
          <boxGeometry args={[2.5, 0.12, 2.7]} />
          <meshStandardMaterial color="#5b5f66" roughness={0.55} metalness={0.7} />
        </mesh>
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 0.55, -6.6]} castShadow receiveShadow>
            <boxGeometry args={[0.35, 1.1, 2.2]} />
            <meshStandardMaterial color="#2a2c32" roughness={0.9} />
          </mesh>
        ))}
        {/* Striped kerbs marking the bay edge. */}
        {[-2.6, 2.6].map((x) => (
          <mesh key={`k${x}`} position={[x, 0.18, -6.0]} castShadow receiveShadow>
            <boxGeometry args={[0.5, 0.36, 4.2]} />
            <meshStandardMaterial map={hazard ?? undefined} roughness={0.6} metalness={0.15} />
          </mesh>
        ))}
      </group>

      {/* Overhead bay lamps — warm, and visible as fixtures rather than as
          light arriving from nowhere. */}
      {[-8, 0, 8].map((x) => (
        <group key={x} position={[x, 9.4, -4]}>
          <mesh>
            <boxGeometry args={[2.6, 0.3, 1.1]} />
            <meshStandardMaterial color="#33353c" roughness={0.7} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[2.3, 0.08, 0.85]} />
            <meshStandardMaterial
              color="#fff2d4"
              emissive="#ffd79a"
              emissiveIntensity={5}
            />
          </mesh>
          <pointLight position={[0, -1, 0]} color="#ffcf94" intensity={170} distance={26} />
        </group>
      ))}
      <pointLight position={[0, 5, 10]} color="#ffdcae" intensity={220} distance={44} />

      {/* Motes hanging in the dock lights, over the bay the forklift works. */}
      <group position={[-3, 0, -3]}>
        <Dust
          count={lite ? 60 : 220}
          volume={[30, 11, 26]}
          drift={[0.18, 0.05, 0]}
          color="#ffdcae"
          size={0.09}
          alpha={haze}
          seed={7741}
        />
      </group>

      <group position={[0, 0, -WAREHOUSE_Z]}>
        {/* Dock crew. The third pushes a sack truck between the racking and
            the bay; the forklift operator rides inside <Forklift>. */}
        <group ref={crew}>
          <group>
            <Worker phase={4.3} />
            <group position={[0, 0, 0.62]}>
              <HandTrolley />
            </group>
          </group>
          {!lite && (
            <>
              <group>
                <Worker phase={0} />
              </group>
              <group>
                <Worker phase={2.1} vest="#f26a1a" />
              </group>
            </>
          )}
        </group>

        <Forklift body={lift} carriage={forks} />
        <group ref={crates}>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} position={[-7, 0.8, -13]}>
              <mesh castShadow receiveShadow>
                <Rounded w={1.15} h={1.05} d={1.15} r={0.04} />
                {/* Alternating timber crates and cardboard cartons. */}
                {/* Timber stays matte and rough; the cartons carry the
                    flute relief that separates board from painted wood. */}
                <meshStandardMaterial
                  color={i % 2 ? "#b98a4e" : "#c9a077"}
                  roughness={i % 2 ? 0.9 : 0.98}
                  metalness={0}
                  normalMap={i % 2 ? null : flute}
                  normalScale={new THREE.Vector2(0.35, 0.35)}
                />
              </mesh>
              {/* Cartons carry the shipper's mark on all four flanks — an
                  unbranded brown box is what makes cargo read as filler. */}
              {i % 2 === 0 &&
                [0, 1, 2, 3].map((f) => (
                  <group key={f} rotation={[0, (f * Math.PI) / 2, 0]}>
                    <mesh position={[0, 0.05, 0.579]}>
                      <planeGeometry args={[0.8, 0.3]} />
                      <primitive object={brand} attach="material" />
                    </mesh>
                  </group>
                ))}
            </group>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Multi-lane asphalt, lane dashes and glowing edge markers. */
function Road({ quality }: { quality: Quality }) {
  const asphalt = useAsphalt(90);
  const step = quality === "high" ? 11 : 20;
  // Laid out ahead of the truck: the route runs +Z from the dock at -20 to
  // the yard at +380, so the carriageway has to cover that, not its mirror.
  const dashZ = useMemo(
    () => Array.from({ length: Math.ceil(500 / step) }, (_, i) => -26 + i * step),
    [step],
  );
  const markers = useMemo(
    () =>
      Array.from(
        { length: quality === "high" ? 30 : 16 },
        (_, i) => -24 + i * (quality === "high" ? 16 : 30),
        // Highway furniture ends at the terminal gate. Carrying it into the
        // yard put a rail across the lane the truck turns and reverses in.
      ).filter((z) => z < RAIL_END),
    [quality],
  );

  return (
    <group>
      {/* Terrain the road sits on. */}
      {/* Dry ground, out to the quay line at x = 60. It overhangs the water
          (which starts at x = 50) rather than abutting it — meeting exactly
          would leave a see-through gap at the shoreline from any high shot. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-85, -0.04, 190]}>
        <planeGeometry args={[290, 620]} />
        <meshStandardMaterial color="#4b4436" roughness={1} envMapIntensity={0.4} />
      </mesh>
      {/* Quay wall down to the waterline. */}
      <mesh position={[60.4, -2, 190]} receiveShadow>
        <boxGeometry args={[1.6, 4.2, 620]} />
        <meshStandardMaterial color="#3d3a34" roughness={0.95} />
      </mesh>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 190]}
        receiveShadow={quality === "high"}
      >
        <planeGeometry args={[17, 460]} />
        {/* Damp asphalt: low-ish roughness plus a little metalness gives the
            surface a specular sheen that reads as wet, without the cost of a
            real reflection pass. */}
        <meshStandardMaterial
          color="#3e3f47"
          roughness={0.62}
          metalness={0.42}
          envMapIntensity={2.1}
          normalScale={new THREE.Vector2(0.55, 0.55)}
          {...(asphalt ?? {})}
        />
      </mesh>
      {[-11, 11].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, 190]}>
          <planeGeometry args={[6, 460]} />
          <meshStandardMaterial color="#2a2c28" roughness={1} />
        </mesh>
      ))}
      {/* Lane separators — a multi-lane carriageway, not a single track.
          Fixed length: stretching these with speed was a fake blur, and it
          is the first thing that reads as soft on a still frame. */}
      {dashZ.map((z) =>
        [-4.4, 1.2].map((x) => (
          <mesh key={`${z}-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.03, z]}>
            <planeGeometry args={[0.24, 4.2]} />
            {/* Standard, not basic: unlit white held full brightness through
                dusk while the tarmac around it darkened, so the markings
                looked lit from within. Road paint is a rough surface. */}
            <meshStandardMaterial color="#e9e6df" roughness={0.72} metalness={0} />
          </mesh>
        )),
      )}
      {/* Metal guardrails, unbroken along both shoulders — and stopping at
          the yard entrance, where a real terminal opens out. */}
      {[-9.4, 9.4].map((x) => (
        <mesh key={`rail${x}`} position={[x, 0.82, (RAIL_END - 40) / 2]}>
          <boxGeometry args={[0.1, 0.34, RAIL_END + 40]} />
          <meshStandardMaterial
            color="#b6bac0"
            roughness={0.3}
            metalness={0.95}
            envMapIntensity={2.4}
          />
        </mesh>
      ))}
      <group>
        {markers.map((z) =>
          [-9.4, 9.4].map((x) => (
            <mesh key={`g${z}-${x}`} position={[x, 0.42, z]}>
              <boxGeometry args={[0.12, 0.84, 0.12]} />
              <meshStandardMaterial color="#6d7076" roughness={0.45} metalness={0.8} />
            </mesh>
          )),
        )}
        {markers.map((z) =>
          [-8.2, 8.2].map((x) => (
            <mesh key={`${z}-${x}`} position={[x, 0.35, z]}>
              <boxGeometry args={[0.16, 0.7, 0.16]} />
              <meshStandardMaterial
                color="#f28c28"
                emissive="#f28c28"
                emissiveIntensity={2.2}
                toneMapped={false}
              />
            </mesh>
          )),
        )}
      </group>
    </group>
  );
}

/** Open water. The swell is displaced in the vertex shader off three crossed
    sines, with the normal taken analytically from the same field.

    The CPU version this replaces rewrote two thousand vertices and called
    computeVertexNormals() on the main thread every frame — it was the single
    most expensive thing in the scene, and it capped the mesh resolution at
    the point where the swell read as faceted. */
function useOcean() {
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: "#0f5f88",
      roughness: 0.12,
      metalness: 0.55,
      envMapIntensity: 2.6,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uTime;
float waveH(vec2 p) {
  return sin(p.x * 0.09 + uTime * 1.10) * 0.90
       + sin(p.y * 0.13 - uTime * 0.80) * 0.60
       + sin((p.x + p.y) * 0.05 + uTime * 0.50) * 1.20;
}`,
        )
        // Injected here, before <normal_vertex> runs, so three's own chunk
        // builds vNormal from our normal — no varying is redeclared and no
        // define path can be missed.
        .replace(
          "#include <beginnormal_vertex>",
          `float wH = waveH(position.xy);
float wE = 1.5;
vec3 wT1 = vec3(wE, 0.0, waveH(position.xy + vec2(wE, 0.0)) - wH);
vec3 wT2 = vec3(0.0, wE, waveH(position.xy + vec2(0.0, wE)) - wH);
vec3 objectNormal = normalize(cross(wT1, wT2));`,
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = vec3(position);
transformed.z += waveH(position.xy);`,
        );
      m.userData.shader = shader;
    };
    return m;
  }, []);

  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => {
    const shader = material.userData.shader as { uniforms: Record<string, THREE.IUniform> } | undefined;
    if (shader) shader.uniforms.uTime.value = clock.elapsedTime;
  });

  return material;
}

/** Terrain passed during transit: a bluff and the open sea beyond it. */
function Coast({
  quality,
  progress,
}: {
  quality: Quality;
  progress: MutableRefObject<number>;
}) {
  const shafts = useRef(0);
  const ocean = useOcean();
  // Displacement is on the GPU now, so the grid can be dense enough that the
  // swell reads as water rather than as folded paper.
  const seg = quality === "high" ? 110 : 36;

  useFrame(() => {
    shafts.current = bend(progress.current);
  });

  return (
    <group position={[0, 0, COAST_Z]}>
      {/* Bluff between the carriageway and the shore. Kept short in Z so it
          stops well before the yard, which occupies the same flank. */}
      <mesh position={[30, -4, -40]} rotation={[0, 0, -0.22]} receiveShadow>
        <boxGeometry args={[14, 9, 150]} />
        <meshStandardMaterial color="#4a4238" roughness={0.95} />
      </mesh>
      {/* Open water, starboard side — the shoreline lands at x = 50, where
          the ground plane ends, so the two meet without a gap. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[172, -3.5, 40]}
        material={ocean}
      >
        <planeGeometry args={[244, 420, seg, seg]} />
      </mesh>
      <LightShafts alpha={shafts} />
    </group>
  );
}

/** Quay crew walking legs, in port-local coordinates:
    [fromX, fromZ, toX, toZ, speed, phase]. Kept out of z = 7.1..12.3, which
    is the lane the truck reverses into. */
const GANG: Array<[number, number, number, number, number, number]> = [
  // z = 15.5 is a clear aisle: container rows sit at 10.75-13.25 and
  // 17.95-20.45, the portal legs at 13.45-14.55, the truck at 7.1-9.7.
  [17, 15.5, 26, 15.5, 0.16, 0],
  // Past the far container column, on the open quay.
  [46, 6, 46, 16, 0.12, 1.1],
];

/** A moored container ship: hull with a raked bow and a boot-top stripe,
    accommodation block and funnel aft, and deck bays stacked with boxes.
    The silhouette is what identifies a ship at this distance — hull line,
    a block at one end, a funnel above it — so that is what gets the detail. */
function CargoShip({
  position,
  length,
  seed,
  ribs,
  lite = false,
}: {
  position: [number, number, number];
  length: number;
  seed: number;
  ribs: THREE.Texture | null;
  lite?: boolean;
}) {
  const beam = 17;
  const deck = 9.4;

  const bays = useMemo(() => {
    const rand = prng(seed);
    const palette = ["#b8532f", "#2f6fb8", "#c9922f", "#3f8a52", "#8a3f6d", "#31556e"];
    const out: Array<{ x: number; y: number; z: number; color: string }> = [];
    // Deck cargo is most of the ship's draw calls. On a phone the stacks
    // read from the silhouette alone, so keep the top box of each and drop
    // the rest — the hull and the block are what identify it.
    const rows = Math.floor((length * 0.52) / (lite ? 14 : 7));
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c <= 1; c++) {
        for (let k = 0, h = 1 + Math.floor(rand() * (lite ? 1 : 4)); k < h; k++) {
          out.push({
            x: c * 5.3,
            y: deck + 1.3 + k * 2.6,
            z: -length * 0.18 + r * (lite ? 14 : 7),
            color: palette[Math.floor(rand() * palette.length)],
          });
        }
      }
    }
    return out;
  }, [seed, length, lite]);

  return (
    <group position={position}>
      {/* Hull, plus a box turned 45° at the head so the bow comes to a point
          instead of ending square. */}
      <mesh position={[0, 4.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[beam, deck, length * 0.8]} />
        <meshStandardMaterial color="#1b2b36" roughness={0.68} metalness={0.4} envMapIntensity={1.3} />
      </mesh>
      <mesh position={[0, 4.6, length * 0.4]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[beam * 0.72, deck, beam * 0.72]} />
        <meshStandardMaterial color="#1b2b36" roughness={0.68} metalness={0.4} envMapIntensity={1.3} />
      </mesh>
      {/* Boot-top: the red band at the waterline that says "loaded ship". */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[beam + 0.12, 2.4, length * 0.805]} />
        <meshStandardMaterial color="#7d2c22" roughness={0.85} metalness={0.15} />
      </mesh>
      <mesh position={[0, 9.3, 0]} receiveShadow>
        <boxGeometry args={[beam - 0.6, 0.4, length * 0.79]} />
        <meshStandardMaterial color="#5c5f63" roughness={0.85} />
      </mesh>

      {/* Accommodation block and funnel, aft. */}
      <mesh position={[0, deck + 4.4, -length * 0.3]} castShadow>
        <boxGeometry args={[12.5, 9.2, 11]} />
        <meshStandardMaterial color="#dcd8d0" roughness={0.8} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[0, deck + 2.2 + i * 2.4, -length * 0.3 + 5.55]}>
          <planeGeometry args={[11.4, 1.1]} />
          <meshStandardMaterial color="#16222b" roughness={0.1} metalness={0.4} envMapIntensity={2.4} />
        </mesh>
      ))}
      <mesh position={[0, deck + 11.6, -length * 0.33]} castShadow>
        <boxGeometry args={[5.2, 5.4, 4.4]} />
        <meshStandardMaterial color="#26303a" roughness={0.7} metalness={0.3} />
      </mesh>
      <mesh position={[0, deck + 12.4, -length * 0.33]}>
        <boxGeometry args={[5.35, 1.5, 4.55]} />
        <meshStandardMaterial color="#c2542c" roughness={0.7} />
      </mesh>

      {/* Deck cargo. */}
      {bays.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} castShadow receiveShadow>
          <boxGeometry args={[5.1, 2.5, 6.4]} />
          <meshStandardMaterial
            color={c.color}
            roughness={0.58}
            metalness={0.4}
            envMapIntensity={1.1}
            normalMap={ribs}
            normalScale={new THREE.Vector2(1, 1)}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Shipment yard: gantries, a stacked container field and the ships. */
function Port({
  quality,
  progress,
}: {
  quality: Quality;
  progress: MutableRefObject<number>;
}) {
  const hazard = useHazard();
  const link = useChainLink();
  const boom = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const ropes = useRef<THREE.Group>(null);
  const loadX = useRef(-16);
  const spreader = useRef<THREE.Group>(null);
  const box = useRef<THREE.Group>(null);
  const gang = useRef<THREE.Group>(null);

  // Unloading, once the truck has stopped. One move: the spreader comes
  // down beside the trailer, latches, lifts clear, and the trolley runs it
  // out over the stacks on the quay side.
  useFrame(({ clock }, delta) => {
    // Starts once the reverse has finished and the doors are open.
    const u = clamp01((progress.current - 0.925) / 0.075);
    const down = smooth(clamp01(u / 0.3));
    const rise = smooth(clamp01((u - 0.36) / 0.24));
    const across = smooth(clamp01((u - 0.62) / 0.38));

    // Crane-local: the group sits at x = 21. The truck parks at x = 20
    // heading -X, so its rear doorway lands at world x = 25 — crane-local
    // +6 — and the drop is out at +15, over the far container column.
    const tx = 6 + across * 9;
    // Down to the trailer bed (box at 2.6), up clear, then down to the
    // apron (box at 1.3).
    const hookY = 21.5 - 16.9 * (down - rise) - across * 18.2;

    if (trolley.current) trolley.current.position.x = tx;

    // Pendulum lag. A suspended load cannot change speed with the trolley —
    // it trails, then overshoots and settles. This is the whole of the
    // "tension" read, and it is one damped follow.
    loadX.current += (tx - loadX.current) * Math.min(1, delta * 1.6);
    const sway = loadX.current - tx;

    if (spreader.current) {
      spreader.current.position.x = sway;
      spreader.current.position.y = hookY - 21.5;
    }
    if (ropes.current) {
      // Four falls, and each one has to actually span sheave to spreader —
      // a fixed-length rope is the thing that gives a crane away. The drop
      // is vertical and the sway is in X only, so the whole reeving shares
      // one length and one tilt.
      const len = Math.max(0.3, 21.5 - hookY);
      const hyp = Math.hypot(len, sway);
      const tilt = Math.atan2(sway, len);
      for (const r of ropes.current.children) {
        r.scale.y = hyp;
        r.rotation.z = tilt;
        r.position.y = -len / 2;
        r.position.x = (r.userData.x as number) + sway / 2;
      }
    }
    if (box.current) {
      const held = smooth(clamp01((u - 0.3) / 0.12));
      // Starts on the trailer bed at the doorway and is drawn straight out
      // along the crane's axis — never sideways through the container walls.
      // Once aboard it hangs off the spreader, sway included, so the load and
      // the ropes cannot disagree about where it is.
      box.current.position.x = THREE.MathUtils.lerp(6, tx + sway, held);
      // 2.0 below the beam: half the container plus the twistlock drop, so
      // it hangs off the spreader instead of floating under it.
      box.current.position.y = THREE.MathUtils.lerp(2.6, hookY - 2.0, held);
    }

    // About Z, not X. The arm lies along X, so rotating it about X spun it
    // around its own length and left it lying flat across the lane — which
    // is the whole of the reported bug. Z is the axis that swings +X into
    // +Y, and the arm reaches in -X from its hinge, so the lift is negative.
    if (boom.current) boom.current.rotation.z = -gateOpen(progress.current) * (Math.PI / 2);

    // Ground crew waiting at the back of the trailer.
    if (gang.current) {
      const now = clock.elapsedTime;
      gang.current.children.forEach((w, i) => {
        const [ax, az, bx, bz, speed, off] = GANG[i];
        const v = (((now * speed + off) % 2) + 2) % 2;
        const fwd = v < 1;
        const k = fwd ? v : 2 - v;
        w.position.x = THREE.MathUtils.lerp(ax, bx, k);
        w.position.z = THREE.MathUtils.lerp(az, bz, k);
        w.rotation.y = Math.atan2(bx - ax, bz - az) + (fwd ? 0 : Math.PI);
      });
    }
  });

  const apron = useAsphalt(26);
  const ribs = useCorrugation();
  const weather = useWeather();
  const logo = useLogo();
  const cols = quality === "high" ? 5 : 3;
  const rows = quality === "high" ? 9 : 5;

  const stacks = useMemo(() => {
    const rand = prng(20260831);
    const palette = ["#b8532f", "#2f6fb8", "#c9922f", "#3f8a52", "#8a3f6d"];
    const out: Array<{
      x: number;
      y: number;
      z: number;
      color: string;
      wear: number;
      top: boolean;
    }> = [];
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const height = Math.floor(rand() * 4);
        for (let k = 0; k < height; k++) {
          out.push({
            x: 12 + col * 6.6,
            y: 1.3 + k * 2.7,
            z: -24 + row * 7.2,
            color: palette[Math.floor(rand() * palette.length)],
            // Weathering, one draw per box. Identical roughness across a
            // whole field is what makes stacked containers read as moulded
            // plastic — sun-bleached steel varies box to box.
            wear: 0.42 + rand() * 0.34,
            // Only the top of a stack has corners against the sky. Castings
            // on buried boxes are draw calls nobody can see.
            top: k === height - 1,
          });
        }
      }
    }
    return out;
  }, [cols, rows]);

  const cranes = quality === "high" ? [-30, 34] : [34];

  return (
    <group position={[0, 0, PORT_Z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, 0.02, -10]} receiveShadow>
        <planeGeometry args={[80, 130]} />
        <meshStandardMaterial
          color="#52525a"
          roughness={0.55}
          metalness={0.18}
          envMapIntensity={1.1}
          normalScale={new THREE.Vector2(0.6, 0.6)}
          {...(apron ?? {})}
        />
      </mesh>

      {cranes.map((z) => (
        <group key={z} position={[21, 0, z]}>
          {[-9, 9].map((x) => (
            <mesh key={x} position={[x, 11, 0]}>
              <boxGeometry args={[1.1, 22, 1.1]} />
              <meshStandardMaterial color="#3a3d44" roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[-2, 22.4, 0]}>
            <boxGeometry args={[38, 1.3, 1.6]} />
            <meshStandardMaterial color="#4a4e57" roughness={0.8} />
          </mesh>
          <mesh position={[-11, 20.6, 0]}>
            <boxGeometry args={[3.4, 2.4, 3]} />
            <meshStandardMaterial color="#f28c28" roughness={0.6} />
          </mesh>
          <mesh position={[-11, 15.4, 0]}>
            <boxGeometry args={[0.12, 8, 0.12]} />
            <meshStandardMaterial color="#202226" />
          </mesh>
        </group>
      ))}

      {/* High-mast floodlights. Emissive heads rather than lights with big
          radii: the bloom pass turns the emitter into the glow, and a real
          point light per mast would be four more shadow-casting sources for
          a scene already carrying a sun. One dim unshadowed pool each is
          enough to sit them on the ground.

          Placed at x = 48 — clear of the container field, which ends at
          41.45, and of the quay wall at 60.4. */}
      {[
        [48, -34],
        [48, 4],
        [48, 42],
        [-18, 6],
      ].map(([mx, mz]) => (
        <group key={`fl${mx}-${mz}`} position={[mx, 0, mz]}>
          <mesh position={[0, 8.5, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.42, 17, 8]} />
            <meshStandardMaterial color="#6d7076" roughness={0.5} metalness={0.75} />
          </mesh>
          <mesh position={[0, 0.35, 0]} receiveShadow>
            <boxGeometry args={[1.5, 0.7, 1.5]} />
            <meshStandardMaterial color="#4c4a45" roughness={0.9} />
          </mesh>
          <mesh position={[0, 17.4, 0]}>
            <boxGeometry args={[3.6, 0.5, 1.3]} />
            <meshStandardMaterial color="#3a3d44" roughness={0.6} metalness={0.6} />
          </mesh>
          {[-1.2, 0, 1.2].map((lx) => (
            <mesh key={`lamp${lx}`} position={[lx, 17.05, 0.15]} rotation={[0.5, 0, 0]}>
              <boxGeometry args={[1.0, 0.12, 0.7]} />
              <meshStandardMaterial
                color="#fff6e2"
                emissive="#ffdca6"
                emissiveIntensity={7}
                toneMapped={false}
              />
            </mesh>
          ))}
          {quality === "high" && (
            <pointLight position={[0, 15, 0]} color="#ffdcae" intensity={260} distance={44} />
          )}
        </group>
      ))}

      {/* Painted yard markings. A terminal marks its pedestrian route and
          its lane edges; bare tarmac is what makes a yard read as a plane
          with boxes standing on it. */}
      <group position={[0, 0.035, -14]}>
        {[-6, -4, -2, 0, 2, 4, 6].map((x) => (
          <mesh key={`zb${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, 0]}>
            <planeGeometry args={[0.9, 5.4]} />
            <meshStandardMaterial color="#e9e6df" roughness={0.72} />
          </mesh>
        ))}
      </group>
      {/* Lane edge lines running in from the gate to the working bay. */}
      {[-9.4, 9.4].map((x) => (
        <mesh
          key={`le${x}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, 0.035, -6]}
          receiveShadow
        >
          <planeGeometry args={[0.22, 42]} />
          <meshStandardMaterial color="#e0c24a" roughness={0.72} />
        </mesh>
      ))}

      {/* Terminal gate. The truck passes under it on the way in, so the
          boom has to be up by then — see the frame loop. */}
      <group position={[0, 0, -28]}>
        {[-9.6, 9.6].map((x) => (
          <mesh key={`gp${x}`} position={[x, 3.4, 0]} castShadow>
            <boxGeometry args={[1.1, 6.8, 1.1]} />
            <meshStandardMaterial color="#4a4e57" roughness={0.55} metalness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 7.1, 0]} castShadow>
          <boxGeometry args={[20.3, 1.4, 0.9]} />
          <meshStandardMaterial color="#3a3d44" roughness={0.6} metalness={0.65} />
        </mesh>
        {/* Hazard-striped kerbs either side of the lane. */}
        {[-9.6, 9.6].map((x) => (
          <mesh key={`gs${x}`} position={[x, 0.55, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.35, 1.1, 1.35]} />
            <meshStandardMaterial map={hazard ?? undefined} roughness={0.55} metalness={0.2} />
          </mesh>
        ))}
        {/* Boom barrier. Hinged at the far post and reaching back across the
            carriageway: the truck sits at road-local x +2.7..+3.2 while it
            waits here, and the arm as first built spanned -8.9..-0.1 — the
            whole length of the wrong side of the road. A barrier that does
            not cross the lane is not a barrier the truck can wait at.

            The group's own origin is the hinge, so rotating the group is
            rotating about the hinge; the arm is offset inside it. */}
        <group ref={boom} position={[9.6, 1.55, 0.8]}>
          <mesh position={[-4.3, 0, 0]} castShadow>
            <boxGeometry args={[8.6, 0.26, 0.16]} />
            <meshStandardMaterial map={hazard ?? undefined} roughness={0.5} metalness={0.25} />
          </mesh>
          {/* Counterweight on the stub behind the hinge, and the reflective
              tip at the free end. */}
          <mesh position={[0.55, -0.1, 0]} castShadow>
            <boxGeometry args={[0.9, 0.5, 0.34]} />
            <meshStandardMaterial color="#3a3d44" roughness={0.6} metalness={0.6} />
          </mesh>
          <mesh position={[-8.45, 0, 0]}>
            <boxGeometry args={[0.5, 0.3, 0.2]} />
            <meshStandardMaterial
              color="#e8402a"
              emissive="#e8402a"
              emissiveIntensity={1.6}
              roughness={0.4}
            />
          </mesh>
        </group>
        {/* Barrier housing, under the hinge. */}
        <mesh position={[9.6, 0.78, 0.8]} castShadow receiveShadow>
          <boxGeometry args={[0.6, 1.56, 0.6]} />
          <meshStandardMaterial color="#c2542c" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Bollards down the lane edge. */}
        {[-6.4, 6.4].map((x) =>
          [-4, 4].map((z) => (
            <mesh key={`bo${x}-${z}`} position={[x, 0.55, z]} castShadow>
              <cylinderGeometry args={[0.16, 0.16, 1.1, 10]} />
              <meshStandardMaterial map={hazard ?? undefined} roughness={0.55} metalness={0.2} />
            </mesh>
          )),
        )}
      </group>

      {/* Perimeter fence along the inland edge of the yard. */}
      {quality === "high" && link && (
        <group position={[-26, 0, -10]}>
          {Array.from({ length: 9 }, (_, i) => (
            <group key={i} position={[0, 0, -60 + i * 15]}>
              <mesh position={[0, 1.9, 0]}>
                <planeGeometry args={[15, 3.8]} />
                {/* alphaTest, not blending: a fence is opaque wire and holes,
                    nothing in between, and it keeps the panels in the opaque
                    pass so they never sort wrong against each other. */}
                <meshStandardMaterial
                  map={link}
                  transparent
                  alphaTest={0.4}
                  side={THREE.DoubleSide}
                  roughness={0.4}
                  metalness={0.8}
                  color="#aeb4bc"
                />
              </mesh>
              <mesh position={[0, 2, -7.5]} castShadow>
                <boxGeometry args={[0.12, 4, 0.12]} />
                <meshStandardMaterial color="#7d8189" roughness={0.5} metalness={0.7} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* Working gantry, straddling z = 8 — the clear lane between container
          rows 4 and 5, and the lane the truck reverses into. Four legs, one
          pair either side of that lane, so the truck parks inside the portal
          instead of driving through a leg. */}
      <group position={[21, 0, 8]}>
        {[-9, 9].map((x) =>
          [-6, 6].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 11, z]} castShadow>
              <boxGeometry args={[1.1, 22, 1.1]} />
              <meshStandardMaterial color="#3a3d44" roughness={0.6} metalness={0.55} />
            </mesh>
          )),
        )}
        {[-6, 6].map((z) => (
          <mesh key={`sill${z}`} position={[0, 21.2, z]}>
            <boxGeometry args={[19, 1, 1.2]} />
            <meshStandardMaterial color="#4a4e57" roughness={0.6} metalness={0.5} />
          </mesh>
        ))}
        <mesh position={[-2, 22.4, 0]} castShadow>
          <boxGeometry args={[38, 1.3, 1.6]} />
          <meshStandardMaterial color="#4a4e57" roughness={0.6} metalness={0.5} />
        </mesh>
        <mesh position={[-13, 20.6, 0]} castShadow>
          <boxGeometry args={[3.4, 2.4, 3]} />
          <meshStandardMaterial color="#f28c28" roughness={0.5} metalness={0.3} />
        </mesh>

        <group ref={trolley} position={[6, 21.5, 0]}>
          <mesh castShadow>
            <boxGeometry args={[6.4, 1.2, 2.6]} />
            <meshStandardMaterial color="#f28c28" roughness={0.55} metalness={0.35} />
          </mesh>
          {/* Sheave blocks the falls run over, at the spreader's own corner
              spacing so the ropes hang plumb over the container's castings. */}
          {CORNER.map(([x, z]) => (
            <mesh key={`sh${x}-${z}`} position={[x, -0.62, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.14, 10]} />
              <meshStandardMaterial color="#5a5f66" roughness={0.35} metalness={0.9} />
            </mesh>
          ))}
          {/* Falls, twistlocks and corner castings all sit on CORNER, and
              that is the fix: the ropes were at x +/-2.6 z +/-0.55, the
              twistlocks at x +/-3.0 with only two of them, and the castings
              at x +/-2.85 z +/-1.1 — three different opinions about where
              the load hangs from. One constant, four falls, four corners.

              Thicker too: at 0.045 over an eighteen-unit drop the cables
              were about a pixel wide from the yard shot, which is to say
              invisible. */}
          <group ref={ropes}>
            {CORNER.map(([x, z]) => (
              <mesh key={`r${x}-${z}`} position={[x, -9, z]} userData={{ x }}>
                <cylinderGeometry args={[0.075, 0.075, 1, 6]} />
                <meshStandardMaterial color="#1c1e22" roughness={0.45} metalness={0.85} />
              </mesh>
            ))}
          </group>
          <group ref={spreader} position={[0, -18, 0]}>
            <mesh castShadow>
              <boxGeometry args={[6.3, 0.5, 2.6]} />
              <meshStandardMaterial color="#d8d4cc" roughness={0.4} metalness={0.7} />
            </mesh>
            {CORNER.map(([x, z]) => (
              <mesh key={`tw${x}-${z}`} position={[x, -0.45, z]} castShadow>
                <boxGeometry args={[0.5, 0.5, 0.42]} />
                <meshStandardMaterial color="#9aa0a8" roughness={0.3} metalness={0.9} />
              </mesh>
            ))}
          </group>
        </group>
        <group ref={box} position={[6, 2.6, 0]}>
          {/* Corner castings — what the twistlocks land in. */}
          {CORNER.map(([x, z]) => (
              <mesh key={`cc${x}-${z}`} position={[x, 1.32, z]}>
                <boxGeometry args={[0.4, 0.22, 0.3]} />
                <meshStandardMaterial color="#3b3f45" roughness={0.5} metalness={0.8} />
              </mesh>
          ))}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[6.1, 2.6, 2.5]} />
            <meshStandardMaterial
              color="#b8532f"
              roughness={0.55}
              metalness={0.45}
              envMapIntensity={1.2}
              normalMap={ribs}
              normalScale={new THREE.Vector2(1.1, 1.1)}
            />
          </mesh>
          <mesh position={[0, 0.1, -1.27]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[3.4, 1.25]} />
            <meshStandardMaterial map={logo} roughness={0.6} metalness={0.3} {...DECAL} />
          </mesh>
        </group>
      </group>

      {stacks.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[6.1, 2.6, 2.5]} />
            <meshStandardMaterial
              color={c.color}
              roughness={c.wear}
              roughnessMap={weather}
              metalness={0.45}
              envMapIntensity={1.2}
              normalMap={ribs}
              normalScale={new THREE.Vector2(1.1, 1.1)}
            />
          </mesh>
          {quality === "high" && c.top && (
            <>
              {[-2.85, 2.85].map((cx) =>
                [-1.1, 1.1].map((cz) => (
                  <mesh key={`cc${cx}-${cz}`} position={[cx, 1.32, cz]} castShadow>
                    <boxGeometry args={[0.4, 0.22, 0.3]} />
                    <meshStandardMaterial color="#3b3f45" roughness={0.5} metalness={0.8} />
                  </mesh>
                )),
              )}
            </>
          )}
          {/* Branding on the flank of every third box — enough to read as a
              liveried yard, not so much that it tiles. */}
          {i % 3 === 0 && (
            <mesh position={[0, 0.1, -1.27]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[3.4, 1.25]} />
              <meshStandardMaterial map={logo} roughness={0.6} metalness={0.3} {...DECAL} />
            </mesh>
          )}
        </group>
      ))}

      <group ref={gang}>
        <group>
          <Worker phase={1.2} />
        </group>
        {quality === "high" && (
          <group>
            <Worker phase={3.4} vest="#f26a1a" />
          </group>
        )}
      </group>

      {/* Two ships alongside, in the water beyond the quay. */}
      <CargoShip
        position={[74, -3.4, 6]}
        length={124}
        seed={881}
        ribs={ribs}
        lite={quality === "low"}
      />
      {quality === "high" && (
        <CargoShip position={[126, -3.4, -62]} length={96} seed={2207} ribs={ribs} />
      )}
    </group>
  );
}

/** Drives camera, world slide, wheel spin, rear doors and lighting mood. */
function Rig({
  progress,
  quality,
  onReady,
}: {
  progress: MutableRefObject<number>;
  quality: Quality;
  onReady?: () => void;
}) {
  const painted = useRef(false);
  const world = useRef<THREE.Group>(null);
  const truck = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const doors = useRef<THREE.Group>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const cabin = useRef<THREE.PointLight>(null);
  const spill = useRef<THREE.Mesh>(null);
  const lastZ = useRef(0);
  const lastRolled = useRef(0);
  // One velocity for the whole scene: camera shake, suspension load and
  // tyre spray all read this rather than each re-differentiating the travel
  // curve and drifting out of agreement.
  const vel = useRef(0);
  const tyreDust = useRef(0);
  // ScrollTrigger writes raw wheel deltas, which arrive in steps. Everything
  // downstream reads this eased copy instead, so camera, world slide, doors
  // and lighting all glide off the same value and stay in agreement — easing
  // only the camera would let it lag its own scenery.
  const eased = useRef(0);

  useProceduralEnv();

  // Render a window onto a wider virtual frustum. Everything the camera
  // frames shifts right, clearing the left column for the copy — without
  // moving the canvas element and exposing a hard edge against the panel.
  const size = useThree((st) => st.size);
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    // Two things move together with the viewport, and they have to.
    //
    // The offset exists to clear the left column for the copy — but below
    // the lg breakpoint the copy sits *over* the scene rather than beside
    // it, so pushing the subject right just shoves it off a narrow screen.
    // Under 768 there is no offset at all and the truck is centred.
    //
    // FOV widens as the viewport narrows for the same reason a phone camera
    // has a wider lens than a cinema one: the frame is short, and a 38-degree
    // vertical on a portrait panel crops the truck at both ends.
    const narrow = size.width < 768;
    const shift = narrow ? 1 : size.width < 1024 ? 1.16 : 1.34;
    camera.fov = narrow ? 52 : size.width < 1024 ? 45 : 38;
    camera.setViewOffset(size.width * shift, size.height, 0, 0, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => {
      camera.clearViewOffset();
    };
  }, [camera, size.width, size.height]);

  const camPos = useMemo(() => SHOTS.map((s) => new THREE.Vector3(...s.pos)), []);
  const camTar = useMemo(() => SHOTS.map((s) => new THREE.Vector3(...s.target)), []);
  const fogCol = useMemo(() => MOODS.map((m) => new THREE.Color(m.fog)), []);
  const keyCol = useMemo(() => MOODS.map((m) => new THREE.Color(m.key)), []);
  const ambCol = useMemo(() => MOODS.map((m) => new THREE.Color(m.ambCol)), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  // The damped pose is kept separately from camera.position so the shake can
  // be an offset each frame instead of feeding itself back into the damping.
  const base = useMemo(() => new THREE.Vector3(...SHOTS[0].pos), []);

  useFrame(({ camera, scene, clock }, delta) => {
    eased.current += (clamp01(progress.current) - eased.current) * (1 - Math.pow(0.002, delta));
    const p = eased.current;
    const { i, t } = segment(p, SHOTS.length);
    const now = clock.elapsedTime;
    const z = travelled(p);
    vel.current = Math.abs(z - lastZ.current) / Math.max(delta, 1e-3);

    // Damped toward the pose on the spline so a flung scrollbar glides
    // rather than snapping.
    scratch.lerpVectors(camPos[i], camPos[i + 1], t);
    // Coastal leg flies as a drone rather than a locked-off elevated pose:
    // the same bend() that curves the road pushes the rig out over the
    // water and climbs it, then returns it for the yard approach.
    const arc = bend(p);
    scratch.x -= arc * 11;
    scratch.y += arc * 6;
    scratch.z += Math.sin(arc * Math.PI) * 9;
    // No shake. The damped lerp is the only thing that moves the camera —
    // handheld noise on top of it competes with the scroll for authorship of
    // the motion, and at speed it was reading as dropped frames.
    base.lerp(scratch, 1 - Math.pow(0.0015, delta));
    camera.position.copy(base);

    scratch.lerpVectors(camTar[i], camTar[i + 1], t);
    camera.lookAt(scratch);

    // World slide + wheel spin derived from distance actually covered.
    if (world.current) {
      // Negative: the world slides backwards past a truck driving forwards.
      world.current.position.z = -z;
      // Coastal run follows a curve. Only the lateral offset goes on the
      // world: yawing it swings the far ends of 200-unit-long cliff geometry
      // straight across the lens. The turn itself is the truck's, which is
      // small enough to rotate safely.
      world.current.position.x = -arc * BEND_X;
    }
    const pk = park(p);
    if (truck.current) {
      truck.current.rotation.y = drift(p) + pk.yaw;
      truck.current.position.x = pk.x;
      truck.current.position.z = pk.z;
      // Suspension. Loaded by speed, so a parked truck sits dead still and
      // the bounce arrives with the acceleration rather than on a timer.
      const load = Math.min(vel.current / 55, 1);
      const bounce = (Math.sin(now * 15) * 0.03 + Math.sin(now * 6.3) * 0.012) * load;
      truck.current.position.y = bounce;
      truck.current.rotation.z = Math.sin(now * 9.4) * 0.006 * load;
      truck.current.rotation.x = Math.sin(now * 11.7 + 1.3) * 0.005 * load;
      // Springs move the body, not the road. Cancelling the bounce on the
      // wheel group keeps every tyre's contact patch on the asphalt — left
      // uncancelled it floated them 4cm clear at speed, which is exactly the
      // distance that reads as "the truck is not touching the ground".
      if (wheels.current) wheels.current.position.y = -bounce;
    }
    tyreDust.current = Math.min(vel.current / 60, 1) * 0.75;
    if (wheels.current) {
      // Rolling forward is a positive rotation about +X, and the angle is
      // the distance over the tyre radius — so the contact patch never slips
      // however the scroll is thrown around. `rolled` includes the yard
      // manoeuvre, and goes negative while the truck reverses, so the wheels
      // back up with it.
      const rolled = z + pk.rolled;
      const spin = (rolled - lastRolled.current) / 0.72;
      for (const w of wheels.current.children) w.rotation.x += spin;
      lastRolled.current = rolled;
    }
    lastZ.current = z;

    // Rear doors. Two openings: the dock, where the crates go in, and the
    // yard. The yard one lands well before progress 1 — the sticky panel
    // starts leaving the viewport near the end, so a climax at 0.95 is
    // never actually seen.
    const shut =
      smooth(clamp01(p / 0.02)) * (1 - smooth(clamp01((p - 0.235) / 0.045)));
    // Held until the reverse is done at p = 0.895 — doors swinging open
    // mid-manoeuvre was the tell that nothing was actually parking.
    const open = Math.max(shut, smooth(clamp01((p - 0.895) / 0.05))) * 2.0;

    if (doors.current) {
      doors.current.children.forEach((d) => {
        d.rotation.y = d.name === "right" ? -open : open;
        // Ram extends as the leaf swings — the secondary motion that makes
        // the hinge read as mechanical rather than as a rotate.
        const ram = d.getObjectByName("ram");
        if (ram) {
          ram.scale.y = 1 + (open / 2) * 0.8;
          ram.rotation.z = (open / 2) * 0.35 * (d.name === "right" ? -1 : 1);
        }
      });
    }

    // Warm interior light leaking out of the box. The truck never moves, so
    // this lives on the rig at fixed coordinates — which is also why it
    // works for the .glb model, whose doors the rig cannot hinge.
    const lit = clamp01(open / 1.4);
    if (cabin.current) cabin.current.intensity = lit * 26;
    if (spill.current) {
      const m = spill.current.material as THREE.MeshBasicMaterial;
      m.opacity = lit * 0.55;
      spill.current.scale.setScalar(0.6 + lit * 0.6);
    }

    const fog = scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.lerpColors(fogCol[i], fogCol[i + 1], t);
      fog.near = THREE.MathUtils.lerp(MOODS[i].fogN, MOODS[i + 1].fogN, t);
      fog.far = THREE.MathUtils.lerp(MOODS[i].fogF, MOODS[i + 1].fogF, t);
    }
    // The sky texture is the backdrop now, so the time of day rides its
    // exposure rather than replacing it with a flat colour.
    scene.backgroundIntensity = THREE.MathUtils.lerp(MOODS[i].sky, MOODS[i + 1].sky, t);
    if (key.current) {
      key.current.color.lerpColors(keyCol[i], keyCol[i + 1], t);
      key.current.intensity = THREE.MathUtils.lerp(MOODS[i].keyI, MOODS[i + 1].keyI, t);
    }
    if (amb.current) {
      amb.current.intensity = THREE.MathUtils.lerp(MOODS[i].amb, MOODS[i + 1].amb, t);
      amb.current.color.lerpColors(ambCol[i], ambCol[i + 1], t);
    }
    if (rim.current) {
      // Warm back-light, strongest at the dusk yard — separates the white
      // bodywork from a background that is nearly the same value by then.
      rim.current.intensity = THREE.MathUtils.lerp(MOODS[i].rim, MOODS[i + 1].rim, t);
    }

    // First real frame. onCreated fires before anything is drawn, so gating
    // the crossfade on it can uncover an empty canvas over the poster on a
    // slow GPU — this fires once the scene has actually been posed.
    if (!painted.current) {
      painted.current = true;
      onReady?.();
    }
  });

  return (
    <>
      {/* Fog starts past the far end of the yard: it softens the horizon and
          never touches the truck. Hauling it in was what turned the bodywork
          into a silhouette. */}
      {/* Thinned right out: the band now starts past the far ridgeline, so
          fog is atmospheric perspective on the horizon and nothing else. It
          was hazing the middle distance and flattening the scene. */}
      <fog attach="fog" args={["#cda87c", 240, 620]} />
      <ambientLight ref={amb} intensity={0.7} />
      <hemisphereLight args={["#ffe0b4", "#6b5540", 0.85]} />
      <directionalLight
        ref={key}
        position={[-18, 22, 14]}
        intensity={1.9}
        // The truck never moves, so one tight shadow frustum covers it all.
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <directionalLight ref={rim} position={[16, 7, -22]} intensity={0.7} color="#ffb066" />

      {/* Outside <world> on purpose: distant terrain must not slide with the
          route, and locking it to the camera is how it stays distant. */}
      <Horizon />

      <Suspense fallback={null}>
        <group ref={truck}>
          <Truck wheels={wheels} doors={doors} quality={quality} />

          {/* Container interior: a warm source and the patch it throws on the
              ground behind the open doors. Inside the truck group, so both
              ride the yard manoeuvre instead of being left at the origin. */}
          <pointLight ref={cabin} position={[0, 2.2, -4.1]} color="#ffcf94" intensity={0} distance={7.5} />
          <mesh ref={spill} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -7.2]}>
            <planeGeometry args={[3.4, 5]} />
            <meshBasicMaterial
              color="#ffbf7a"
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/* Spray thrown off the rear tyres, gated on speed. */}
          <group position={[0, 0, -3.4]}>
            <Dust
              count={90}
              volume={[3.4, 1.9, 3.2]}
              drift={[0, 0.5, -2.6]}
              color="#c9ae8c"
              size={0.16}
              alpha={tyreDust}
              seed={5519}
            />
          </group>
        </group>
      </Suspense>


      <Suspense fallback={null}>
        <group ref={world}>
          <Road quality={quality} />
          <Warehouse progress={eased} quality={quality} />
          <Coast quality={quality} progress={eased} />
          <Port quality={quality} progress={eased} />
        </group>
      </Suspense>

      {quality === "high" && <Effects progress={eased} />}
    </>
  );
}

export default function HeroScene({
  progress,
  onReady,
}: {
  progress: MutableRefObject<number>;
  onReady?: () => void;
}) {
  // Level of detail is picked once at mount. Phones get fewer containers,
  // a coarser sea, no shadows and a capped pixel ratio — the frame budget
  // there is spent on holding 60fps, not on geometry nobody can see.
  const quality: Quality = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 900px), (pointer: coarse)").matches
        ? "low"
        : "high",
    [],
  );

  return (
    <Canvas
      // Native device resolution, capped at 2 — past that the cost is real
      // and the gain is not. PCF rather than PCFSoft: golden-hour sun throws
      // a hard edge, and a softened one reads as low resolution.
      // 1.5 on phones. A 3x phone panel at dpr 2 is rendering four times the
      // pixels of dpr 1 for a difference nobody holds the device close
      // enough to resolve, and fragment cost is where a mobile GPU runs out.
      dpr={Math.min(
        typeof window === "undefined" ? 1 : window.devicePixelRatio,
        quality === "high" ? 2 : 1.5,
      )}
      // Shadows off on mobile, not merely lower-resolution: the map is a
      // whole extra scene render every frame, and halving its size halves
      // nothing about that.
      shadows={quality === "high" ? "percentage" : false}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 38, near: 0.5, far: 400, position: SHOTS[0].pos }}
      aria-hidden
    >
      <Rig progress={progress} quality={quality} onReady={onReady} />
    </Canvas>
  );
}
