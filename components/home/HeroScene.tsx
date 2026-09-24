"use client";

import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";

/* The bloom composer and its three sibling passes are ~45k gzipped and only
   the high-quality path ever mounts them. The import is fired from an effect
   rather than sitting in a `lazy()` at module scope, so the request is made by
   a branch the bundler cannot hoist — a phone, which renders no
   post-processing at all, never asks for the chunk. */
type EffectsProps = { progress: MutableRefObject<number> };

function useEffectsChunk(enabled: boolean) {
  const [Comp, setComp] = useState<ComponentType<EffectsProps> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void import("./HeroEffects").then((m) => {
      if (live) setComp(() => m.default);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return Comp;
}
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { pace, type Pace } from "@/lib/pace";

/* ── Scroll-driven 3D hero ───────────────────────────────────────────────
   Four phases along one continuous drive. The truck stays at the origin and
   the world slides past it, so "distance travelled" is a single number and
   wheel spin can be derived from it rather than faked.

   Scroll progress arrives as a ref, not a prop — the camera updates inside
   useFrame, so React never re-renders while you scroll.

   There are deliberately no OrbitControls: pointer-driven orbit fights the
   scroll that drives the story, so the camera is scroll's alone.

   Every object is built from primitives. There is no model loader in this
   chunk: the truck, forklift, crew and scenery are all geometry authored
   here, which is why the hero has no .glb download to wait on. */

const TRAVEL = 380;

/** Where each scene sits along the route. These are not free parameters:
    scenery must sit at travelled(p) for the p that frames it, otherwise the
    truck arrives after it has already swept past the camera. */
/** The truck's nose points +Z, so the route runs +Z and the world slides
    -Z under it. The dock is the one landmark behind the start line: a truck
    loads with its rear doors against the building, then pulls away forward. */
const WAREHOUSE_Z = -20; // behind the start line — backed onto the dock
const COAST_Z = 224; // travelled(0.70), the apex of the coastal bend
const PORT_Z = 380; // travelled(0.865), fully stopped

/** Camera keyframes, one per beat. Seven of them, and the sequence is the
    one a commercial would cut: wide establishing, medium on the approach,
    close on the load, three-quarter as the doors shut, a tracking pull as it
    leaves, a side track down the coast, then the destination reveal.

    Targets are aimed at the *subject* — the truck, which sits at the origin
    for every beat but the last. Getting it right of the headline is AIM_BIAS
    below, not a hand-picked world offset per shot: those offsets were 5-7
    units on some beats and 2 on others, and at these camera distances the
    same number is 3 degrees on one shot and 17 on the next. The truck was
    clipped off the right edge of the coastal run and nearly centred in the
    establishing wide. One angle, applied in screen space, holds the framing
    across all seven. */
const SHOTS: Array<{ pos: [number, number, number]; target: [number, number, number] }> = [
  { pos: [-25, 8.0, 27], target: [0, 3.0, 2] }, // 0.071  wide establishing
  { pos: [-19.5, 5.4, 21], target: [0, 2.5, 0] }, // 0.214  medium, backing in
  // Out on the apron looking back into the bay, not tucked beside the
  // building: at x = -14 / z = -7.5 the camera sat about a metre off the
  // neighbouring bay's shutter, which filled half the frame with corrugated
  // steel. The dock reads from in front of it, which is also where a camera
  // could physically stand.
  // Also outboard of the neighbouring bay's near upright at x = -8.9: from
  // further left that column stands between the lens and the trailer and
  // cuts the hero vehicle in half down the middle of the frame.
  { pos: [-9.5, 5.4, 14], target: [0, 2.3, -2] }, // 0.357  close, loading
  { pos: [-18, 5.0, 16], target: [0, 2.5, -1] }, // 0.500  cargo secured
  { pos: [-24, 5.0, 7], target: [0, 2.4, 0] }, // 0.643  departure tracking
  { pos: [-18, 6.4, 15], target: [0, 2.1, -1] }, // 0.786  highway side track
  // Aimed down the clear lane the truck reverses into. park() leaves it at
  // (20, 0, 8.4) facing -X, and the container field is stacked either side
  // of that lane at z = 3.55..6.05 and 10.75..13.25 — any approach across
  // the field looks straight through a stack of boxes, which is what made
  // the destination reveal reveal an empty apron. Along the lane the sight
  // line is clear all the way, and the gantry legs at x = 12 frame it.
  { pos: [-6, 6.8, 6.0], target: [20, 2.6, 8.4] }, // 0.929  yard arrival + park
];

/** How far left of the subject the camera aims, in world units at the
    subject's distance. Small: the render already carries a 1.34x view offset
    that pushes everything right, and this is the top-up that lands the truck
    around three-quarters across rather than under the headline.

    Zero on a phone. The bias exists to clear a copy column that sits beside
    the scene, and below 768 the copy is stacked *above* it instead — the
    same offset there just shoves the cab off the right edge, and the view
    offset is dropped for exactly this reason. */
const AIM_BIAS = 1.6;

/** Fog, key light and sun elevation per beat — flat daylight at the dock,
    through a genuine golden hour on the coast, to a dusk yard carried by its
    own floodlights.

    `sun` is the key light's position, and it is the whole of the golden-hour
    read: the colour shift is a tint, but a sun dropping from y = 40 to y = 12
    is what actually stretches the shadows across the road. Tinting alone is
    the "orange filter" look the brief rules out.

    Ambient is deliberately low and the key deliberately high. Raising the
    ambient fill to "brighten" a scene flattens it — fill is exactly the light
    that fills shadows in, and edges are read from the contrast across them. */
const MOODS: Array<{
  fog: string;
  key: string;
  keyI: number;
  amb: number;
  ambCol: string;
  rim: number;
  fogN: number;
  fogF: number;
  sky: number;
  sun: [number, number, number];
}> = [
  { fog: "#b9c2cb", key: "#fff8ec", keyI: 4.2, amb: 0.72, ambCol: "#c2cad3", rim: 0.9, fogN: 120, fogF: 470, sky: 1.14, sun: [-26, 40, 20] },
  { fog: "#bec5ca", key: "#fff5e4", keyI: 4.3, amb: 0.72, ambCol: "#c3c9d0", rim: 1.0, fogN: 120, fogF: 470, sky: 1.12, sun: [-25, 38, 18] },
  { fog: "#c6c4bd", key: "#fff2da", keyI: 4.4, amb: 0.74, ambCol: "#c3bfb7", rim: 1.2, fogN: 110, fogF: 440, sky: 1.08, sun: [-23, 35, 16] },
  { fog: "#ccc3b2", key: "#ffeed1", keyI: 4.5, amb: 0.74, ambCol: "#c8bfab", rim: 1.3, fogN: 110, fogF: 450, sky: 1.06, sun: [-23, 32, 14] },
  { fog: "#d6c5a6", key: "#ffe9c4", keyI: 4.6, amb: 0.72, ambCol: "#cbbc9f", rim: 1.6, fogN: 100, fogF: 430, sky: 1.02, sun: [-25, 26, 10] },
  // Golden hour: the sun is nearly on the horizon and well round to the side.
  { fog: "#dfb384", key: "#ffd097", keyI: 4.4, amb: 0.64, ambCol: "#c7a67d", rim: 2.3, fogN: 75, fogF: 360, sky: 0.94, sun: [-30, 12, 4] },
  // Dusk yard. Not night-black: the key drops to a cold residual sky light
  // and the yard's own floodlights become the exposure.
  { fog: "#454c60", key: "#9db1cd", keyI: 1.3, amb: 0.52, ambCol: "#69748c", rim: 1.5, fogN: 60, fogF: 320, sky: 0.4, sun: [-30, 10, -2] },
];

/** Anisotropic filtering for every texture built below, set once instead of
    per-map. Almost everything here is read at a grazing angle — the road
    under the camera, container flanks, chain-link, tyre tread — and that is
    precisely where plain trilinear mipmapping smears a surface into a blur
    band. Sampling cost only applies to the pixels that are actually oblique,
    which is why this buys sharpness for close to nothing. 8 rather than the
    hardware maximum: past 8 the difference is unmeasurable on this content
    and some drivers charge for 16 on every fetch. */
THREE.Texture.DEFAULT_ANISOTROPY = 8;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (v: number, n: number) => ((v % n) + n) % n;

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
    beat owns its share of the scroll and the moves happen at the seams. */
function segment(p: number, n: number) {
  // Clamped to [0, n-1], not to [0, 1]. clamp01 here capped the keyframe
  // cursor at the *second* keyframe, so every beat past the opening two
  // resolved to the same pair: the camera never reached the later shots and
  // neither did the lighting, which reads off the same index. With four
  // keyframes that showed up as a camera that stopped choreographing a third
  // of the way in and a golden hour that never arrived — the world sliding
  // past was doing all the apparent work.
  const s = Math.min(n - 1, Math.max(0, clamp01(p) * n - 0.5));
  const i = Math.min(n - 2, Math.floor(s));
  return { i, t: easeShot(clamp01(s - i)) };
}

/* ── Carriageway layout ──────────────────────────────────────────────────
   One set of numbers for the road surface, the paint, the furniture and the
   traffic, because they are one thing. The hero holds the inner northbound
   lane at x = 0 and the bend sweeps it to +BEND_X; everything else is placed
   from that so nothing can ever be laid across the lane the truck is in.

   Verified clearances at the apex of the bend, where they are tightest —
   hero half-width 1.3, car half-width ~0.98:
     hero right edge  2.4  ->  NB outer car left edge  4.42   (2.0 clear)
     hero left edge  -1.3  ->  median edge            -2.5    (1.2 clear)
     median edge     -4.7  ->  SB inner car edge      -5.62   (0.9 clear) */
const ROAD_L = -11.8;
const ROAD_R = 7.6;
const ROAD_MID = (ROAD_L + ROAD_R) / 2;
const ROAD_W = ROAD_R - ROAD_L;
const LANE_HERO = 0;
const LANE_NB_OUT = 5.4;
const LANE_SB_IN = -6.6;
const LANE_SB_OUT = -9.9;
const DASH_NB = 3.1;
const DASH_SB = -8.25;
const MEDIAN_X = -3.6;
const MEDIAN_W = 2.2;
const RAIL_L = -12.15;
const RAIL_R = 7.95;
/** Where the highway proper starts and stops. Everything behind HWY_A is
    the warehouse's own concrete apron and everything past HWY_B is the
    terminal yard, so no highway furniture — guardrail, kerbs, lane paint,
    median, lighting, planting — may be laid outside this band. Running the
    rail from the start of the road put a crash barrier across the dock
    forecourt, three metres in front of the loading bay. */
const HWY_A = 40;
const HWY_B = 332;
const HWY_MID = (HWY_A + HWY_B) / 2;
const HWY_LEN = HWY_B - HWY_A;

/** Lateral sweep of the coastal bend: 0 → 1 → 0 across the coastal band. */
const BEND_A = 0.6;
const BEND_B = 0.8;
function bend(p: number) {
  return Math.sin(clamp01((p - BEND_A) / (BEND_B - BEND_A)) * Math.PI);
}

/** How far the coastal bend sweeps the truck across the road, in road-local
    units. Bounded by the lane: the carriageway is painted around a hero at
    x = 0, and anything past ~1.4 puts the trailer over the lane line and,
    at the far end, through the guardrail. */
const BEND_X = 1.1;

/** The heading the truck must actually hold, from the ratio of its lateral
    speed to its forward speed.

    Yawing by a fraction of bend() looked plausible mid-curve and was flatly
    wrong at the apex, where lateral velocity is zero but that formula is at
    maximum yaw: degrees of crab with the truck travelling dead ahead.
    Deriving it costs two extra evaluations of functions that are already
    pure, and it cannot disagree with the path.

    The guard also covers the reverse into the dock, where dFwd is negative:
    atan2(0, -x) is pi, which would spin the truck end for end. */
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

/** The warehouse's own gate onto the public road, in world z: right at the
    edge of the apron, which is what a gate is. The truck reaches it around
    p = 0.58 — the departure beat. */
const EXIT_Z = 33;

const PARK_R = 8.4;
const PARK_BACK = 28.4;

/** Yard manoeuvre: a forward left 90, then a reverse into the bay.

    travelled() is finished by p = RUN_END — the world has stopped sliding —
    so from here the truck is free to move in world space directly. That
    matters: turning the truck while keeping it at the origin would mean
    yawing the world instead, which swings six hundred units of road, sea and
    ridgeline straight through the lens.

    Returns signed distance rolled alongside the pose, so wheel spin stays
    derived from real movement. Driving the spin off travelled() alone would
    leave the tyres locked through thirty-seven units of manoeuvre. */
const TURN_A = 0.9;
const TURN_B = 0.935;
const BACK_B = 0.97;
function park(p: number) {
  const turn = smooth(clamp01((p - TURN_A) / (TURN_B - TURN_A)));
  const back = smooth(clamp01((p - TURN_B) / (BACK_B - TURN_B)));
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
    stopping here puts it 1.7 short of the boom. Close enough to read as
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
const GATE_HOLD_A = 0.82;
const GATE_HOLD_B = 0.85;

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

/* ── The scroll story ────────────────────────────────────────────────────
   0.00  warehouse overview, truck staged on the apron
   0.12  approach: the truck reverses onto the dock
   0.28  docked; shutter up, forklift working, doors open
   0.46  last pallet aboard
   0.52  cargo secured, doors shut, pulls away
   0.60  clears the warehouse gate onto the public road
   0.75  coastal run at speed, golden hour coming up
   0.82  terminal gate lifts
   0.90  yard reached; the manoeuvre and the reveal run to 1.00              */
const APPROACH = 16;
const DOCK_A = 0.12;
const DOCK_B = 0.28;
const LOAD_END = 0.52;
const RUN_END = TURN_A;

/** Distance run. Five legs: staged on the apron, the reverse onto the dock,
    the load (a dead stop), the haul out to the terminal gate, a second dead
    stop while the barrier lifts, then the creep into the yard.

    The holds are genuine plateaus rather than slow sections — velocity is
    differentiated from this curve, so a flat stretch stops the wheels, the
    suspension bounce and the tyre dust on its own, with nothing else to
    keep in sync. And the reverse is a real decrease, so the tyres roll
    backwards out of the same derivation rather than needing a sign flag. */
function travelled(p: number) {
  if (p <= DOCK_A) return APPROACH;
  if (p < DOCK_B) return APPROACH * (1 - smooth((p - DOCK_A) / (DOCK_B - DOCK_A)));
  if (p <= LOAD_END) return 0;
  if (p <= GATE_HOLD_A) {
    return GATE_STOP * smooth(clamp01((p - LOAD_END) / (GATE_HOLD_A - LOAD_END)));
  }
  if (p < GATE_HOLD_B) return GATE_STOP;
  return (
    GATE_STOP +
    (TRAVEL - GATE_STOP) * smooth(clamp01((p - GATE_HOLD_B) / (RUN_END - GATE_HOLD_B)))
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

/** A pose for one instance: position, Euler rotation, scale. */
type Pose = [number, number, number, number, number, number, number, number, number];

/** Static instanced mesh. Every repeated prop in the scene — cartons, palm
    trunks, fronds, shrubs, lamp posts, guardrail posts — is the same mesh a
    few hundred times, which is one draw call if the transforms are baked
    into an instance buffer and several hundred if they are not.

    Poses are computed once at mount because none of these move; anything
    that has to animate keeps its own group and is not in here. */
function Instanced({
  geometry,
  material,
  poses,
  tint,
  rough,
  cast = false,
  receive = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  poses: Pose[];
  /** Per-instance colour and base roughness. Both, or neither, and only with
      a material put through varied() below. */
  tint?: readonly string[];
  rough?: readonly number[];
  cast?: boolean;
  receive?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    poses.forEach((t, i) => {
      o.position.set(t[0], t[1], t[2]);
      o.rotation.set(t[3], t[4], t[5]);
      o.scale.set(t[6], t[7], t[8]);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [poses]);

  // In a memo and not an effect, so the attributes are on the geometry before
  // the mesh below is ever committed. Attached from an effect they arrive
  // after the first draw, which changes the attribute layout and makes three
  // link the program a second time — three extra shader links, landing after
  // the reveal rather than inside precompile's window.
  useMemo(() => {
    if (!tint || !rough) return;
    const n = poses.length;
    const t = new Float32Array(n * 3);
    const r = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      // Color.set runs the sRGB -> linear conversion the `color` uniform it
      // replaces would have had, so the instanced tint lands on the same
      // value the per-object material produced.
      c.set(tint[i]);
      t[i * 3] = c.r;
      t[i * 3 + 1] = c.g;
      t[i * 3 + 2] = c.b;
      r[i] = rough[i];
    }
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(t, 3));
    geometry.setAttribute("aRough", new THREE.InstancedBufferAttribute(r, 1));
  }, [geometry, poses, tint, rough]);

  if (!poses.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, poses.length]}
      castShadow={cast}
      receiveShadow={receive}
      // These span the whole 400-unit route inside a group that slides
      // hundreds of units. The bounding sphere three derives for that is
      // either wrong or enormous, and the draw is one call either way.
      frustumCulled={false}
    />
  );
}

/** Lets one instanced material carry a colour and a base roughness per box.

    Instancing collapses a field of containers into a single draw call only if
    they can share a material, and a shared material is normally one colour and
    one roughness — which is the whole of what made a stacked yard read as
    moulded plastic. This keeps the variation and the single call.

    three's own `instanceColor` does not do it: in this version the vertex
    shader writes it into vColor but the fragment only applies vColor under
    USE_COLOR, which wants a per-vertex `color` attribute the geometry has not
    got. Two instanced attributes and three substitutions is less machinery
    than working around that, and the roughness comes along for free.

    roughnessFactor is replaced rather than multiplied because that is exactly
    what the per-object materials did: each set `roughness` and then let the
    shared roughnessMap modulate it, and the chunk this lands in front of does
    the modulating either way. */
function varied(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 aTint;
attribute float aRough;
varying vec3 vTint;
varying float vRough;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vTint = aTint;
vRough = aRough;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vTint;
varying float vRough;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse * vTint, opacity );",
      )
      .replace("float roughnessFactor = roughness;", "float roughnessFactor = vRough;");
  };
  // Programs are cached by a key built from the material's parameters, and
  // these substitutions are not in it — without this, a plain standard
  // material with the same settings would be handed this one's program, or
  // the other way round.
  mat.customProgramCacheKey = () => "protrans-varied";
  return mat;
}

/** Frees a geometry/material pair built with useMemo for an Instanced. */
function useOwned<T extends { dispose(): void }>(value: T): T {
  useEffect(() => () => value.dispose(), [value]);
  return value;
}

/** Textures are GPU allocations. React drops the reference when the hero
    unmounts, but nothing frees the buffer — and every procedural map below
    is generated per component instance, so a route change away from the
    home page leaks the whole set. One place to free them, used by all of
    them; it takes a texture or the map of textures a generator returns. */
function useDisposable<T>(value: T): T {
  useEffect(
    () => () => {
      const free = (v: unknown) => (v as { dispose?: () => void } | null)?.dispose?.();
      if (value && typeof value === "object" && !("dispose" in value))
        Object.values(value).forEach(free);
      else free(value);
    },
    [value],
  );
  return value;
}

/** One copy of each procedural texture, shared by every component that asks.

    These are generated by drawing into a 2D canvas on the main thread, and
    several of them were being generated more than once: the corrugation twice
    inside the warehouse alone (as `ribs` and again as `flute`) plus once in
    the port, the hazard stripe three times, the chain-link twice, and the
    asphalt three times — 512 squared of aggregate, a 262144-pixel Sobel pass
    and sixteen puddle gradients, three times over, for three canvases with
    identical content that differed only in a `repeat` the texture carries
    anyway.

    Measured on a software rasteriser with the CPU at half speed, procedural
    texture generation was 2.9s of a 9.6s startup. It is also GPU memory: each
    duplicate was its own upload.

    Refcounted rather than kept forever, because the hero unmounts on a route
    change and the whole point of the hooks below was to free the GPU when it
    does. Disposal is deferred a tick so React's development double-mount —
    which unmounts and immediately remounts every component — cannot free a
    texture that is about to be asked for again. */
const shared = new Map<string, { value: unknown; refs: number }>();

function useShared<T>(key: string, make: () => T): T {
  let entry = shared.get(key);
  if (!entry) {
    entry = { value: make(), refs: 0 };
    shared.set(key, entry);
  }
  const value = entry.value as T;

  useEffect(() => {
    const e = shared.get(key);
    if (!e) return;
    e.refs += 1;
    return () => {
      e.refs -= 1;
      setTimeout(() => {
        if (e.refs > 0 || shared.get(key) !== e) return;
        shared.delete(key);
        const free = (v: unknown) => (v as { dispose?: () => void } | null)?.dispose?.();
        if (e.value && typeof e.value === "object" && !("dispose" in (e.value as object))) {
          Object.values(e.value as object).forEach(free);
        } else {
          free(e.value);
        }
      }, 0);
    };
  }, [key]);

  return value;
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
    // Hazy tropical daylight, not a sunset. The environment is one texture
    // reused across every beat, and baking the sunset into it meant the
    // scene opened at golden hour and had nowhere to go — the brief wants
    // that light to *arrive*. So this is neutral-warm and bright, and the
    // time of day is carried by the sun's elevation, the fog and the
    // background exposure, all of which the rig lerps per beat.
    //
    // The horizon band is what metal and clearcoat actually reflect, so its
    // width controls how "lit" the bodywork reads more than the sun does.
    g.addColorStop(0, "#3f6fae");
    g.addColorStop(0.3, "#8fb0cd");
    g.addColorStop(0.44, "#d6dde0");
    g.addColorStop(0.5, "#f3ecdf");
    g.addColorStop(0.56, "#9c8f7e");
    g.addColorStop(1, "#3a332b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // The sun. Without a bright spot the environment is a flat wash and
    // clearcoat has no highlight to pick up — the paint reads as matte.
    const sun = ctx.createRadialGradient(280, 232, 8, 280, 232, 170);
    sun.addColorStop(0, "rgba(255,252,242,1)");
    sun.addColorStop(0.35, "rgba(255,238,208,0.7)");
    sun.addColorStop(1, "rgba(255,226,186,0)");
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
      band.addColorStop(0, "rgba(255,250,244,0)");
      band.addColorStop(0.5, `rgba(255,252,248,${0.35 + rand() * 0.4})`);
      band.addColorStop(1, "rgba(255,250,244,0)");
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

  /* The drawing happens once for the whole scene; only the textures wrapped
     around it are per-caller.

     Three surfaces use this — the dock apron, the carriageway and the port
     apron — and they differ in one number, how many times the grain repeats
     along the route. That number lives on the texture, not in the pixels, so
     all three were painting the same 512 squared of aggregate, running the
     same 262144-pixel Sobel pass over it and drawing the same sixteen puddle
     gradients, to arrive at three identical canvases. It was the single most
     expensive thing on the main thread during startup. */
  const canvases = useShared("asphalt", () => {
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

    return { base: c, normal: n, rough: w };
  });

  // Textures are cheap; the canvases above are not. Each caller still gets its
  // own so it can carry its own repeat, and still disposes them on unmount.
  return useDisposable(
    useMemo(() => {
      if (!canvases) return null;
      const make = (from: HTMLCanvasElement, srgb: boolean, rx = 4, ry = repeatY) => {
        const t = new THREE.CanvasTexture(from);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(rx, ry);
        t.anisotropy = maxAniso;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        return t;
      };
      return {
        map: make(canvases.base, true),
        // Puddles tile an order of magnitude slower than the grain, otherwise
        // the same wet patch repeats every few metres and reads as wallpaper.
        roughnessMap: make(canvases.rough, false, 1, Math.max(2, repeatY / 9)),
        normalMap: make(canvases.normal, false),
      };
    }, [canvases, repeatY, maxAniso]),
  );
}

/** Corrugated steel: vertical ribs baked straight into a tangent-space
    normal map. It is the ribbing, more than the colour, that separates a
    shipping container from a coloured box. */
function useCorrugation() {
  return useShared("corrugation", () => {
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
  });
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
  return useShared("weather", () => {
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
  });
}

/** Yellow-and-black hazard striping, for bollards, barrier booms and dock
    bumpers. Diagonal bands drawn once and repeated round the geometry. */
function useHazard() {
  return useShared("hazard", () => {
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
  });
}

/** Chain-link, as an alpha mask rather than geometry. A woven fence modelled
    as meshes is thousands of draw calls for something read at 30 metres;
    one alphaTest plane per panel is the same picture. */
function useChainLink() {
  return useShared("chainlink", () => {
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
  });
}

/** Tyre rubber: a tread block pattern as a bump map. Tyres are the one part
    of a truck a viewer has seen up close, and a perfectly smooth black
    cylinder is the tell that gives a render away. */
function useRubber() {
  return useShared("rubber", () => {
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
  });
}

/** Rim face: spokes, a bolt circle and a recessed hub cap, as a normal map.

    The rim was two silver discs — the outer one plain, the inner one a
    slightly darker plain one. At the dock beat the camera is close enough
    to read them, and a pair of flat circles is exactly the "geometric
    cylinder" tell the bodywork no longer has.

    A texture rather than geometry, and that is the whole point: spokes
    modelled as meshes would be ten rims times six spokes plus eight bolts
    of extra draw calls on a scene that already holds its frame budget
    carefully. This is one 256px canvas, generated once, shared by every
    wheel, and it costs nothing per frame. Same trick the tread, the
    corrugation and the asphalt already use here.

    Drawn into the disc three.js maps a cylinder cap to — centred, radius
    half the texture — so the pattern lands concentric with the wheel. */
function useRimFace() {
  return useShared("rimface", () => {
    const SZ = 256;
    const c = document.createElement("canvas");
    c.width = SZ;
    c.height = SZ;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const mid = SZ / 2;

    // Mid grey is "flat" for a height field: the sobel pass reads deviation
    // from it, so anything left at this value stays a plain surface.
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, SZ, SZ);

    // Outer lip, proud of the face.
    ctx.strokeStyle = "#d8d8d8";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    // Six lightening holes between the bolts. A truck rim is mostly the
    // holes — leaving them out is what makes one read as a hubcap.
    ctx.fillStyle = "#3a3a3a";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      ctx.beginPath();
      ctx.ellipse(mid + Math.cos(a) * mid * 0.52, mid + Math.sin(a) * mid * 0.52,
                  mid * 0.2, mid * 0.14, a, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bolt circle, proud.
    ctx.fillStyle = "#ececec";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(mid + Math.cos(a) * mid * 0.3, mid + Math.sin(a) * mid * 0.3, mid * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }

    // Recessed hub cap in the middle.
    ctx.fillStyle = "#5a5a5a";
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.17, 0, Math.PI * 2);
    ctx.fill();

    const nrm = sobelNormal(c, SZ, 150);
    if (!nrm) return null;
    return new THREE.CanvasTexture(nrm);
  });
}

/** One soft round sprite, shared by every particle system on the page. */
function useMote() {
  // One sprite for every particle system on the page. <Dust> is mounted three
  // times — dock haze, tyre spray, and once more per stage — and each mount
  // was building and uploading its own copy of the same 128px disc.
  return useShared("mote", () =>
    radialTexture([
      [0, "rgba(255,255,255,0.95)"],
      [0.42, "rgba(255,255,255,0.3)"],
      [1, "rgba(255,255,255,0)"],
    ]),
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
  const tex = useDisposable(useMemo(() => {
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
  }, []));

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

/** The pixel ratio this device last had to step down to, remembered.

    The opening search measures the dock, and the yard is roughly twice the
    work, so a device that is marginal at its ceiling finds out at the end of
    the story and takes one resize there — measured at 83–151ms on a 2x
    1440 panel, on every visit. Remembering where it ended up means that step
    is paid once per device, not once per visit.

    Keyed to the GPU, the quality path, the ceiling and the viewport's pixel
    count, so a different screen or window size measures afresh. It expires
    after a week, so one bad session (a busy machine, a thermal dip) cannot
    hold a capable device down for good. Storage that throws — private mode,
    blocked site data — just means no memory, which is the old behaviour. */
const DPR_MEMORY_KEY = "protrans:hero-dpr";
const DPR_MEMORY_MS = 7 * 24 * 60 * 60 * 1000;

function recallDpr(key: string): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(DPR_MEMORY_KEY) ?? "null");
    return v && v.key === key && Date.now() - v.at < DPR_MEMORY_MS && typeof v.dpr === "number" ? v.dpr : null;
  } catch {
    return null;
  }
}

function rememberDpr(key: string, dpr: number) {
  try {
    localStorage.setItem(DPR_MEMORY_KEY, JSON.stringify({ key, dpr, at: Date.now() }));
  } catch {
    // No storage: nothing is remembered, and the next visit measures again.
  }
}

/** Stop drawing once the hero has left the viewport.

    This is the scroll lag. The hero is a 380vh sticky section, so by the
    time you reach the services rows it is long gone — but the canvas keeps
    running: a 2048 shadow pass, a bloom composer and several hundred meshes,
    a full frame budget spent on pixels nobody can see, for the whole rest of
    the page. Everything below it then competes for what is left.

    `never` rather than `demand`: while the hero *is* on screen the scene has
    ambient motion that owes nothing to scroll — the crew walk, the sea
    displaces, the crane runs — so gating frames on ScrollTrigger alone would
    freeze the scene the moment you stopped moving. Visibility is the gate
    that costs nothing to be wrong about.

    The loop mode is owned by HeroScene and handed to <Canvas frameloop>,
    not set here with setFrameloop. That call did not stick: Canvas re-runs
    configure() on every one of its renders and resets the loop to its
    `frameloop` prop, which defaulted to "always" — so the first re-render
    after the hero left (a pixel-ratio step, a re-measure) switched the loop
    back on. Measured: 14k draw calls a second on a phone with the canvas
    3000px above the viewport, the same as with it on screen. Same failure,
    same fix, as the pixel ratio (see AdaptiveResolution).

    A stopped loop stays stopped until something asks for a frame, so the
    switch back on kicks the first one. */
function PauseOffscreen({ onVisible }: { onVisible: (visible: boolean) => void }) {
  const gl = useThree((st) => st.gl);
  const frameloop = useThree((st) => st.frameloop);
  const invalidate = useThree((st) => st.invalidate);

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => onVisible(e.isIntersecting),
      // Resume a little before it is actually visible, so the first frame
      // back is already drawn rather than arriving a frame late.
      { rootMargin: "200px" },
    );
    io.observe(gl.domElement);
    return () => io.disconnect();
  }, [gl, onVisible]);

  useEffect(() => {
    if (frameloop === "always") invalidate();
  }, [frameloop, invalidate]);

  return null;
}

/** Adaptive render resolution.

    The pixel ratio cap is a guess made at mount from `window.devicePixelRatio`,
    and that number says nothing about the GPU behind it — a 2019 phone and a
    current one both report 3. This closes the loop: it watches the actual
    frame time and steps the ratio down when the device is not keeping up,
    then back up when it is.

    Nothing is removed at any step. Shading cost scales with the square of
    this, so 1.5 → 1.25 is a third of the fragments off the budget while the
    scene, its geometry, its lighting and its animation are all untouched —
    the frame just resolves slightly softer, and only on hardware that was
    dropping frames at the higher ratio anyway.

    The dead band (worse than 45fps to step down, better than 58 to step up)
    and the cooldown are what stop it oscillating: each change costs one R3F
    re-render, so it has to be rare and decisive rather than continuous. */
const DPR_STEP = 0.25;

/* Windows are measured in milliseconds, with a minimum number of frames —
   not in frames alone, which is how this was written and which had it exactly
   backwards.

   A window of 24 frames is 400ms on a device holding 60fps and eight seconds
   on one managing three. So the slower the device, the longer it waited before
   doing anything about it: measured on a software rasteriser, the second
   resolution step landed 47 seconds into the session. The machines that need
   the rescue fastest were the ones made to wait longest for it.

   Time-based, a struggling device gets its first verdict in the same 300ms a
   fast one does. The frame minimum is what stops a single slow frame from
   being mistaken for a window. */
const WINDOW_MS = 300;
const WINDOW_MIN_FRAMES = 6;
/** Warm-up: enough frames to be past the opening uploads, or enough time,
    whichever comes first.

    "Enough frames" alone is what a slow device cannot afford. Eight frames is
    130ms at 60fps and twelve seconds on a device rendering one frame every
    second and a half — measured, on a loop that then had nothing to report
    until the hero had been on screen for twenty. The cap is what bounds it. */
const WARMUP_MS = 500;
const WARMUP_MIN_FRAMES = 8;
const WARMUP_CAP_MS = 1500;
/** Frame-time bands, and they have to be read against a vsync-locked clock.

    A display refreshing at 60Hz cannot hand back a frame time better than
    16.67ms however much headroom the GPU has, so "is this ratio comfortable"
    is not a question about the average being small — it is a question about
    how often the average is dragged up by frames that missed and landed on the
    next refresh at 33.4ms. The thresholds are set from that:

      10% of frames doubling -> average 18.4ms
      20% of frames doubling -> average 20.0ms
      50% of frames doubling -> average 25.1ms

    BAD at 20.8ms is therefore the average that means about a fifth of the
    window missed, and it sits far enough above 16.67 that ordinary jitter
    cannot reach it — which matters: an earlier cut used 17.24ms, close enough
    to the refresh period that a couple of 18ms frames were enough to step a
    perfectly healthy device down a notch.

    The average is kept for the obvious cases and paired with a direct count of
    the misses for everything else, because between one in twenty and one in
    eight the average barely moves while the scroll visibly stutters. See
    MISS_RATIO below, and MISS_MS for the calibration side. */
const BAD = 1 / 48;
/** ...and the same question asked of the steady state, where it matters most.

    An average hides a miss rate. Nine percent of frames arriving at 33ms
    averages 18.2ms, which is comfortably inside BAD, so the loop watched a
    scroll drop roughly one frame in eleven and reported nothing wrong — the
    correction took fifteen seconds to be decided, and was decided by an
    unlucky window rather than by the pattern. Counting misses sees it in the
    first window.

    Eight percent, over two consecutive windows, so a single stutter cannot
    move the ratio but a sustained one moves it within a second. */
const MISS_RATIO = 0.08;
/* Calibration counts missed frames rather than averaging them, because the
   average is the wrong statistic for this question.

   At 60Hz a frame either lands in its 16.7ms slot or it misses and arrives at
   33.4ms; there is very little in between, and the 17-19ms readings around the
   period are measurement jitter, not degradation. Averaging mixes the two, so
   a window with two genuine misses and a window with fifteen slightly jittery
   frames read the same. Counting misses separates them.

   The bar for keeping a ratio is that the window contains none. That is
   deliberately strict, and it is strict for a reason the search cannot
   otherwise see: it measures a scene standing still, while the ratio has to
   survive scrolling, which adds ScrollTrigger, the springs, the chapter
   crossfade and the compositing of the copy over a moving canvas on top.
   Measured on this machine at 1.5 — idle windows that averaged a perfectly
   respectable 17ms, and 6% of frames dropped the moment a scroll started. The
   same scroll at 1.25: none at all.

   So a ratio that cannot render a still frame without missing one is not a
   ratio that will hold a gesture, and the search steps down. A machine with
   real headroom misses nothing and keeps everything it had. */
const MISS_MS = 25;
/** A window this slow is not a marginal call, it is a device rendering at half
    rate. No second opinion required. */
const SEVERE = 1 / 34;
/** ...and this slow is not a device that needs stepping down a notch. At ten
    frames a second, walking the ratio 1.75 -> 1.5 -> 1.25 three windows at a
    time is three windows of nothing happening. Go to the floor and start
    shedding work instead. */
const DIRE = 1 / 10;

/** The pixel ratio this path is not allowed below.

    Shared, because two places need to agree about it: the loop that walks down
    to it, and the device probe that starts some machines there. */
function dprFloor(lowPath: boolean) {
  return lowPath ? 0.75 : 1.25;
}

/** What the device is, asked directly, before a frame is drawn.

    Everything else here adapts by measuring, which is the right way round —
    but measuring costs the thing being measured. A machine that cannot render
    this scene at 1.5 still has to render it at 1.5 a few times to find that
    out, and on a software rasteriser those few frames are seconds each, spent
    freezing. Starting such a device where it was going to end up removes the
    descent rather than making it faster.

    The renderer string is the one signal that is exact. A software rasteriser
    says so — SwiftShader, llvmpipe, Microsoft's Basic Render Driver — and
    nothing else does, so there is no capable machine this can misfire on.
    WEBGL_debug_renderer_info is unavailable in a few browsers; the fallbacks
    below are then all that is left, and they are deliberately conservative.

    Core count and memory are the crude half, and they are read narrowly on
    purpose: at four cores this was catching perfectly capable laptops and
    handing them the reduced-geometry path. Two cores or 2GB is a device that
    is genuinely small, and even then it only changes where the pixel ratio
    starts, not what is in the scene.

    The probe costs one throwaway context, released immediately. */
type DeviceProfile = {
  /** Software rasteriser, or something that reports like one. */
  software: boolean;
  /** Small machine: start below the ceiling rather than at it. */
  modest: boolean;
  /** A GPU family known to be weak for this scene: starts at the ratio
      floor with bloom already off, rather than finding out on screen. */
  weak: boolean;
  /** Unmasked renderer string, or "" when the browser hides it. */
  gpu: string;
};

/* GPU families, matched on the unmasked renderer string (ANGLE on Windows
   reports e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 ...)").

   Deliberately narrow. Only families that are weak for a shadowed, bloomed
   scene of this size are named; anything unrecognised — discrete NVIDIA and
   AMD, Apple silicon, Intel Arc, current phones — keeps the full profile and
   the measured calibration, which is the only thing that actually knows. */
/** Intel HD/UHD (not Iris), Mali-4xx/T/G3x/G5x, Adreno 3xx–61x, PowerVR. */
const WEAK_GPU =
  /\b(?:U?HD Graphics(?! *Iris))\b|Mali-(?:4|T|G[35]\d)|Adreno \(TM\) (?:[345]\d\d|6[01]\d)|PowerVR/i;
/** Iris / Iris Xe, AMD integrated Radeon, Adreno 62x+, Mali-G6x/G7x. */
const MEDIUM_GPU =
  /\bIris\b|Radeon(?:\(TM\))? (?:Vega|Graphics)|Adreno \(TM\) 6[2-9]\d|Mali-G[67]\d/i;

function probeDevice(): DeviceProfile {
  const fail: DeviceProfile = { software: false, modest: false, weak: false, gpu: "" };
  if (typeof window === "undefined" || typeof document === "undefined") return fail;

  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  let modest = cores <= 2 || memory <= 2;

  let software = false;
  let weak = false;
  let gpu = "";
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const name = info
        ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "")
        : "";
      software = /swiftshader|llvmpipe|softpipe|basic render|software|微软/i.test(name);
      weak = WEAK_GPU.test(name);
      gpu = name;
      if (MEDIUM_GPU.test(name)) modest = true;
      // Hand the context back rather than waiting for the GC to do it: there
      // are only so many per page, and the real one still has to be created.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // A blocked or unavailable context tells us nothing. Assume capable and
    // let the measuring loop find out, which is the old behaviour.
  }
  return { software, modest, weak, gpu };
}

/** What the frame gives up once the pixel ratio has nothing left to give.

    The ratio is the first lever because it is the only one that changes
    nothing about the picture — same scene, same lights, same animation, just
    resolved softer. When a device cannot hold the scene even at the floor,
    the next cheapest thing to lose is the work that is least of the image:

      1  post-processing. Bloom is a five-level Gaussian and a full-frame
         composite for a glow on the lamps at dusk. The lamps stay lit.
      2  the shadow pass, which is an entire second render of the scene every
         frame. The contact shadow under the truck is a texture and survives.

    Geometry is deliberately not on this list. Detail density is chosen once at
    mount from the device class, and rebuilding the scene graph mid-session to
    drop containers would cost far more than it saves — and would change the
    composition, which the brief rules out.

    Both steps are taken behind the poster during calibration wherever
    possible, because each one costs a React commit and a renderer
    reconfiguration. Post-reveal they are reachable only from DIRE, where the
    alternative is a scene nobody can scroll. */
type Tier = 0 | 1 | 2;

/** The calibration phase, which is the whole reason the rest of this can
    afford to be patient.

    Starting at the ceiling means any device that cannot hold it pays for
    finding that out, and paying for it mid-scroll is what the reader feels.
    But there is a window where nobody can see the cost: the poster covers the
    canvas until the reveal, and the scene behind it is already rendering real
    frames. So the search runs there — short windows, committed on the spot,
    no waiting for a still moment — and the reveal waits for it to finish. */
/* The search stops at the first ratio that holds, rather than measuring for a
   fixed stretch and then revealing.

   It can, because of where it runs: gated on precompile, on a warm scene, with
   nothing else competing for the frame. A clean window there means the device
   holds this ratio, and measuring three more of them only delays the reveal —
   which is the whole cost being paid here. The earlier cut of this always ran
   the full window and put the live hero about 800ms behind the poster.

   A device that needs to step down still steps: each step restarts the count,
   so the search walks 1.75 -> 1.5 -> 1.25 as far as it has to, and the ceiling
   below bounds the whole thing. What changes is that hardware which was always
   going to be fine stops paying for the hardware that is not.

   The window stays long enough to mean something. 200ms is twelve frames at
   60fps, and what it is looking for is a frame that missed its refresh
   outright, so a window that size is ample evidence either way — see MISS_MS.
   On a device far below 60fps it is four frames, which is all that is needed
   to know the answer is "lower". */
const CALIBRATE_WINDOW_MS = 200;
const CALIBRATE_MIN_FRAMES = 4;
/* Long enough to be clear of the load, short enough not to be the reveal.

   At 120ms the first calibration window was still catching the tail of page
   load — a GC, the last texture uploads, the chunk that just finished
   parsing — and reading it as the device. Measured, that cost a capable
   desktop a step of pixel ratio on every load: it settled at 1.25 where the
   same machine holds 1.5 comfortably. The cap keeps a slow device from
   sitting here. */
const CALIBRATE_WARMUP_MS = 300;
const CALIBRATE_WARMUP_FRAMES = 4;
const CALIBRATE_WARMUP_CAP_MS = 800;
/** Clean windows needed to stop the search. */
const CALIBRATE_CONFIRM = 1;
/** Ceiling on the whole search, for a device still stepping down when it
    expires. Long enough for the two steps that reach the floor from the cap. */
const CALIBRATE_MS = 850;
/* Not done here, having been tried and measured: sweeping p across the whole
   story during this window so the search sees the expensive beats rather than
   a stationary dock frame.

   It reads well and it does not work. The first pass over a beat is also the
   pass that uploads its textures, so the sweep measures its own warm-up and
   concludes the device is slower than it is — on the throttled mobile profile
   that alone cost a step of pixel ratio, 1.5 down to 1.25, on a device whose
   frame times never went near the budget. Running it twice to separate warming
   from measuring needs about 1.5s of poster to fit, against the 330ms the
   reveal costs now.

   And it bought nothing measurable: with the sweep and without it, the same
   two resolution changes land across a 14s scrub, because what the sweep
   cannot reproduce is the rest of the page — ScrollTrigger, the springs, the
   chapter crossfade and the compositing of the copy over a moving canvas —
   which is most of what makes a scrolling frame cost more than a still one.
   The steps that remain are handled where they belong, by landing them in the
   gaps between gestures. */

/** A queued change that sheds a Tier rather than moving the ratio. */
const DEGRADE = -1;

/** How still the scroll has to be before a change is allowed to land. */
const IDLE_MS = 180;

/** A resize is never allowed to interrupt a gesture.

    This used to give up waiting after 2.2s and commit anyway, on the argument
    that a sustained 30fps is worse than one hitch. Measured, that argument was
    backwards: the only scroll pattern that never pauses is a synthetic one,
    and it was the only pattern still showing dropped frames — 7.6% of them,
    every one a resize landing inside a gesture the deadline had forced it
    into. Real input always has gaps; a wheel stops between ticks, a flick
    ends, a thumb lifts. Waiting for one costs nothing and removes the whole
    category.

    The exception is a device so far past the budget that "scrolling" is not
    what is happening to it. At four frames a second there is no smooth gesture
    left to protect, and refusing to act would strand it there. That wait is
    long enough that no ordinary device reaches it. */
const DIRE_DEADLINE_MS = 6000;

/** Minimum quiet between two changes, whatever the readings say. One resize
    is a hitch; two in quick succession is a stutter, and the second is usually
    a reaction to the first. */
const COOLDOWN_MS = 1200;

/** Adaptive render resolution.

    The pixel ratio cap is a guess made at mount from `window.devicePixelRatio`,
    and that number says nothing about the GPU behind it — a 2019 phone and a
    current one both report 3. This closes the loop: it watches the actual
    frame time and steps the ratio down when the device is not keeping up.

    Nothing is removed at any step. Shading cost scales with the square of
    this, so 1.75 -> 1.5 is a quarter of the fragments off the budget while the
    scene, its geometry, its lighting and its animation are all untouched —
    the frame just resolves slightly softer, and only on hardware that was
    dropping frames at the higher ratio anyway.

    It only ever goes down, and that is the whole of why it is stable.

    It used to climb back too, and that is what made it thrash: across one
    benchmark session it changed the ratio seventeen times, walking
    1.75 -> 1.5 -> 1.25 -> 1.0 -> 1.25 -> 1.0 and back up again. Each change
    costs a React commit plus a renderer and composer resize — 96-119ms of
    scheduler time and another 52-86ms in the frame callback, measured off the
    Long Animation Frame API — so the loop meant to smooth the scroll was
    itself every hitch in it. A ratchet that only allowed the ceiling to fall
    cut it to three, and the three were still a step down, a speculative step
    back up and a step down again.

    Climbing cannot be made stable here, because the thing it is measuring is
    not stationary: the dock and the yard draw roughly twice what the highway
    does, so any rule that reads "comfortable, try more" will find the highway
    comfortable and then fail at the yard, forever. And it is not needed, which
    is the actual point — the search starts at the ceiling and works down, so
    the ratio it stops at is already the highest one this device held. There is
    nothing above it to climb back to.

    So: pick it once behind the poster, lower it if a later beat proves it
    wrong, and otherwise leave it alone for the rest of the session. */

/* The chosen ratio is reported up to HeroScene, which owns it as state and
   passes it to <Canvas dpr>. Calling R3F's setDpr directly did not stick:
   Canvas re-runs configure() on every one of its renders — including each
   debounced scroll re-measure once the sticky panel moves — and configure
   resets the ratio to whatever the `dpr` prop says. With the prop at the
   ceiling, one step down lasted until the next re-measure, then the scene
   sat at the full ratio for good while this loop believed it was at the
   floor. Measured: DPR 1.0 early in the scroll, 1.75 for the rest of it. */
function AdaptiveResolution({
  max,
  start,
  progress,
  ready,
  lowPath,
  onChange,
  onCalibrated,
  onDegrade,
  canDegrade,
}: {
  max: number;
  /** Where the ratio begins, which the device probe may set below the
      ceiling. Never above it. */
  start: number;
  /** Raw scroll progress. Read only to tell moving from still. */
  progress: MutableRefObject<number>;
  /** Set once precompile has finished. Nothing here measures before it.

      Page load is the worst possible thing to time a GPU against: hydration,
      the GSAP import, the poster decode and every first texture upload land in
      the same second, and on a throttled phone they are most of the frame.
      Calibrating through that reads the load, not the device, and steps the
      ratio down for it — measured, that alone cost the mobile profile a step,
      1.5 to 1.25, on a run whose frame times never once went over budget. */
  ready: MutableRefObject<boolean>;
  /** The low-quality path, which antialiases in the canvas and may therefore
      go further down than the high one. */
  lowPath: boolean;
  onChange: (dpr: number) => void;
  /** Fired once the opening search has settled, so the reveal can wait. */
  onCalibrated: () => void;
  /** Asks for the next tier of rendering work to be dropped, once the pixel
      ratio is at its floor and the frame is still over budget. */
  onDegrade: () => void;
  /** Whether there is anything left to drop. */
  canDegrade: boolean;
}) {
  const current = useRef(start);
  const acc = useRef(0);
  const frames = useRef(0);
  const warmup = useRef(0);
  const warmedAt = useRef(0);
  const windowAt = useRef(0);
  const bad = useRef(0);
  /** Frames in this window that missed their refresh outright. */
  const missed = useRef(0);
  /** Consecutive comfortable windows during calibration. */
  const clean = useRef(0);
  /** Consecutive windows far enough over budget to skip to the floor. */
  const dire = useRef(0);
  /** A decided change, waiting for a still moment to land. */
  const pending = useRef(0);
  const pendingAt = useRef(0);
  const lastP = useRef(-1);
  const stillSince = useRef(0);
  const startedAt = useRef(0);
  const calibrating = useRef(true);
  const committedAt = useRef(0);
  /* Which floor, keyed to the path rather than guessed from the ceiling.

     This read `max <= 1.25 ? 0.75 : 1.25`, which was meant to say "phones may
     go lower" and did not: a phone's ceiling is 1.5, so it failed the test and
     took the desktop branch. Phones could not go below 1.25 at all — the floor
     written for them was unreachable, and a device pinned at 1.25 and still
     dropping frames had nowhere left to go. Confirmed under sustained
     overload: the ratio stopped at 1.25 and stayed there while the frame time
     climbed past 250ms.

     The high path stops at 1.25 because its composer target carries no MSAA
     (see HeroEffects) and the pixel ratio is the only antialiasing it has. The
     low path keeps the canvas's own multisampling, so its edges survive the
     way down and 0.75 of a 3x screen is still 2.25 device pixels per CSS
     pixel, which no phone resolves. */
  const floor = dprFloor(lowPath);

  useFrame((_, delta) => {
    /* Measure the device, and only the device.

       This discarded any frame over half a second as an anomaly, and under
       real overload that is every frame worth measuring: the p95 was 567ms and
       the worst 950ms, all thrown away, so the loop saw only the handful of
       frames fast enough to qualify and concluded things were fine. Twenty-one
       seconds passed between two resolution steps. Raising the bar to three
       seconds moved the problem rather than fixing it — on the high path the
       frames were slower still and the loop never ran at all.

       A device rendering at one frame a second is a device, not an anomaly.
       What is genuinely not a measurement is time the page spent backgrounded,
       and the platform says so directly rather than being inferred from a
       threshold. The remaining cap only catches the frame a tab resumes on. */
    if (document.hidden || delta > 10) return;

    const now = performance.now();
    if (startedAt.current === 0) {
      if (!ready.current) return;
      startedAt.current = now;
    }
    // Calibration ends on the clock, not on a verdict: a device that is still
    // stepping down when the window closes simply carries on under the patient
    // rules, and one that settled early has already released the reveal below.
    if (calibrating.current && now - startedAt.current > CALIBRATE_MS) {
      calibrating.current = false;
      onCalibrated();
    }
    const fast = calibrating.current;

    // How long the scroll has been still. ScrollTrigger writes `progress` on
    // every wheel or touch tick, so "unchanged" is exactly "not scrolling".
    //
    // Raw input, deliberately, not the paced story value. Waiting for the
    // story to settle as well was tried and measured worse: at 1440 on a 2x
    // panel a device that cannot hold its ratio while the story moves then
    // drops 14–18 frames over the whole catch-up instead of taking one step.
    const p = progress.current;
    if (p !== lastP.current) {
      lastP.current = p;
      stillSince.current = now;
    }
    const still = now - stillSince.current > IDLE_MS;

    const warmFrames = fast ? CALIBRATE_WARMUP_FRAMES : WARMUP_MIN_FRAMES;
    const warmMs = fast ? CALIBRATE_WARMUP_MS : WARMUP_MS;
    const warmCap = fast ? CALIBRATE_WARMUP_CAP_MS : WARMUP_CAP_MS;

    if (pending.current) {
      // Behind the poster nothing is on screen to disturb; after it, only a
      // genuine pause in the scroll will do — or, for a device far past the
      // budget, an eventual deadline.
      const dire = now - pendingAt.current > DIRE_DEADLINE_MS;
      if (fast || still || dire) {
        const next = pending.current;
        pending.current = 0;
        committedAt.current = now;
        if (next === DEGRADE) onDegrade();
        else {
          current.current = next;
          onChange(next);
        }
        // The resize frame and the one after it are not measurements of
        // anything, so start the next window from scratch — but a short one.
        // The scene is already warm; only the framebuffer changed, and a full
        // run-up here is what made walking down to the floor take three
        // windows' worth of waiting per step on the devices doing the walking.
        warmup.current = Math.max(0, warmFrames - 2);
        warmedAt.current = now - Math.max(0, warmMs - 100);
        windowAt.current = 0;
        acc.current = 0;
        frames.current = 0;
        bad.current = 0;
      }
      return;
    }

    // The opening frames carry shader links and the first texture uploads and
    // measure nothing steady — but the calibration phase cannot afford to sit
    // out all of them, so it takes a shorter run-up.
    if (warmup.current === 0) warmedAt.current = now;
    const warmedOut = now - warmedAt.current > warmCap;
    if (warmup.current < warmFrames && !warmedOut) {
      warmup.current += 1;
      return;
    }
    if (now - warmedAt.current < warmMs && !warmedOut) return;
    if (windowAt.current === 0) windowAt.current = now;

    acc.current += delta;
    frames.current += 1;
    if (delta * 1000 > MISS_MS) missed.current += 1;
    const minFrames = fast ? CALIBRATE_MIN_FRAMES : WINDOW_MIN_FRAMES;
    const windowMs = fast ? CALIBRATE_WINDOW_MS : WINDOW_MS;
    if (frames.current < minFrames || now - windowAt.current < windowMs) return;
    windowAt.current = now;

    const avg = acc.current / frames.current;
    const misses = missed.current;
    const frameCount = frames.current;
    acc.current = 0;
    frames.current = 0;
    missed.current = 0;

    // Cooldown. A resize takes a frame or two to settle, and reacting to those
    // frames is how a loop talks itself down a ladder it did not need.
    if (!fast && committedAt.current && now - committedAt.current < COOLDOWN_MS) {
      bad.current = 0;
      dire.current = 0;
      missed.current = 0;
      return;
    }

    const stepDown = (toFloor = false) => {
      if (current.current <= floor) {
        // Nothing left in the ratio. Shed a tier of work instead — and only
        // then, which is what keeps a capable device at full quality.
        //
        // Queued like a ratio step rather than applied on the spot. Dropping
        // the shadow pass flips every material's shadow defines, so each
        // program recompiles on its next draw: done mid-gesture, that is a
        // stall of the whole scene's shader set inside a scroll frame.
        if (canDegrade) {
          clean.current = 0;
          bad.current = 0;
          pending.current = DEGRADE;
          pendingAt.current = now;
        }
        return;
      }
      pending.current = toFloor ? floor : Math.max(floor, current.current - DPR_STEP);
      pendingAt.current = now;
      bad.current = 0;
      dire.current = 0;
      // A step invalidates every reading taken at the old ratio, including the
      // clean ones — the search has to re-earn its exit at the new one.
      clean.current = 0;
    };

    // Far enough below the budget that stepping is a waste of windows.
    //
    // Confirmed over two windows rather than one, because this is the only
    // rung that skips straight to the floor and a single window can be a
    // straggling upload rather than a slow device. Two of them back to back is
    // not noise, and a genuinely dire device produces the pair inside half a
    // second.
    if (avg > DIRE) {
      dire.current += 1;
      if (dire.current >= 2) {
        bad.current = 0;
        stepDown(true);
      }
      return;
    }
    dire.current = 0;

    // Calibration keeps a ratio only if the window was clean — see MISS_MS.
    if (fast) {
      if (misses > 0) {
        stepDown();
        return;
      }
    } else if (avg > SEVERE) {
      // Half rate. Do not wait for a second opinion.
      bad.current = 0;
      stepDown();
      return;
    }

    if (!fast && (avg > BAD || misses / Math.max(1, frameCount) > MISS_RATIO)) {
      bad.current += 1;
      // Two windows, so one unlucky stretch — a texture upload, a GC, a
      // background tab waking — cannot cost the whole frame's resolution.
      if (bad.current >= 2) stepDown();
      return;
    }

    bad.current = 0;
    if (fast) {
      clean.current += 1;
      if (clean.current >= CALIBRATE_CONFIRM) {
        calibrating.current = false;
        onCalibrated();
      }
    }
  });

  return null;
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
/** Soft contact shadow so the truck sits on the road rather than hovering. */
function ContactShadow() {
  const tex = useDisposable(useMemo(
    () =>
      radialTexture([
        [0, "rgba(0,0,0,0.68)"],
        [0.55, "rgba(0,0,0,0.3)"],
        [1, "rgba(0,0,0,0)"],
      ]),
    [],
  ));
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
/** Contact shadow + the primitive-built truck. There is no .glb path: the
    scene ships no models, and the probe that used to look for one cost two
    guaranteed 404s per mount plus GLTFLoader in the hero chunk. */
function Truck(props: {
  wheels: MutableRefObject<THREE.Group | null>;
  doors: MutableRefObject<THREE.Group | null>;
  quality: Quality;
}) {
  return (
    <>
      <ContactShadow />
      <BuiltTruck {...props} />
    </>
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
  const rimFace = useRimFace();

  /* Wheel materials, built once and shared by all sixteen.

     They used to be sixteen inline <meshStandardMaterial> elements, i.e.
     sixteen material objects describing the same rubber. Sharing them is
     the cheaper half of this change; the visible half is below.

     A cylinder comes in three groups — lateral surface, then the two caps —
     so passing an array puts tread on the running surface *only*. Before,
     one material carried the tread normal map across the whole tyre and the
     sidewalls were cut with tread blocks too, which no tyre has: the lugs
     wrapped around onto the flat face and read as noise on a dark disc. */
  const tread = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#141518",
          // Not a perfect 1: real rubber holds a broad sheen along the
          // shoulder, and at roughness 1 with no environment the tyre
          // renders as an unlit black hole in the bodywork.
          roughness: 0.82,
          metalness: 0,
          envMapIntensity: 0.4,
          normalMap: rubber,
          normalScale: new THREE.Vector2(1.5, 1.5),
        }),
      [rubber],
    ),
  );
  /* Sidewall: smoother and a touch darker than the tread. A tyre's flank is
     moulded, not cut, so it catches a broad soft highlight where the tread
     scatters it. */
  const sidewall = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#101114",
          roughness: 0.92,
          metalness: 0,
          envMapIntensity: 0.25,
        }),
      [],
    ),
  );
  /* Rim: the face carries the spokes, bolts and hub cap as relief; the
     lateral band stays plain, because that edge is the barrel and it is
     smooth on a real wheel. */
  const rimEdge = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#ccd2d9",
          roughness: 0.2,
          metalness: 0.8,
          envMapIntensity: 2.6,
        }),
      [],
    ),
  );
  const rimDisc = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#ccd2d9",
          // Slightly rougher than the barrel: the face is the part that
          // collects road film, and a mirror-bright disc is the other half
          // of why the old rim read as a sticker.
          roughness: 0.28,
          metalness: 0.85,
          envMapIntensity: 2.2,
          normalMap: rimFace,
          normalScale: new THREE.Vector2(1.1, 1.1),
        }),
      [rimFace],
    ),
  );

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
      {/* The contact shadow is drawn once, by <Truck> above. It used to be
          mounted here as well — two identical planes stacked, which doubled
          the darkness under the trailer. */}

      {/* Container body — clearcoat over the paint gives it a lacquered
          highlight that plain roughness cannot produce. */}
      <mesh position={[0, 2.5, -1.35]} castShadow={cast} receiveShadow={cast}>
        <Rounded w={2.6} h={2.85} d={7.3} r={0.09} />
        <meshPhysicalMaterial
          color={WHITE}
          roughness={0.34}
          metalness={0.08}
          clearcoat={0.7}
          // Was rougher than the base coat underneath it, which is backwards:
          // a lacquer is the smoothest layer on the vehicle. At 0.28 the
          // horizon band in the environment smeared into a grey wash and the
          // flank read as primer.
          clearcoatRoughness={0.14}
          envMapIntensity={1.25}
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
          quad here sat between the camera and the cab and hazed the paint.

          Named, not ref'd: the rig strikes these at dusk by looking the group
          up once, which costs nothing and — unlike a prop — survives the
          swap to an imported .glb, where the group simply is not there. Each
          emitter carries its lit intensity in userData, so the ramp scales
          the value the material was authored with rather than a magic
          number kept in a second place. */}
      <group name="lamps">
      {[-0.85, 0.85].map((x) => (
        <group key={`h${x}`}>
          {/* Emitter, recessed. */}
          <mesh position={[x, 1.6, 4.3]} userData={{ lit: 4.2 }}>
            <boxGeometry args={[0.5, 0.24, 0.12]} />
            <meshStandardMaterial
              color="#fff3d8"
              emissive="#ffd9a0"
              emissiveIntensity={0.45}
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
          <mesh position={[x, 1.5, -5.06]} userData={{ lit: 3.4 }}>
            <boxGeometry args={[0.34, 0.5, 0.08]} />
            <meshStandardMaterial
              color="#ff5a3c"
              emissive="#ff2f14"
              emissiveIntensity={0.7}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      {/* Marker lamps along the roof edge and the container top rail — the
          amber outline that identifies a truck at dusk from any angle. */}
      {[-1.05, -0.35, 0.35, 1.05].map((x) => (
        <mesh key={`m${x}`} position={[x, 3.58, 2.78]} userData={{ lit: 3 }}>
          <boxGeometry args={[0.16, 0.08, 0.12]} />
          <meshStandardMaterial
            color="#ffb057"
            emissive="#ff9d3c"
            emissiveIntensity={0.3}
            toneMapped={false}
          />
        </mesh>
      ))}
      </group>

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
                {/* Tread on the running surface, sidewall on the flanks.
                    The material array maps to a cylinder's three groups —
                    lateral, top cap, bottom cap — so the tread normal map
                    stops at the shoulder the way a moulded tyre does.

                    32 segments at high, up from 22: at the dock beat the
                    camera is close enough that the old silhouette faceted
                    visibly along the top of the tyre. Ten extra segments on
                    a cylinder is nothing next to being able to see the
                    flat spots. The low path is untouched. */}
                <mesh
                  rotation={[0, 0, Math.PI / 2]}
                  castShadow={cast}
                  material={[tread, sidewall, sidewall]}
                >
                  <cylinderGeometry args={[0.72, 0.72, 0.4, quality === "high" ? 32 : 10]} />
                </mesh>
                {/* Only the outer tyre of a pair shows a rim. */}
                {(!dual || off > 1.2) && (
                  <group position={[side * 0.21, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                    {/* Barrel plain, face carrying the spokes and bolts. */}
                    <mesh material={[rimEdge, rimDisc, rimDisc]}>
                      <cylinderGeometry args={[0.42, 0.42, 0.04, quality === "high" ? 28 : 8]} />
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

    Both quality tiers now use the reflective, alpha-blended dielectric that
    phones always had. Any transmissive material makes the renderer draw every
    opaque object a second time into a full-resolution, multisampled half-float
    transmission buffer and rebuild its mips — every frame, since the cab is
    always on screen. At the distance the hero shows the cab the two read
    nearly the same; the cab interior still shows through the alpha.

    ponytail: transmission dropped on desktop for the second scene pass; bring
    it back for a close-up cab shot, gated on that shot only. */
function glass(_quality: Quality, tint: string, opacity: number) {
  return {
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

  /* Five draw calls per run instead of one per member. The back-wall racking
     alone was twelve uprights, six beams and fifty-four pallet/stock meshes,
     and there are three runs of it in the shed.

     The stock keeps its two materials, because timber and board are genuinely
     different surfaces — one is rough and plain, the other carries the flute
     relief — and the wide/narrow split rides the instance scale rather than a
     second geometry. */
  const uprightGeo = useOwned(useMemo(() => new THREE.BoxGeometry(0.14, 6.2, 1.1), []));
  const uprightMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#3f6ea8", roughness: 0.5, metalness: 0.7 }),
      [],
    ),
  );
  const beamGeo = useOwned(
    useMemo(() => new THREE.BoxGeometry(bays * 2.8, 0.12, 0.09), [bays]),
  );
  const beamMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#e08a24", roughness: 0.5, metalness: 0.5 }),
      [],
    ),
  );
  const palletGeo = useOwned(useMemo(() => new THREE.BoxGeometry(1.9, 0.11, 0.95), []));
  const palletMat = useOwned(
    useMemo(() => new THREE.MeshStandardMaterial({ color: "#9a7444", roughness: 0.95 }), []),
  );
  // Unit width, scaled per instance to the wide or narrow pallet load.
  const loadGeo = useOwned(useMemo(() => new THREE.BoxGeometry(1, 1.05, 0.9), []));
  const timberMat = useOwned(
    useMemo(() => new THREE.MeshStandardMaterial({ color: "#b98a4e", roughness: 0.9 }), []),
  );
  const boardMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#c9a077",
          roughness: 0.98,
          normalMap: ribs,
          normalScale: new THREE.Vector2(0.3, 0.3),
        }),
      [ribs],
    ),
  );

  const rows = useMemo(() => {
    const uprights: Pose[] = [];
    const beams: Pose[] = [];
    const pallets: Pose[] = [];
    const timber: Pose[] = [];
    const board: Pose[] = [];
    for (let b = 0; b <= bays; b++) uprights.push([b * 2.8, 3.1, 0, 0, 0, 0, 1, 1, 1]);
    for (const y of [0.1, 2.15, 4.2]) {
      for (const z of [-0.42, 0.42]) {
        beams.push([(bays * 2.8) / 2, y, z, 0, 0, 0, 1, 1, 1]);
      }
    }
    for (const p of stock) {
      pallets.push([p.x, p.y + 0.13, 0, 0, 0, 0, 1, 1, 1]);
      (p.timber ? timber : board).push([
        p.x, p.y + 0.72, 0, 0, 0, 0, p.wide ? 1.85 : 1.3, 1, 1,
      ]);
    }
    return { uprights, beams, pallets, timber, board };
  }, [bays, stock]);

  return (
    <group>
      <Instanced geometry={uprightGeo} material={uprightMat} poses={rows.uprights} cast />
      <Instanced geometry={beamGeo} material={beamMat} poses={rows.beams} />
      <Instanced geometry={palletGeo} material={palletMat} poses={rows.pallets} />
      <Instanced geometry={loadGeo} material={timberMat} poses={rows.timber} cast />
      <Instanced geometry={loadGeo} material={boardMat} poses={rows.board} cast />
    </group>
  );
}

function Forklift({
  body,
  carriage,
}: {
  body: MutableRefObject<THREE.Group | null>;
  carriage: MutableRefObject<THREE.Group | null>;
}) {
  return (
    <group ref={body} position={[0, 0, -9]}>
      <BuiltForklift carriage={carriage} />
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

/** The standing stock of an FMCG godown: blocks of palletised cartons on
    the slab, wall to wall behind the working bay.

    Two draw calls for roughly four hundred boxes. Modelled as blocks rather
    than scattered singles because that is how a real warehouse stores — a
    pallet footprint, cartons stacked square on it, aisles wide enough for the
    machine between them — and because a block is what reads as volume from
    the dock camera. Scattered boxes read as debris.

    The forklift's working lane and the racking runs are carved out of the
    grid rather than avoided by luck: a block placed there is a block the
    machine drives through. */
function StockField({ quality, flute }: { quality: Quality; flute: THREE.Texture | null }) {
  const lite = quality === "low";
  const cartonGeo = useOwned(useMemo(() => new THREE.BoxGeometry(1, 1, 1), []));
  const palletGeo = useOwned(useMemo(() => new THREE.BoxGeometry(1.34, 0.13, 1.14), []));
  const palletMat = useOwned(
    useMemo(() => new THREE.MeshStandardMaterial({ color: "#9a7444", roughness: 0.95 }), []),
  );
  const cartonMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#c29c74",
          roughness: 0.97,
          metalness: 0,
          normalMap: flute,
          normalScale: new THREE.Vector2(0.4, 0.4),
        }),
      [flute],
    ),
  );

  const { cartons, pallets } = useMemo(() => {
    const rand = prng(880413);
    const cartons: Pose[] = [];
    const pallets: Pose[] = [];

    // World coordinates. The slab runs x -18..18, z -38..-8; the forklift
    // lane is x -9..2 / z -17..-5 and the long rack sits across z -15.2.
    const blocked = (x: number, z: number) =>
      (x > -9.5 && x < 2.5 && z > -17.5 && z < -4) || (z > -16.2 && z < -13.4);

    for (let x = -17; x <= 17; x += 3.1) {
      for (let z = -37; z <= -8; z += 2.6) {
        if (blocked(x, z)) continue;
        if (rand() < 0.34) continue; // aisles and gaps — a solid slab looks fake
        const jx = x + (rand() - 0.5) * 0.4;
        const jz = z + (rand() - 0.5) * 0.3;
        const yaw = (rand() - 0.5) * 0.14;
        pallets.push([jx, 0.07, jz, 0, yaw, 0, 1, 1, 1]);
        // Cartons stacked square on the pallet: two by two by up to three.
        const high = 1 + Math.floor(rand() * (lite ? 2 : 3));
        for (let k = 0; k < high; k++) {
          for (const cx of [-0.32, 0.32]) {
            for (const cz of [-0.27, 0.27]) {
              // The odd missing box off the top course reads as stock being
              // picked; a perfectly cubic stack reads as a texture swatch.
              if (k === high - 1 && rand() < 0.22) continue;
              const w = 0.6 + rand() * 0.05;
              const h = 0.5 + rand() * 0.06;
              cartons.push([
                jx + cx * Math.cos(yaw) - cz * Math.sin(yaw),
                0.14 + h / 2 + k * 0.54,
                jz + cx * Math.sin(yaw) + cz * Math.cos(yaw),
                0,
                yaw + (rand() - 0.5) * 0.1,
                0,
                w,
                h,
                w * 0.86,
              ]);
            }
          }
        }
      }
    }
    return { cartons, pallets };
  }, [lite]);

  return (
    <>
      <Instanced geometry={palletGeo} material={palletMat} poses={pallets} receive />
      <Instanced
        geometry={cartonGeo}
        material={cartonMat}
        poses={cartons}
        cast={!lite}
        receive={!lite}
      />
    </>
  );
}

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
  const shutter = useRef<THREE.Group>(null);
  const ribs = useCorrugation();
  // Relief and wetness only. useAsphalt's albedo is a near-black aggregate,
  // and multiplying the concrete's grey by it turned the whole dock apron —
  // the ground every early shot is looking at — into dark tarmac. The
  // normal and roughness maps are what make a poured slab read as poured;
  // the colour is the material's own.
  const asphalt = useAsphalt(9);
  const concrete = useMemo(
    () => (asphalt ? { normalMap: asphalt.normalMap, roughnessMap: asphalt.roughnessMap } : {}),
    [asphalt],
  );
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

  /* Ten high-bay fittings, two meshes each, all identical and all static —
     twenty draw calls deep in the shed for two. */
  const hbBodyGeo = useOwned(useMemo(() => new THREE.BoxGeometry(1.9, 0.24, 0.8), []));
  const hbBodyMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#33353c", roughness: 0.7, metalness: 0.4 }),
      [],
    ),
  );
  const hbTubeGeo = useOwned(useMemo(() => new THREE.BoxGeometry(1.7, 0.07, 0.62), []));
  const hbTubeMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#fff2d4",
          emissive: "#ffd79a",
          emissiveIntensity: 4,
        }),
      [],
    ),
  );
  const highBay = useMemo(() => {
    const bodies: Pose[] = [];
    const tubes: Pose[] = [];
    for (const x of [-13, -6.5, 0, 6.5, 13]) {
      for (const z of [-9, -13.5]) {
        bodies.push([x, 10.4, z, 0, 0, 0, 1, 1, 1]);
        tubes.push([x, 10.25, z, 0, 0, 0, 1, 1, 1]);
      }
    }
    return { bodies, tubes };
  }, []);

  useFrame(({ clock }) => {
    const p = progress.current;
    // The load runs while the truck is docked and dead still — see
    // travelled(), which is flat from DOCK_B to LOAD_END.
    const t = clamp01((p - (DOCK_B + 0.02)) / 0.16);

    // Roller shutter on the working bay. Up well before the truck starts
    // backing in, down once it has pulled away.
    if (shutter.current) {
      const up =
        smooth(clamp01((p - 0.04) / 0.07)) * (1 - smooth(clamp01((p - LOAD_END) / 0.06)));
      // Rolls into the lintel: the group's origin is the head box, so
      // scaling Y is the curtain winding up rather than a panel shrinking.
      shutter.current.scale.y = Math.max(0.02, 1 - up * 0.95);
    }

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
    haze.current = 1 - smooth(clamp01((p - (LOAD_END + 0.02)) / 0.09));
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
      {/* Shell. Profiled steel cladding, and lit like it — at #15161c these
          three walls were a black void behind the bays, which is the "flat
          black building" failure exactly: a shed reads as a shed because the
          ribs catch the key light down one flank. */}
      <mesh position={[0, 7, -16]} receiveShadow>
        <boxGeometry args={[46, 15, 1]} />
        <meshStandardMaterial
          color="#4a505c"
          roughness={0.72}
          metalness={0.35}
          normalMap={ribs}
          normalScale={new THREE.Vector2(1.2, 1.2)}
        />
      </mesh>
      {[-19, 19].map((x) => (
        <mesh key={x} position={[x, 7, 0]} receiveShadow>
          <boxGeometry args={[1, 15, 34]} />
          <meshStandardMaterial
            color="#454b56"
            roughness={0.72}
            metalness={0.35}
            normalMap={ribs}
            normalScale={new THREE.Vector2(1.2, 1.2)}
          />
        </mesh>
      ))}
      <mesh position={[0, 14.2, 0]}>
        <boxGeometry args={[40, 1, 34]} />
        <meshStandardMaterial color="#2f343d" roughness={0.9} metalness={0.3} />
      </mesh>

      {/* Concrete bay floor — poured slab with expansion joints, so the dock
          reads as an industrial building rather than a hole in the road. */}
      {/* Poured slab, and it runs out past the bay doors to cover the yard
          the truck stages and reverses on. It stopped at the building line
          before, so the apron under the dock — the one surface every early
          shot is looking at — was highway asphalt. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 7]} receiveShadow>
        <planeGeometry args={[46, 66]} />
        <meshStandardMaterial
          color="#6b6862"
          roughness={0.78}
          metalness={0.12}
          envMapIntensity={0.9}
          normalScale={new THREE.Vector2(0.5, 0.5)}
          {...(concrete ?? {})}
        />
      </mesh>
      {[-16, -8, 0, 8, 16].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, 7]}>
          <planeGeometry args={[0.12, 66]} />
          <meshStandardMaterial color="#4c4a45" roughness={1} />
        </mesh>
      ))}

      {/* A row of dock bays, not one hole in a wall. The truck occupies the
          middle one; the neighbours give the building a reason to be this
          wide and read as a working godown. */}
      {/* The bay line sits where the trailer's rear doors actually stop.
          travelled() bottoms out at 0, which puts the tail at z = -5, and
          the bays were four units behind that — the truck reversed to a
          halt short of the building and read as parked beside it rather
          than docked. */}
      {[-13.5, 0, 13.5].map((bay) => (
        <group key={bay} position={[bay, 0, 15]}>
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
          {/* Shutter head box — the drum the curtain winds onto. */}
          <mesh position={[0, 9.05, -0.3]} castShadow>
            <boxGeometry args={[9.4, 0.7, 0.7]} />
            <meshStandardMaterial color="#5a5f66" roughness={0.5} metalness={0.65} />
          </mesh>
          {/* Roller shutter. The working bay's is animated — it lifts before
              the truck backs on and comes down once it has gone; the
              neighbours stay shut, which is what makes the open one read as
              the bay in use. */}
          <group
            ref={bay === 0 ? shutter : undefined}
            position={[0, 8.7, -0.3]}
            scale={bay === 0 ? [1, 0.02, 1] : [1, 1, 1]}
          >
            <mesh position={[0, -4.4, 0]} castShadow receiveShadow>
              <boxGeometry args={[8.9, 8.8, 0.12]} />
              <meshStandardMaterial
                color="#7d8189"
                roughness={0.55}
                metalness={0.6}
                normalMap={ribs}
                normalScale={new THREE.Vector2(0.8, 0.8)}
              />
            </mesh>
          </group>
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
        <mesh position={[0, 0.66, -4.2]} rotation={[-0.19, 0, 0]} receiveShadow>
          <boxGeometry args={[2.5, 0.12, 2.7]} />
          <meshStandardMaterial color="#5b5f66" roughness={0.55} metalness={0.7} />
        </mesh>
        {[-1.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 0.55, -4.5]} castShadow receiveShadow>
            <boxGeometry args={[0.35, 1.1, 2.2]} />
            <meshStandardMaterial color="#2a2c32" roughness={0.9} />
          </mesh>
        ))}
        {/* Striped kerbs marking the bay edge. */}
        {[-2.6, 2.6].map((x) => (
          <mesh key={`k${x}`} position={[x, 0.18, -3.6]} castShadow receiveShadow>
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
      {/* High-bay fittings deeper into the shed. Emissive only: a point
          light per fixture is a light per fixture to shade every fragment
          with, and at this depth all they have to do is be visibly the
          source of the light already in the room. */}
      <Instanced geometry={hbBodyGeo} material={hbBodyMat} poses={highBay.bodies} />
      <Instanced geometry={hbTubeGeo} material={hbTubeMat} poses={highBay.tubes} />
      <pointLight position={[0, 8, -12]} color="#ffdcae" intensity={190} distance={40} />
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

        <StockField quality={quality} flute={flute} />

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

/** Dual carriageway: asphalt, a planted central median, lane paint, kerbs,
    guardrails and lighting. Laid out from the constants at the top of the
    file, so the paint and the traffic cannot disagree about where the lanes
    are. */
function Road({ quality }: { quality: Quality }) {
  const asphalt = useAsphalt(90);
  const lite = quality === "low";
  const step = lite ? 20 : 11;

  // Lane dashes. Laid out ahead of the truck: the route runs +Z from the
  // dock at -20 to the yard at +380, so the carriageway has to cover that,
  // not its mirror.
  const dashZ = useMemo(
    () =>
      Array.from({ length: Math.ceil((RAIL_END - HWY_A) / step) }, (_, i) => HWY_A + i * step),
    [step],
  );

  // Guardrail posts, both shoulders, ending at the terminal gate.
  const postGeo = useOwned(useMemo(() => new THREE.BoxGeometry(0.14, 0.86, 0.14), []));
  const postMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#6d7076", roughness: 0.45, metalness: 0.8 }),
      [],
    ),
  );
  const posts = useMemo<Pose[]>(() => {
    const gap = lite ? 12 : 7;
    const out: Pose[] = [];
    for (let z = HWY_A; z < RAIL_END; z += gap) {
      for (const x of [RAIL_L, RAIL_R]) out.push([x, 0.43, z, 0, 0, 0, 1, 1, 1]);
    }
    return out;
  }, [lite]);

  // Reflective delineators on the rail — the small orange markers that pick
  // out the road edge once the sun is down.
  const eyeGeo = useOwned(useMemo(() => new THREE.BoxGeometry(0.14, 0.2, 0.1), []));
  const eyeMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#f28c28",
          emissive: "#f28c28",
          emissiveIntensity: 2.2,
          toneMapped: false,
        }),
      [],
    ),
  );
  const eyes = useMemo<Pose[]>(() => {
    const out: Pose[] = [];
    for (let z = HWY_A + 6; z < RAIL_END; z += lite ? 36 : 18) {
      out.push([RAIL_L + 0.14, 1.0, z, 0, 0, 0, 1, 1, 1]);
      out.push([RAIL_R - 0.14, 1.0, z, 0, 0, 0, 1, 1, 1]);
    }
    return out;
  }, [lite]);

  const dashGeo = useOwned(useMemo(() => new THREE.PlaneGeometry(0.24, 4.4), []));
  const paintMat = useOwned(
    useMemo(
      () =>
        // Standard, not basic: unlit white held full brightness through dusk
        // while the tarmac around it darkened, so the markings looked lit
        // from within. Road paint is a rough surface.
        new THREE.MeshStandardMaterial({ color: "#e9e6df", roughness: 0.72, metalness: 0 }),
      [],
    ),
  );
  const dashes = useMemo<Pose[]>(
    () =>
      dashZ.flatMap((z) =>
        [DASH_NB, DASH_SB].map(
          (x) => [x, 0.03, z, -Math.PI / 2, 0, 0, 1, 1, 1] as Pose,
        ),
      ),
    [dashZ],
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

      {/* Carriageway. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ROAD_MID, 0.01, 190]}
        receiveShadow={quality === "high"}
      >
        <planeGeometry args={[ROAD_W, 460]} />
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

      {/* Laterite shoulders, the red-brown verge of a Kerala highway. Held
          to the highway band like the rest of the furniture: run the full
          length of the road they cut two brown stripes across the concrete
          dock apron. */}
      {[ROAD_L - 3.2, ROAD_R + 3.2].map((x) => (
        <mesh key={`sh${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.0, HWY_MID]}>
          <planeGeometry args={[6.4, HWY_LEN]} />
          <meshStandardMaterial color="#63483a" roughness={1} envMapIntensity={0.5} />
        </mesh>
      ))}

      {/* Kerbs. A carriageway with no raised edge reads as paint on a plane;
          the shadow line under a kerb is what gives the road thickness. */}
      {[ROAD_L + 0.16, ROAD_R - 0.16].map((x) => (
        <mesh key={`kb${x}`} position={[x, 0.11, HWY_MID]} receiveShadow castShadow={!lite}>
          <boxGeometry args={[0.32, 0.22, HWY_LEN]} />
          <meshStandardMaterial color="#b8b2a6" roughness={0.9} />
        </mesh>
      ))}

      {/* Continuous edge lines. */}
      {[ROAD_L + 0.7, ROAD_R - 0.7].map((x) => (
        <mesh key={`el${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.03, HWY_MID]}>
          <planeGeometry args={[0.2, HWY_LEN]} />
          <primitive object={paintMat} attach="material" />
        </mesh>
      ))}
      <Instanced geometry={dashGeo} material={paintMat} poses={dashes} />

      {/* Central median — a raised planted divider, which is both what
          separates the two carriageways in reality and what stops oncoming
          traffic reading as traffic in the hero's own lane. It runs only
          along the highway: the warehouse apron and the terminal yard both
          need the full width. */}
      <group position={[MEDIAN_X, 0, (HWY_A + HWY_B) / 2]}>
        <mesh position={[0, 0.16, 0]} castShadow={!lite} receiveShadow>
          <boxGeometry args={[MEDIAN_W, 0.32, HWY_B - HWY_A]} />
          <meshStandardMaterial color="#a9a396" roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.34, 0]} receiveShadow>
          <boxGeometry args={[MEDIAN_W - 0.5, 0.06, HWY_B - HWY_A]} />
          <meshStandardMaterial color="#4a5c33" roughness={1} />
        </mesh>
      </group>

      {/* Guardrails, unbroken along both shoulders — and stopping at the
          yard entrance, where a real terminal opens out. */}
      {[RAIL_L, RAIL_R].map((x) => (
        <mesh key={`rail${x}`} position={[x, 0.86, (HWY_A + RAIL_END) / 2]} castShadow={!lite}>
          <boxGeometry args={[0.1, 0.34, RAIL_END - HWY_A]} />
          <meshStandardMaterial
            color="#b6bac0"
            roughness={0.3}
            metalness={0.95}
            envMapIntensity={2.4}
          />
        </mesh>
      ))}
      <Instanced geometry={postGeo} material={postMat} poses={posts} />
      <Instanced geometry={eyeGeo} material={eyeMat} poses={eyes} />
    </group>
  );
}

/** Highway lighting: a mast line down the far verge, and the lamps that
    come on with the dusk.

    Which verge is a framing decision as much as a real one. The camera works
    the near (left) shoulder the whole way, so a pole line there is a pole
    line through the lens; down the median the poles stand between the camera
    and the truck and cut the hero vehicle in half every forty units. On the
    far shoulder they are always behind the subject, and the arm reaches back
    over the carriageway so they still light the road they are lighting.

    The lamp heads share one material, so "the lights come on" is a single
    emissive ramp rather than a hundred objects to keep in step. */
function Streetlights({
  progress,
  quality,
}: {
  progress: MutableRefObject<number>;
  quality: Quality;
}) {
  const lite = quality === "low";
  const gap = lite ? 74 : 42;

  const poleGeo = useOwned(useMemo(() => new THREE.CylinderGeometry(0.11, 0.2, 9.6, 6), []));
  const armGeo = useOwned(useMemo(() => new THREE.BoxGeometry(3.4, 0.14, 0.14), []));
  const headGeo = useOwned(useMemo(() => new THREE.BoxGeometry(0.9, 0.16, 0.42), []));
  const steel = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#7c8087", roughness: 0.45, metalness: 0.8 }),
      [],
    ),
  );
  const lamp = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#2a2b2e",
          emissive: "#ffdca6",
          emissiveIntensity: 0,
          toneMapped: false,
        }),
      [],
    ),
  );

  const { poles, arms, heads } = useMemo(() => {
    const poles: Pose[] = [];
    const arms: Pose[] = [];
    const heads: Pose[] = [];
    const x = ROAD_R + 1.5;
    for (let z = HWY_A + 10; z < HWY_B; z += gap) {
      poles.push([x, 5.1, z, 0, 0, 0, 1, 1, 1]);
      arms.push([x - 1.7, 9.6, z, 0, 0, -0.09, 1, 1, 1]);
      heads.push([x - 3.3, 9.42, z, 0, 0, 0, 1, 1, 1]);
    }
    return { poles, arms, heads };
  }, [gap]);

  useFrame(() => {
    // Up through the golden hour, full by the time the yard is in shot.
    lamp.emissiveIntensity = smooth(clamp01((progress.current - 0.74) / 0.12)) * 6;
  });

  return (
    <>
      <Instanced geometry={poleGeo} material={steel} poses={poles} cast={!lite} />
      <Instanced geometry={armGeo} material={steel} poses={arms} />
      <Instanced geometry={headGeo} material={lamp} poses={heads} />
    </>
  );
}

/** A coconut frond as an alpha mask: a central rib with leaflets combed off
    it at an angle. Two triangles per frond instead of forty, and at the
    distance the highway is ever seen, the silhouette is the whole read. */
function useFrond() {
  return useShared("frond", () => {
    const W = 128;
    const H = 64;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, W, H);
    const rand = prng(41207);
    // Rib, tapering to the tip and drooping slightly.
    const rib = (u: number) => H / 2 + Math.pow(u, 2.2) * 14;
    ctx.strokeStyle = "#4f6a2a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      if (i === 0) ctx.moveTo(u * W, rib(u));
      else ctx.lineTo(u * W, rib(u));
    }
    ctx.stroke();
    // Leaflets, both sides, shortening toward the tip.
    ctx.lineWidth = 2;
    for (let i = 2; i < 62; i++) {
      const u = i / 62;
      const x = u * W;
      const y = rib(u);
      const len = (1 - Math.pow(u, 1.6)) * 26 * (0.75 + rand() * 0.45);
      const g = 60 + rand() * 42;
      ctx.strokeStyle = `rgb(${38 + g * 0.35},${72 + g},${28 + g * 0.3})`;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 6, y + side * len * 0.55, x + 11, y + side * len);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Roadside Kerala: coconut palms, banana-leaf undergrowth and scrub.

    Everything here is instanced — six draw calls for a couple of thousand
    objects — and everything is placed from one seeded PRNG, so the corridor
    is identical on every mount and nothing pops between renders.

    Placement is not decorative. The camera flies the left shoulder out to
    x = -35 at the apex of the bend, so the left verge gets scrub only, and
    every palm tall enough to meet a lens lives either well behind that path
    or on the right-hand side, where it is behind the truck in shot. */
function Greenery({ quality }: { quality: Quality }) {
  const lite = quality === "low";
  const frond = useFrond();

  const trunkGeo = useOwned(useMemo(() => new THREE.CylinderGeometry(0.17, 0.32, 1, 6), []));
  const trunkMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#7d6a52", roughness: 0.95, metalness: 0 }),
      [],
    ),
  );
  const frondGeo = useOwned(useMemo(() => new THREE.PlaneGeometry(3.6, 1.8), []));
  const frondMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          map: frond ?? undefined,
          // alphaTest, not blending: fronds overlap each other constantly and
          // a transparent pass would sort them wrong from every angle.
          transparent: true,
          alphaTest: 0.45,
          side: THREE.DoubleSide,
          roughness: 0.85,
          metalness: 0,
          color: "#c8d6b4",
        }),
      [frond],
    ),
  );
  // Subdivided once and smooth-shaded. A flat-shaded icosahedron is a
  // faceted lump, and at the size these were first built — up to 3.5 units
  // across — the verge read as a field of green boulders, which is exactly
  // the low-poly look this is supposed to avoid. Real roadside scrub is
  // knee-to-waist high and there is a lot of it.
  const bushGeo = useOwned(useMemo(() => new THREE.IcosahedronGeometry(1, 1), []));
  const bushMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#43602e", roughness: 1 }),
      [],
    ),
  );
  // Upright and narrow. Built as a wide shallow quad it lay almost flat on
  // the verge and read as sheets of green card dropped on the ground.
  const leafGeo = useOwned(useMemo(() => new THREE.PlaneGeometry(0.42, 1.5), []));
  const leafMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          color: "#456029",
          roughness: 1,
          side: THREE.DoubleSide,
        }),
      [],
    ),
  );

  const { trunks, fronds, bushes, leaves } = useMemo(() => {
    const rand = prng(773311);
    const trunks: Pose[] = [];
    const fronds: Pose[] = [];
    const bushes: Pose[] = [];
    const leaves: Pose[] = [];

    // Palms. Right-hand side close in (they read behind the truck), left-hand
    // side only beyond x = -30, which is outside the camera's flight path.
    const palms = lite ? 34 : 84;
    for (let i = 0; i < palms; i++) {
      const z = HWY_A - 10 + rand() * (HWY_B - HWY_A + 24);
      const right = rand() > 0.34;
      const x = right ? 10.5 + rand() * 11 : -31 - rand() * 15;
      const h = 8.5 + rand() * 6.5;
      const lean = (rand() - 0.5) * 0.22;
      const spin = rand() * Math.PI * 2;
      trunks.push([x, h / 2, z, 0, 0, lean, 1, h, 1]);
      // Crown sits at the top of the leaned trunk.
      const cx = x + Math.sin(lean) * -h * 0.5;
      const cy = h * Math.cos(lean);
      const blades = lite ? 5 : 8;
      for (let f = 0; f < blades; f++) {
        const a = spin + (f / blades) * Math.PI * 2;
        const droop = -0.34 - rand() * 0.3;
        const len = 0.85 + rand() * 0.4;
        fronds.push([
          cx + Math.cos(a) * 1.5 * len,
          cy + 0.35 + Math.sin(droop) * 0.9,
          z + Math.sin(a) * 1.5 * len,
          droop * Math.sin(a),
          -a,
          droop * Math.cos(a),
          len,
          len,
          len,
        ]);
      }
    }

    // Scrub along both verges: knee to waist high, dense, and clumped in
    // twos and threes rather than dotted, which is how scrub actually grows
    // and what stops a regular scatter reading as a pattern. Low enough for
    // the camera to fly the left shoulder over the top of it.
    const clumps = lite ? 240 : 620;
    for (let i = 0; i < clumps; i++) {
      const z = HWY_A - 16 + rand() * (HWY_B - HWY_A + 32);
      const side = rand() > 0.5 ? 1 : -1;
      const cx = side > 0 ? ROAD_R + 1.4 + rand() * 15 : ROAD_L - 1.4 - rand() * 22;
      for (let k = 0, n = 1 + Math.floor(rand() * 3); k < n; k++) {
        const r = 0.3 + rand() * 0.34;
        bushes.push([
          cx + (rand() - 0.5) * 1.5,
          r * 0.62,
          z + (rand() - 0.5) * 1.5,
          0,
          rand() * 3.1,
          0,
          r * 1.25,
          r * 0.85,
          r * 1.25,
        ]);
      }
    }

    // Blade clumps: broad-leaf shoots on the verges and low planting down
    // the median. Each clump is a few blades splayed from one root, tilted
    // outward rather than laid down, so they stand up off the ground.
    const clumpCount = lite ? 60 : 170;
    for (let i = 0; i < clumpCount; i++) {
      const median = rand() > 0.5;
      const z = HWY_A + rand() * HWY_LEN;
      const x = median
        ? MEDIAN_X + (rand() - 0.5) * (MEDIAN_W - 0.8)
        : rand() > 0.5
          ? ROAD_R + 3.4 + rand() * 10
          : ROAD_L - 3.4 - rand() * 12;
      const base = median ? 0.34 : 0.0;
      const h = median ? 0.42 + rand() * 0.26 : 0.6 + rand() * 0.5;
      for (let k = 0, n = 3 + Math.floor(rand() * 3); k < n; k++) {
        const a = rand() * Math.PI * 2;
        const tilt = 0.15 + rand() * 0.45;
        leaves.push([
          x + Math.sin(a) * 0.2,
          base + h * 0.46,
          z + Math.cos(a) * 0.2,
          Math.cos(a) * tilt,
          a,
          -Math.sin(a) * tilt,
          h,
          h,
          h,
        ]);
      }
    }

    return { trunks, fronds, bushes, leaves };
  }, [lite]);

  return (
    <>
      <Instanced geometry={trunkGeo} material={trunkMat} poses={trunks} cast={!lite} />
      {/* Fronds do not cast. A low sun stretches an alpha-cut frond into a
          hard black slash several units long, and a verge full of them read
          as debris scattered over the road rather than as dappled shade —
          the trunks carry the shadow story on their own. */}
      <Instanced geometry={frondGeo} material={frondMat} poses={fronds} />
      <Instanced geometry={bushGeo} material={bushMat} poses={bushes} receive />
      <Instanced geometry={leafGeo} material={leafMat} poses={leaves} />
    </>
  );
}

/* ── Traffic ─────────────────────────────────────────────────────────────
   Five vehicles, five silhouettes, on the lanes the paint actually marks.

   Position is a pure function of scroll, never of elapsed time. That is the
   whole reason traffic can exist here at all: the brief requires the story to
   scrub backwards, and anything integrated over a clock keeps driving forward
   while the user scrolls up. Solving for position from travelled(p) means
   reversing the scroll reverses the traffic, wheels included.

   Collision-freedom is structural rather than checked. Vehicles sharing a
   lane share a rate, so their spacing is a constant of the motion; vehicles
   in different lanes cannot meet because the lanes are 3+ units apart and
   nothing changes lane. The hero's own clearance is the lane geometry noted
   at the top of the file.                                                  */

/** Recycling window, in units of road ahead of and behind the truck. */
const TRAFFIC_SPAN = 300;
/** How much of that sits ahead: traffic should mostly be arriving. */
const TRAFFIC_LEAD = 0.66;

type Kind = "car" | "suv" | "truck";

const FLEET: Array<{
  kind: Kind;
  color: string;
  lane: number;
  dir: 1 | -1;
  /** Fraction of the hero's speed. Same-lane vehicles must share this, or
      their spacing drifts and they eventually drive through each other. */
  rate: number;
  offset: number;
}> = [
  { kind: "car", color: "#eef1f3", lane: LANE_SB_IN, dir: -1, rate: 0.62, offset: 0 },
  { kind: "suv", color: "#b4bac2", lane: LANE_SB_IN, dir: -1, rate: 0.62, offset: 150 },
  { kind: "car", color: "#9e2420", lane: LANE_SB_OUT, dir: -1, rate: 0.74, offset: 70 },
  { kind: "suv", color: "#2a2e35", lane: LANE_NB_OUT, dir: 1, rate: 0.7, offset: 40 },
  // Deliberately not a white box on a coloured cab: that is the hero's own
  // livery, and in the side-tracking shot the two silhouettes merged.
  { kind: "truck", color: "#356b4a", lane: LANE_NB_OUT, dir: 1, rate: 0.7, offset: 190 },
];

/** Body proportions and tyre radius per class. The radius is not cosmetic —
    wheel spin is distance over radius, and a wrong one visibly slips. */
const SHAPE: Record<Kind, { l: number; w: number; h: number; r: number; axles: number[] }> = {
  car: { l: 4.4, w: 1.86, h: 0.78, r: 0.33, axles: [1.3, -1.35] },
  suv: { l: 4.9, w: 1.96, h: 1.02, r: 0.38, axles: [1.5, -1.5] },
  truck: { l: 8.4, w: 2.5, h: 1.5, r: 0.52, axles: [2.7, -1.6, -2.9] },
};

/** One background vehicle. Not the hero, so it is built for silhouette and
    for the two things that identify a car at 60 units: a glasshouse that is
    darker and narrower than the body, and lamps at both ends. */
function Vehicle({ kind, color, quality }: { kind: Kind; color: string; quality: Quality }) {
  const s = SHAPE[kind];
  const cast = quality === "high";
  const seg = cast ? 14 : 8;
  const glassMat = (
    <meshPhysicalMaterial
      color="#141b22"
      roughness={0.08}
      metalness={0.2}
      clearcoat={1}
      clearcoatRoughness={0.05}
      envMapIntensity={2.4}
    />
  );

  return (
    <group>
      {/* Lower body. */}
      <mesh position={[0, s.r + s.h / 2, 0]} castShadow={cast}>
        <Rounded w={s.w} h={s.h} d={s.l} r={0.16} />
        <meshPhysicalMaterial
          color={color}
          roughness={0.26}
          metalness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.06}
          envMapIntensity={1.9}
        />
      </mesh>

      {kind === "truck" ? (
        <>
          {/* Day cab forward, box body behind — a different vehicle class,
              not the hero at another scale. */}
          <mesh position={[0, s.r + s.h + 0.85, s.l * 0.3]} castShadow={cast}>
            <Rounded w={s.w - 0.08} h={1.7} d={2.1} r={0.14} />
            <meshPhysicalMaterial
              color={color}
              roughness={0.28}
              metalness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.06}
            />
          </mesh>
          <mesh position={[0, s.r + s.h + 1.35, -s.l * 0.17]} castShadow={cast}>
            <Rounded w={s.w} h={2.6} d={5.2} r={0.09} />
            <meshStandardMaterial color="#b9bdb6" roughness={0.62} metalness={0.1} />
          </mesh>
          <mesh position={[0, s.r + s.h + 1.15, s.l * 0.3 + 1.06]}>
            <boxGeometry args={[s.w - 0.34, 0.9, 0.06]} />
            {glassMat}
          </mesh>
        </>
      ) : (
        <>
          {/* Glasshouse: shorter than the body and set back, which is the
              proportion that separates a car from a brick. */}
          <mesh
            position={[0, s.r + s.h + (kind === "suv" ? 0.46 : 0.36), -s.l * 0.06]}
            castShadow={cast}
          >
            <Rounded
              w={s.w - 0.22}
              h={kind === "suv" ? 0.92 : 0.72}
              d={s.l * (kind === "suv" ? 0.58 : 0.5)}
              r={0.18}
            />
            {glassMat}
          </mesh>
          {/* Roof, so the greenhouse is not a solid block of glass. */}
          <mesh position={[0, s.r + s.h + (kind === "suv" ? 0.9 : 0.71), -s.l * 0.08]}>
            <Rounded
              w={s.w - 0.3}
              h={0.08}
              d={s.l * (kind === "suv" ? 0.5 : 0.42)}
              r={0.04}
            />
            <meshPhysicalMaterial
              color={color}
              roughness={0.26}
              metalness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.06}
            />
          </mesh>
        </>
      )}

      {/* Lamps. Emissive, so the bloom pass picks them up once the sun goes. */}
      {[-1, 1].map((sx) => (
        <mesh
          key={`hl${sx}`}
          position={[sx * (s.w / 2 - 0.3), s.r + s.h * 0.62, s.l / 2 + 0.01]}
        >
          <boxGeometry args={[0.38, 0.16, 0.06]} />
          <meshStandardMaterial
            color="#fff4dd"
            emissive="#ffe0ad"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
      ))}
      {[-1, 1].map((sx) => (
        <mesh
          key={`tl${sx}`}
          position={[sx * (s.w / 2 - 0.28), s.r + s.h * 0.62, -s.l / 2 - 0.01]}
        >
          <boxGeometry args={[0.32, 0.14, 0.06]} />
          <meshStandardMaterial
            color="#ff5a3c"
            emissive="#ff2f14"
            emissiveIntensity={1.8}
            toneMapped={false}
          />
        </mesh>
      ))}

      <group name="w">
        {s.axles.flatMap((z) =>
          [-1, 1].map((sx) => (
            <group key={`${z}-${sx}`} position={[sx * (s.w / 2 - 0.1), s.r, z]}>
              <mesh rotation={[0, 0, Math.PI / 2]} castShadow={cast}>
                <cylinderGeometry args={[s.r, s.r, 0.24, seg]} />
                <meshStandardMaterial color="#141518" roughness={1} />
              </mesh>
              <mesh position={[sx * 0.125, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[s.r * 0.6, s.r * 0.6, 0.03, seg]} />
                <meshStandardMaterial
                  color="#c3c9d1"
                  roughness={0.25}
                  metalness={0.85}
                  envMapIntensity={2.2}
                />
              </mesh>
            </group>
          )),
        )}
      </group>
    </group>
  );
}

/** The traffic stream. Lives inside the world group, so the coastal bend
    carries it across with the road rather than leaving it on a straight
    line the tarmac has left. */
function Traffic({
  progress,
  quality,
}: {
  progress: MutableRefObject<number>;
  quality: Quality;
}) {
  const grp = useRef<THREE.Group>(null);
  const fleet = quality === "high" ? FLEET : FLEET.slice(0, 3);

  useFrame(() => {
    const g = grp.current;
    if (!g) return;
    const p = progress.current;
    const run = travelled(p);
    // Off the road before the warehouse apron and after the terminal gate:
    // a car in the dock or in the container yard is worse than no car.
    const live = run > HWY_A - 40 && run < HWY_B + 10;
    g.visible = live;
    if (!live) return;

    g.children.forEach((v, i) => {
      const c = fleet[i];
      if (!c) return;
      // Solve the vehicle's position relative to the truck. The closing rate
      // (dir*rate - 1) is negative for every entry — same-direction traffic
      // is slower than the hero and oncoming traffic is closing — so every
      // vehicle enters ahead and leaves behind, never the other way round.
      const rel =
        wrap(c.offset + (c.dir * c.rate - 1) * run, TRAFFIC_SPAN) -
        TRAFFIC_SPAN * (1 - TRAFFIC_LEAD);
      v.position.set(c.lane, 0, run + rel);
      v.rotation.y = c.dir > 0 ? 0 : Math.PI;

      const wheels = (v.userData.w ??= v.getObjectByName("w")) as THREE.Object3D | null;
      if (wheels) {
        const spin = (c.dir * c.rate * run) / SHAPE[c.kind].r;
        for (const w of wheels.children) w.rotation.x = spin;
      }
    });
  });

  return (
    <group ref={grp}>
      {fleet.map((c, i) => (
        <group key={i}>
          <Vehicle kind={c.kind} color={c.color} quality={quality} />
        </group>
      ))}
    </group>
  );
}

/** The warehouse's own gate: security cabin, sliding leaf, signage and the
    hazard kerbs that mark the exit onto the public road. This is the beat
    between the dock and the highway — without it the truck simply teleports
    from a private apron onto a national highway. */
function ExitGate({
  progress,
  quality,
}: {
  progress: MutableRefObject<number>;
  quality: Quality;
}) {
  const hazard = useHazard();
  const link = useChainLink();
  const logo = useLogo();
  const leaf = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(() => {
    const p = progress.current;
    // Slides open ahead of the truck and shuts behind it. Driven off
    // distance, not p, so it can never close on the trailer.
    const run = travelled(p);
    const open = smooth(clamp01((run - (EXIT_Z - 60)) / 34)) * (1 - smooth(clamp01((run - (EXIT_Z + 26)) / 26)));
    if (leaf.current) leaf.current.position.x = -open * 7.4;
    if (glow.current) glow.current.emissiveIntensity = smooth(clamp01((p - 0.72) / 0.12)) * 3.2;
  });

  return (
    <group position={[0, 0, EXIT_Z]}>
      {/* Gate posts either side of the exit lane. */}
      {[-8.6, 8.6].map((x) => (
        <mesh key={`p${x}`} position={[x, 2.6, 0]} castShadow>
          <boxGeometry args={[0.8, 5.2, 0.8]} />
          <meshStandardMaterial color="#4a4e57" roughness={0.55} metalness={0.65} />
        </mesh>
      ))}
      {/* Header beam with the company mark on it. */}
      <mesh position={[0, 5.5, 0]} castShadow>
        <boxGeometry args={[18, 1.4, 0.6]} />
        <meshStandardMaterial color="#8f1d29" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 5.5, 0.32]}>
        <planeGeometry args={[7.2, 1.0]} />
        <meshStandardMaterial map={logo} roughness={0.7} {...DECAL} />
      </mesh>

      {/* Sliding leaf, chain-link in a steel frame. */}
      {link && (
        <group ref={leaf} position={[0, 0, -0.5]}>
          <mesh position={[3.9, 1.9, 0]}>
            <planeGeometry args={[7.4, 3.6]} />
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
          {[0.3, 7.5].map((x) => (
            <mesh key={x} position={[x, 1.9, 0]}>
              <boxGeometry args={[0.1, 3.8, 0.1]} />
              <meshStandardMaterial color="#8d939b" roughness={0.4} metalness={0.8} />
            </mesh>
          ))}
        </group>
      )}

      {/* Security cabin, off the right shoulder with a lit window. */}
      <group position={[11.6, 0, -1.5]}>
        <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.4, 3, 3]} />
          <meshStandardMaterial color="#ddd8cf" roughness={0.85} />
        </mesh>
        <mesh position={[0, 3.16, 0]} castShadow>
          <boxGeometry args={[4, 0.28, 3.6]} />
          <meshStandardMaterial color="#8f1d29" roughness={0.7} />
        </mesh>
        <mesh position={[-1.72, 1.9, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[2.2, 1.2]} />
          <meshStandardMaterial
            ref={glow}
            color="#2a2b2e"
            emissive="#ffe0b0"
            emissiveIntensity={0}
            toneMapped={false}
          />
        </mesh>
        {quality === "high" && (
          <pointLight position={[-2.4, 2.2, 0]} color="#ffd9a4" intensity={26} distance={12} />
        )}
      </group>

      {/* Hazard kerbs marking the lane through the gate. */}
      {[-8.6, 8.6].map((x) => (
        <mesh key={`k${x}`} position={[x, 0.45, 2.4]} castShadow receiveShadow>
          <boxGeometry args={[1.0, 0.9, 1.0]} />
          <meshStandardMaterial map={hazard ?? undefined} roughness={0.55} metalness={0.2} />
        </mesh>
      ))}
      {/* Stop bar across the exit lane. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, -3.4]}>
        <planeGeometry args={[16, 0.5]} />
        <meshStandardMaterial color="#e9e6df" roughness={0.72} />
      </mesh>
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

  /* Deck cargo, one draw call per ship instead of one per box — up to sixty
     seven on the near ship alone, and both ships are in frame for the whole
     yard beat. Colours ride an instanced attribute, so the palette is the
     same palette. */
  const cargoGeo = useOwned(useMemo(() => new THREE.BoxGeometry(5.1, 2.5, 6.4), []));
  const cargoMat = useOwned(
    useMemo(
      () =>
        varied(
          new THREE.MeshStandardMaterial({
            color: "#ffffff",
            roughness: 1,
            metalness: 0.4,
            envMapIntensity: 1.1,
            normalMap: ribs,
            normalScale: new THREE.Vector2(1, 1),
          }),
        ),
      [ribs],
    ),
  );

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

  const cargo = useMemo(
    () => ({
      poses: bays.map((c) => [c.x, c.y, c.z, 0, 0, 0, 1, 1, 1] as Pose),
      tint: bays.map((c) => c.color),
      rough: bays.map(() => 0.58),
    }),
    [bays],
  );

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
      <Instanced
        geometry={cargoGeo}
        material={cargoMat}
        poses={cargo.poses}
        tint={cargo.tint}
        rough={cargo.rough}
        cast
        receive
      />
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
  const masts = useRef<THREE.Group>(null);
  /** Emissive materials and point lights per mast, resolved once.

      This used to `traverse()` all five masts on every frame — roughly
      thirty-five node visits and a fresh closure each, sixty times a second,
      to write two numbers per mast. The tree never changes shape after it is
      built, so the walk is pure repetition: the same predicate matches the
      same nodes for the life of the scene. Resolved on the first frame the
      group has children and read from a flat array after that, which is the
      shape `lamps` in Rig already uses for the truck's own emitters.

      The predicate is copied exactly, black-emissive standard materials
      included: every MeshStandardMaterial carries an `emissive` colour, so
      the old walk also wrote to the pole, base and head. Writing an
      intensity onto a black emissive changes nothing on screen, but keeping
      them in the set means this cannot differ from the traverse by even an
      unused assignment. */
  const mastNodes = useRef<
    Array<{ mats: THREE.MeshStandardMaterial[]; lights: THREE.PointLight[] }> | null
  >(null);

  // Unloading, once the truck has stopped. One move: the spreader comes
  // down beside the trailer, latches, lifts clear, and the trolley runs it
  // out over the stacks on the quay side.
  useFrame(({ clock }, delta) => {
    // Yard lighting comes up progressively rather than as one switch: each
    // mast strikes a beat after the one before it, the way a real yard's
    // photocells trip as the light falls. Staggering it is the difference
    // between "the sun set" and "someone flipped the yard on".
    if (masts.current) {
      // `children.length` and not just the null check: caching on a frame
      // where the group had mounted but its masts had not would freeze an
      // empty array in place and leave the yard dark for the whole run.
      if (mastNodes.current === null && masts.current.children.length > 0) {
        mastNodes.current = masts.current.children.map((mast) => {
          const mats: THREE.MeshStandardMaterial[] = [];
          const lights: THREE.PointLight[] = [];
          mast.traverse((o) => {
            const mesh = o as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
            if (mesh.isMesh && mat?.emissive) mats.push(mat);
            const light = o as unknown as THREE.PointLight;
            if (light.isPointLight) lights.push(light);
          });
          return { mats, lights };
        });
      }
      const nodes = mastNodes.current;
      if (nodes) {
        for (let i = 0; i < nodes.length; i++) {
          const k = smooth(clamp01((progress.current - (0.8 + i * 0.026)) / 0.05));
          const { mats, lights } = nodes[i];
          for (const mat of mats) mat.emissiveIntensity = k * 7;
          for (const light of lights) light.intensity = k * 300;
        }
      }
    }

    // Starts once the reverse has finished and the doors are open.
    const u = clamp01((progress.current - (BACK_B + 0.01)) / 0.045);
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

  /* The container field, as three draw calls.

     It was about two hundred and twenty. Each box was its own mesh with its
     own material (they differ in colour and in roughness), every top box
     carried four corner castings of their own, and every third box a branding
     plane — and the yard beat is where the frame budget was tightest, because
     all of it is on screen at once.

     Nothing about the picture changes: the colours and the per-box weathering
     ride instanced attributes (see varied()), and the castings and the decals
     are the same geometry at the same places. */
  const boxGeo = useOwned(useMemo(() => new THREE.BoxGeometry(6.1, 2.6, 2.5), []));
  const boxMat = useOwned(
    useMemo(
      () =>
        varied(
          new THREE.MeshStandardMaterial({
            color: "#ffffff",
            roughness: 1,
            roughnessMap: weather,
            metalness: 0.45,
            envMapIntensity: 1.2,
            normalMap: ribs,
            normalScale: new THREE.Vector2(1.1, 1.1),
          }),
        ),
      [weather, ribs],
    ),
  );
  const castGeo = useOwned(useMemo(() => new THREE.BoxGeometry(0.4, 0.22, 0.3), []));
  const castMat = useOwned(
    useMemo(
      () => new THREE.MeshStandardMaterial({ color: "#3b3f45", roughness: 0.5, metalness: 0.8 }),
      [],
    ),
  );
  const decalGeo = useOwned(useMemo(() => new THREE.PlaneGeometry(3.4, 1.25), []));
  const decalMat = useOwned(
    useMemo(
      () =>
        new THREE.MeshStandardMaterial({
          map: logo,
          roughness: 0.6,
          metalness: 0.3,
          ...DECAL,
        }),
      [logo],
    ),
  );

  const field = useMemo(() => {
    const boxes: Pose[] = [];
    const tint: string[] = [];
    const rough: number[] = [];
    const castings: Pose[] = [];
    const decals: Pose[] = [];
    stacks.forEach((c, i) => {
      boxes.push([c.x, c.y, c.z, 0, 0, 0, 1, 1, 1]);
      tint.push(c.color);
      rough.push(c.wear);
      if (quality === "high" && c.top) {
        for (const [cx, cz] of CORNER) {
          castings.push([c.x + cx, c.y + 1.32, c.z + cz, 0, 0, 0, 1, 1, 1]);
        }
      }
      if (i % 3 === 0) decals.push([c.x, c.y + 0.1, c.z - 1.27, 0, Math.PI, 0, 1, 1, 1]);
    });
    return { boxes, tint, rough, castings, decals };
  }, [stacks, quality]);

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
      <group ref={masts}>
      {[
        [48, -34],
        [-23, 6],
        [48, 4],
        [-23, 40],
        [48, 42],
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
                color="#2b2c30"
                emissive="#ffdca6"
                emissiveIntensity={0}
                toneMapped={false}
              />
            </mesh>
          ))}
          {quality === "high" && (
            <pointLight position={[0, 15, 0]} color="#ffdcae" intensity={0} distance={48} />
          )}
        </group>
      ))}
      </group>

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

      <Instanced
        geometry={boxGeo}
        material={boxMat}
        poses={field.boxes}
        tint={field.tint}
        rough={field.rough}
        cast
        receive
      />
      <Instanced geometry={castGeo} material={castMat} poses={field.castings} cast />
      {/* Branding on the flank of every third box — enough to read as a
          liveried yard, not so much that it tiles. */}
      <Instanced geometry={decalGeo} material={decalMat} poses={field.decals} />

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

/** Compile every material in the scene before the hero is revealed.

    three.js otherwise builds a program the first time a mesh is drawn, so the
    port, ship and fence materials compiled during the yard beat — mid-scroll.
    compile() walks the whole graph, visible or not; compileAsync then waits on
    KHR_parallel_shader_compile, so the work runs off the main thread.

    The high path draws through the composer's HDR target, and three keys a
    program on whether it renders to a target (no tone mapping, linear output).
    Compiling against a throwaway target builds those variants rather than
    canvas ones that would be thrown away when bloom mounts.

    Capped, never awaited open-ended: a driver without the extension, or one
    that stalls, still gets the scene after the timeout. */
const PRECOMPILE_TIMEOUT_MS = 2500;

function precompile(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: Quality,
) {
  /* Only where the driver can compile off the main thread.

     compileAsync is async about *waiting*, not about working: it calls
     compile() synchronously, which builds and links every program in the
     graph, and only then polls KHR_parallel_shader_compile for readiness.
     Where that extension exists the linking is handed to the driver and the
     polling is the slow part, which is exactly what the timeout below bounds.
     Where it does not, linkProgram blocks — around sixty programs, on the
     kind of GPU that has no parallel compile — and the timeout cannot
     interrupt a synchronous call. It is a hang, at the worst moment, on the
     weakest hardware.

     So on those drivers the materials compile as they are first drawn. That
     is a few small hitches spread through the scroll instead of one long
     freeze before the hero appears, and it is the better trade every time.

     A software rasteriser never reaches this: HeroScene renders nothing
     there. See probeDevice. */
  const parallel = gl.getContext().getExtension("KHR_parallel_shader_compile");
  if (!parallel) return Promise.resolve();

  const prev = gl.getRenderTarget();
  const probe =
    quality === "high"
      ? new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
      : null;
  let done: Promise<unknown> = Promise.resolve();
  try {
    gl.setRenderTarget(probe);
    done = gl.compileAsync(scene, camera);
  } catch {
    // Reveal anyway; first-draw compilation is the old behaviour.
  } finally {
    gl.setRenderTarget(prev);
    probe?.dispose();
  }
  return Promise.race([
    done.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, PRECOMPILE_TIMEOUT_MS)),
  ]);
}

/** Drives camera, world slide, wheel spin, rear doors and lighting mood. */
function Rig({
  progress,
  quality,
  dpr,
  startDpr,
  tier,
  onDpr,
  onTier,
  onVisible,
  onReady,
}: {
  progress: MutableRefObject<number>;
  quality: Quality;
  /** Ceiling for adaptive resolution, not the current ratio. */
  dpr: number;
  /** Where the ratio begins — the probe may start a weak device below the
      ceiling so it never has to render at one it cannot hold. */
  startDpr: number;
  /** How much rendering work has been shed. See Tier. */
  tier: Tier;
  onDpr: (dpr: number) => void;
  onTier: () => void;
  /** Whether the canvas is on (or about to be on) screen. See PauseOffscreen. */
  onVisible: (visible: boolean) => void;
  onReady?: () => void;
}) {
  const painted = useRef(false);
  const firstFrameAt = useRef(-1);
  // Two gates on the reveal, both of which the poster is covering for:
  // every material compiled, and the pixel ratio settled. Uncovering the
  // canvas before either is what put the cost on screen.
  const compiling = useRef(false);
  const compiled = useRef(false);
  const calibrated = useRef(false);
  const world = useRef<THREE.Group>(null);
  const truck = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const doors = useRef<THREE.Group>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const cabin = useRef<THREE.PointLight>(null);
  const spill = useRef<THREE.Mesh>(null);
  const beams = useRef<THREE.Mesh>(null);
  // Resolved once and cached as a flat list. This used to be a traverse() of
  // the lamp subtree on every single frame — a tree walk plus a material
  // lookup per node, 60 times a second, to write the same handful of
  // emissiveIntensity values. The set never changes after the truck is built.
  const lamps = useRef<Array<{ mat: THREE.MeshStandardMaterial; lit: number }> | null>(null);
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
  // only the camera would let it lag its own scenery. Paced by the same
  // curve as the DOM copy (see lib/pace), so text and scene stay in step.
  const eased = useRef(0);
  const paced = useRef<Pace>({ value: 0, rate: 0 });

  useProceduralEnv();
  // Tier 1 drops post-processing. The chunk is never even requested if the
  // device has already asked to shed it.
  const Effects = useEffectsChunk(quality === "high" && tier < 1);
  const shadows = quality === "high" && tier < 2;

  // Render a window onto a wider virtual frustum. Everything the camera
  // frames shifts right, clearing the left column for the copy — without
  // moving the canvas element and exposing a hard edge against the panel.
  // Numbers, not the size object: R3F replaces `size` whenever the canvas's
  // page offset moves (every debounced scroll once the sticky panel releases),
  // and subscribing to the object re-rendered this whole world for it.
  const width = useThree((st) => st.size.width);
  const height = useThree((st) => st.size.height);
  const size = { width, height };
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
    bias.current = narrow ? 0 : size.width < 1024 ? AIM_BIAS * 0.6 : AIM_BIAS;
    // On a portrait phone the *horizontal* axis is the binding one: a 52
    // degree vertical fov on a 0.46 aspect leaves about eleven units of
    // width at the hero's distance, and the truck is nine and a half long —
    // it was clipped at both ends on every beat. Backing the rig off along
    // its own view vector widens the frame without touching the shot's
    // angle, which is the composition, and it keeps the truck large relative
    // to the scenery instead of just fitting a wider lens around the lot.
    pull.current = narrow ? 1.42 : size.width < 1024 ? 1.14 : 1;
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
  const sunPos = useMemo(() => MOODS.map((m) => new THREE.Vector3(...m.sun)), []);
  const sunScratch = useMemo(() => new THREE.Vector3(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const aim = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const bias = useRef(AIM_BIAS);
  // How far the rig stands off its own shot, as a multiple of the authored
  // distance. See the viewport effect below.
  const pull = useRef(1);
  // The damped pose is kept separately from camera.position so the shake can
  // be an offset each frame instead of feeding itself back into the damping.
  const base = useMemo(() => new THREE.Vector3(...SHOTS[0].pos), []);
  // Where park() finally leaves the truck. The last camera keyframe is
  // composed against this spot, so the offset from it is exactly how far the
  // shot has to be dragged back to keep the truck in the same place in frame
  // while the manoeuvre is still running.
  const parked = useMemo(() => park(1), []);
  const markCalibrated = useCallback(() => {
    calibrated.current = true;
  }, []);

  useFrame(({ camera, scene, clock, gl }, delta) => {
    pace(paced.current, clamp01(progress.current), delta);
    eased.current = paced.current.value;
    const p = eased.current;
    const { i, t } = segment(p, SHOTS.length);
    const now = clock.elapsedTime;
    const z = travelled(p);
    vel.current = Math.abs(z - lastZ.current) / Math.max(delta, 1e-3);

    const pk = park(p);
    // Only the last beat has a subject that moves in world space: park()
    // carries the truck from the origin out to (20, 0, 8.4) inside that same
    // band. Composing the final shot against where it ends up meant that for
    // most of the band the camera was framing an empty patch of yard with the
    // truck somewhere off to the side — at 0.88 it was three metres from the
    // lens. Sliding the whole pose by the distance still to travel holds the
    // composition on the truck the entire way in.
    const tail = i === SHOTS.length - 2 ? t : 0;
    const lagX = (pk.x - parked.x) * tail;
    const lagZ = (pk.z - parked.z) * tail;

    // Aim point first: the pull-back below is measured from it.
    look.lerpVectors(camTar[i], camTar[i + 1], t);
    look.x += lagX;
    look.z += lagZ;

    // Damped toward the pose on the spline so a flung scrollbar glides
    // rather than snapping.
    scratch.lerpVectors(camPos[i], camPos[i + 1], t);
    scratch.x += lagX;
    scratch.z += lagZ;
    // Coastal leg flies as a drone rather than a locked-off elevated pose:
    // the same bend() that curves the road pushes the rig out over the
    // water and climbs it, then returns it for the yard approach.
    const arc = bend(p);
    // Pulled in hard. These multipliers were set against a bend three times
    // this wide, and at the apex they were throwing the rig 11 units further
    // out and 6 higher — the truck shrank to a quarter of the frame at
    // exactly the beat it is supposed to be the hero of.
    scratch.x -= arc * 5;
    scratch.y += arc * 2.2;
    scratch.z += Math.sin(arc * Math.PI) * 3.5;
    // No shake. The damped lerp is the only thing that moves the camera —
    // handheld noise on top of it competes with the scroll for authorship of
    // the motion, and at speed it was reading as dropped frames.
    if (pull.current !== 1) scratch.sub(look).multiplyScalar(pull.current).add(look);
    base.lerp(scratch, 1 - Math.pow(0.0015, delta));
    camera.position.copy(base);

    // Shift the aim point left of the subject, perpendicular to the view and
    // in the horizontal plane, so the truck lands right of the copy column
    // whatever direction the shot happens to look in.
    aim.subVectors(look, camera.position);
    // (-z, 0, x) of the forward vector is the camera's right in world space;
    // aiming that far to its left is what puts the subject to its right.
    const len = Math.hypot(aim.x, aim.z) || 1;
    look.x += (aim.z / len) * bias.current;
    look.z -= (aim.x / len) * bias.current;
    camera.lookAt(look);

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
    // Open once the trailer is actually on the dock, shut again as the
    // cargo is secured and before it pulls away — the "cargo secured" beat
    // is the doors closing, so it cannot happen while the load is still
    // going in or after the truck has moved.
    const shut =
      smooth(clamp01((p - DOCK_B) / 0.03)) *
      (1 - smooth(clamp01((p - (LOAD_END - 0.06)) / 0.05)));
    // Held until the reverse is done — doors swinging open mid-manoeuvre was
    // the tell that nothing was actually parking.
    const open = Math.max(shut, smooth(clamp01((p - (BACK_B - 0.01)) / 0.03))) * 2.0;

    if (doors.current) {
      doors.current.children.forEach((d) => {
        d.rotation.y = d.name === "right" ? -open : open;
        // Ram extends as the leaf swings — the secondary motion that makes
        // the hinge read as mechanical rather than as a rotate.
        //
        // Looked up once and kept on the leaf. getObjectByName walks the
        // subtree, and this ran twice a frame for the life of the scene to
        // find two nodes that never move within it — the same cache the
        // traffic loop keeps for its wheels.
        const ram = (d.userData.ram ??= d.getObjectByName("ram")) as
          | THREE.Object3D
          | undefined;
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
      // The sun actually moves. Its target is the origin, so the position is
      // the direction, and dropping it from y = 40 to y = 12 across the run
      // is what stretches the shadows out along the road at golden hour.
      // A warm tint with the sun still overhead is the orange-filter look.
      sunScratch.lerpVectors(sunPos[i], sunPos[i + 1], t);
      key.current.position.copy(sunScratch);
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
    // Sky fill follows the sky. Held at its daytime value it kept pouring
    // warm light into the yard after dusk, which is the single thing that
    // stops a night scene reading as night — the practicals cannot compete
    // with an ambient that never switched off.
    if (hemi.current) {
      hemi.current.intensity = 0.2 + 0.65 * clamp01(1 - smooth(clamp01((p - 0.82) / 0.12)));
    }

    // Lights on. One ramp through the golden hour, driving the truck's own
    // lamps and the pool they throw on the road, so the vehicle lights up on
    // the same beat as the streetlights and the yard rather than on its own
    // timer. Each emitter scales the intensity it was authored with.
    const dusk = smooth(clamp01((p - 0.74) / 0.12));
    if (lamps.current === null) {
      const root = truck.current?.getObjectByName("lamps");
      if (root) {
        const found: Array<{ mat: THREE.MeshStandardMaterial; lit: number }> = [];
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const lit = mesh.userData.lit as number | undefined;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (lit !== undefined && mat) found.push({ mat, lit });
        });
        lamps.current = found;
      }
    }
    if (lamps.current) {
      for (const l of lamps.current) l.mat.emissiveIntensity = 0.3 + dusk * l.lit;
    }
    if (beams.current) {
      const m = beams.current.material as THREE.MeshBasicMaterial;
      m.opacity = dusk * 0.4;
    }

    // First real frame. onCreated fires before anything is drawn, so gating
    // the crossfade on it can uncover an empty canvas over the poster on a
    // slow GPU — this fires once the scene has actually been posed.
    //
    // It now also waits for every material to be compiled (see precompile),
    // and for the suspended truck and world groups to exist so their
    // materials are in the graph being compiled. The poster covers the wait;
    // if the groups never mount, the reveal goes ahead after 3s regardless.
    if (!painted.current) {
      if (firstFrameAt.current < 0) firstFrameAt.current = now;
      const mounted = truck.current !== null && world.current !== null;
      if (!compiling.current && (mounted || now - firstFrameAt.current > 3)) {
        compiling.current = true;
        void precompile(gl, scene, camera, quality).then(() => {
          compiled.current = true;
        });
      }
      // The escape covers a driver that never resolves compileAsync and a
      // calibration still stepping down — a soft first frame beats a poster
      // that never lifts. 2.5s rather than 4: on a healthy device the search
      // is done in a third of a second and this never fires, so the only
      // machines it applies to are the ones it is too long for.
      if ((compiled.current && calibrated.current) || now - firstFrameAt.current > 2.5) {
        painted.current = true;
        onReady?.();
      }
    }
  });

  return (
    <>
      {/* Fog starts past the far end of the yard: it softens the horizon and
          never touches the truck. Hauling it in was what turned the bodywork
          into a silhouette. */}
      {/* The band sits well past the truck — the camera stands 20-30 units
          off it and the fog starts at 55 even at its tightest — and reaches
          the horizon inside the visible scenery. Pushed out past the far
          ridge (which is where it was) it engaged with nothing at all, and
          the distance read as hard geometry pasted on a flat sky rather than
          as air. This is the whole of the atmospheric depth. */}
      <fog attach="fog" args={["#b9c2cb", 120, 470]} />
      <ambientLight ref={amb} intensity={0.7} />
      <hemisphereLight ref={hemi} args={["#ffe0b4", "#6b5540", 0.85]} />
      <directionalLight
        ref={key}
        position={[-18, 22, 14]}
        intensity={1.9}
        // The truck never moves, so one tight shadow frustum covers it all.
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        // Wide enough for the golden-hour shadows. At a sun elevation of 12
        // over a horizontal run of 30, a 4-unit-tall trailer throws a
        // 10-unit shadow — the old +/-14 box clipped it off mid-road, which
        // reads as the shadow ending in a straight line across the tarmac.
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={140}
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
          {/* The pool the headlamps throw on the road ahead. Additive and
              unlit, so it brightens the tarmac without being a fourth
              shadow-casting light in a scene that already carries a sun,
              a rim and the practicals. */}
          <mesh ref={beams} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 11]}>
            <planeGeometry args={[7, 15]} />
            <meshBasicMaterial
              color="#ffdaa4"
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
          <Streetlights progress={eased} quality={quality} />
          <Greenery quality={quality} />
          <Warehouse progress={eased} quality={quality} />
          <ExitGate progress={eased} quality={quality} />
          <Traffic progress={eased} quality={quality} />
          <Coast quality={quality} progress={eased} />
          <Port quality={quality} progress={eased} />
        </group>
      </Suspense>

      <PauseOffscreen onVisible={onVisible} />
      <AdaptiveResolution
        max={dpr}
        start={startDpr}
        progress={progress}
        ready={compiled}
        lowPath={quality === "low"}
        onChange={onDpr}
        onCalibrated={markCalibrated}
        onDegrade={onTier}
        canDegrade={quality === "high" && tier < 2}
      />
      {Effects && <Effects progress={eased} />}
    </>
  );
}

// Memoized so a DPR step (a HeroScene state change) and R3F's own Canvas
// re-renders on re-measure re-apply the ratio without re-reconciling the
// whole scene graph. Every prop is stable: refs, a useState setter, a
// useCallback, and values fixed at mount.
const RigMemo = memo(Rig);

function HeroScene({
  progress,
  onReady,
}: {
  progress: MutableRefObject<number>;
  onReady?: () => void;
}) {
  const device = useMemo(probeDevice, []);

  // Level of detail is picked once at mount. Phones get fewer containers,
  // a coarser sea, no shadows and a capped pixel ratio — the frame budget
  // there is spent on holding 60fps, not on geometry nobody can see.
  const quality: Quality = useMemo(() => {
    if (typeof window === "undefined") return "high";
    return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches
      ? "low"
      : "high";
  }, [device]);

  // Capped at 1.5 everywhere, phone or 5K panel. Shading cost is per pixel
  // and scales with the square of this: dpr 2 is 1.8x the fragments of 1.5,
  // and dpr 3 is four times them, for a difference nobody resolves on a
  // moving background render. This is the single biggest fill-rate lever.
  //
  // The high path is allowed 1.75 rather than 1.5 — this is the only lever
  // that actually sharpens edges, since the pixel ratio is where all of its
  // antialiasing comes from. It is a ceiling, not a setting: the loop below
  // starts here and steps down on anything that cannot hold it, so the
  // machines that can afford the pixels get them and the rest do not.
  const maxDpr = useMemo(
    () =>
      typeof window === "undefined"
        ? 1
        : Math.min(window.devicePixelRatio, quality === "high" ? 1.75 : 1.5),
    [quality],
  );

  /* Where the ratio starts, which for most devices is the ceiling.

     Measuring is the right way to decide this, but a device only learns it
     cannot hold the ceiling by rendering at the ceiling, and on the machines
     that cannot, those frames are seconds long. So a GPU family known to be
     weak starts at the floor, a small or mid-range one a step down — where the
     search would have left them — and everything else, which is almost
     everything, still starts at full quality.

     Never above the ceiling. On a 1x screen the high path's ceiling (1) sits
     under its floor (1.25), and the plain max() here used to start a "modest"
     machine at 1.25: more pixels than an unclassified one, not fewer. */
  const dprKey = useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : `${device.gpu}|${quality}|${maxDpr}|${Math.round((window.innerWidth * window.innerHeight) / 1e5)}`,
    [device, quality, maxDpr],
  );
  const startDpr = useMemo(() => {
    const floor = dprFloor(quality === "low");
    let start = maxDpr;
    if (device.weak) start = Math.min(maxDpr, floor);
    else if (device.modest) start = Math.min(maxDpr, Math.max(floor, maxDpr - DPR_STEP));
    const recalled = recallDpr(dprKey);
    return recalled === null ? start : Math.min(start, Math.max(recalled, Math.min(maxDpr, floor)));
  }, [device, quality, maxDpr, dprKey]);

  // The ratio actually in use. Owned here and handed to <Canvas dpr> so that
  // R3F's own re-apply of that prop (on every Canvas render) re-applies the
  // adaptive value instead of snapping back to the ceiling. Starts at the
  // ceiling; AdaptiveResolution moves it between its floor and maxDpr.
  const [dpr, setDprState] = useState(startDpr);
  const setDpr = useCallback(
    (next: number) => {
      setDprState(next);
      rememberDpr(dprKey, next);
    },
    [dprKey],
  );
  /* How much rendering work has been shed, 0 = none. Only ever rises, and
     only when the pixel ratio has already bottomed out — see Tier. */
  // A weak GPU starts with bloom already shed (tier 1), so the composer
  // chunk is never fetched and its targets never allocated there. Shadows
  // stay; calibration drops them behind the poster if it has to.
  const [tier, setTier] = useState<Tier>(() => (device.weak ? 1 : 0));
  const dropTier = useCallback(
    () => setTier((t) => (t < 2 ? ((t + 1) as Tier) : t)),
    [],
  );
  // Owned here and passed as <Canvas frameloop>, like `dpr`, so a Canvas
  // re-render cannot switch a paused loop back on. See PauseOffscreen.
  const [visible, setVisible] = useState(true);

  /* No GPU, no scene. A software rasteriser compiles every shader
     synchronously on first draw (three.js blocks on LINK_STATUS for each of
     them: ten seconds of frozen main thread, measured) and then spends
     100-1200ms per frame after that — a slideshow nobody can scroll through.
     The poster is the scene's own first frame and stays up, and the chapter
     copy is driven by scroll, not by the canvas, so the story still reads. */
  if (device.software) return null;

  return (
    <Canvas
      dpr={dpr}
      // Shadows off on mobile, not merely lower-resolution: the map is a
      // whole extra scene render every frame, and halving its size halves
      // nothing about that.
      // "soft" (PCFSoft) rather than "percentage": same four taps, but the
      // filter widens with distance from the occluder, so the trailer's
      // shadow is crisp where the tyres meet the tarmac and soft twenty
      // metres out. A uniform-width penumbra is one of the strongest
      // "this is a game" tells there is.
      frameloop={visible ? "always" : "never"}
      shadows={quality === "high" && tier < 2 ? "soft" : false}
      // Keyed to quality, not to pixel ratio.
      //
      // On the high path Effects renders the scene into its own multisampled
      // target and then blits one fullscreen quad to the default framebuffer.
      // A quad has no edges to smooth, so MSAA there antialiases nothing at
      // all while still costing a multisampled backbuffer for the whole
      // canvas — and the old `dpr < 1.5` test switched it *on* for exactly
      // the machines least able to afford it (1x displays).
      //
      // The low path has no composer, so the default framebuffer is where its
      // edges are resolved and it keeps MSAA.
      gl={{
        antialias: quality === "low",
        powerPreference: "high-performance",
        // Khronos PBR Neutral instead of R3F's default ACES. ACES was built
        // to grade film negatives and it desaturates anything bright toward
        // white — under it the red cab washed pink in the sun and the
        // sodium floodlights went cream. Neutral holds hue right up to the
        // clip point and rolls off only the last stop, which is what keeps
        // the contrast cinematic without turning the paint into a colour it
        // is not. Exposure carries the small brightness the swap costs.
        toneMapping: THREE.NeutralToneMapping,
        toneMappingExposure: 1.06,
      }}
      // far 400 clipped the far end of the route out of the wide
      // establishing shot while the fog band still ran to 700 — geometry
      // vanished at a hard plane instead of fading into the haze.
      camera={{ fov: 38, near: 0.5, far: 760, position: SHOTS[0].pos }}
      // Production only: three's shader diagnostics fetch every new program's
      // info logs and link status on first use, a synchronous round trip per
      // program inside the first frames. Measured on a 4x-throttled phone:
      // Lighthouse TBT 846–954ms with it, 829–833ms without. Development keeps
      // the check, which is the only place a shader error can be introduced.
      onCreated={({ gl }) => {
        if (process.env.NODE_ENV === "production") gl.debug.checkShaderErrors = false;
      }}
      aria-hidden
    >
      <RigMemo
        progress={progress}
        quality={quality}
        dpr={maxDpr}
        startDpr={startDpr}
        tier={tier}
        onDpr={setDpr}
        onTier={dropTier}
        onVisible={setVisible}
        onReady={onReady}
      />
    </Canvas>
  );
}

// Memoized: HomeHero re-renders on every chapter change, and without this each
// one re-rendered <Canvas> and re-reconciled the whole scene graph right as the
// copy crossfade started. Both props are stable (a ref and a useCallback), and
// the render loop runs off refs inside useFrame, so it never needed React.
export default memo(HeroScene);
