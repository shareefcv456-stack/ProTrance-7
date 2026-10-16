/** How the hero story follows the scroll. Shared by the 3D rig (inside its
    render loop) and the DOM copy (framer's frame loop), so the scene and the
    chapter text run off the same curve from the same raw input.

    Plain exponential damping follows a flick at the flick's own speed, so a
    quick wheel or touch fling raced the whole story past in half a second.
    This is a critically damped follow with a speed limit: small moves settle
    in about half a second, big jumps travel at a steady cinematic
    rate, and it eases in and out either way — forward and reverse alike. */

/** 1/s. Position gain: how hard the value pulls toward the scroll. */
const FOLLOW = 4;
/** 1/s. How quickly the speed itself changes. 4 × FOLLOW is critical
    damping — the fastest settle that never overshoots and runs backwards. */
const ACCEL = 4 * FOLLOW;
/** Scroll share per second, at most (in the units story() takes, not scene
    progress): ~8s for the whole story on a hard fling, and since every
    stage now owns a fair share of that scroll, no stage plays in under
    ~1.2s. It was 0.22 in scene progress, which let the 0.087-wide "In
    transit" stage go by in 0.4s of a normal scroll. */
const MAX_RATE = 0.15;

export type Pace = { value: number; rate: number };

/** Advances `s` toward `target` by `delta` seconds. Returns true while moving. */
export function pace(s: Pace, target: number, delta: number): boolean {
  const gap = target - s.value;
  if (Math.abs(gap) < 1e-5 && Math.abs(s.rate) < 1e-4) {
    s.value = target;
    s.rate = 0;
    return false;
  }
  // Capped so a resumed tab or a hitched frame cannot step past the target.
  const dt = Math.min(delta, 1 / 10);
  const want = Math.max(-MAX_RATE, Math.min(MAX_RATE, gap * FOLLOW));
  s.rate += (want - s.rate) * (1 - Math.exp(-ACCEL * dt));
  s.value += s.rate * dt;
  return true;
}

/* ── Scroll share per stage ─────────────────────────────────────────────
   The scene's timeline is front-loaded: loading at the dock runs to 0.583,
   then "In transit" is 0.087 wide, the coastal run 0.15 and the yard 0.18
   (STAGE_AT in HomeHero). Mapped linearly, the later stages got three to six
   wheel notches each and a normal scroll ran through three of them at once.
   story() gives each stage its own share of the scroll instead, and the
   scroll rate eases from one stage's into the next across BLEND, so the truck
   never visibly lurches at a boundary. Applied after pace(), so the speed
   limit is per share of scroll too.

   The last band is the yard epilogue, not a fifth chapter: from 0.97 the
   truck is parked, and unloading and the doors closing all happen in the
   last 0.03 of progress (see the rig in HeroScene). At the yard's own rate
   that was two wheel notches, so it gets a share of its own. The yard up to
   0.97 keeps exactly the scroll per unit of progress it had. */
const STAGE_P = [0, 0.583, 0.67, 0.82, 0.97, 1];
const STAGE_SHARE = [0.4, 0.18, 0.2, 0.22 * (0.15 / 0.18), 0.25];
/** Progress width of each boundary's ease. The epilogue's is short: it
    starts as the reverse eases to a stop, so the change of rate lands while
    the truck is already all but still. */
const BLEND = [0.04, 0.04, 0.04, 0.01];
const N = 1024;

/** Upper end of story()'s input: the total of the shares. The scroll feeds
    pace() in these units, so every stage keeps its share in absolute terms
    and MAX_RATE still means the same thing for each of them. */
export const STORY_LENGTH = STAGE_SHARE.reduce((a, b) => a + b, 0);

const P_OF_U = (() => {
  const step = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  // Scroll per unit of progress, stage by stage.
  const dens = STAGE_SHARE.map((s, k) => s / (STAGE_P[k + 1] - STAGE_P[k]));
  const d = (p: number) => {
    let v = dens[0];
    for (let k = 1; k < dens.length; k++) v += (dens[k] - dens[k - 1]) * step((p - STAGE_P[k]) / BLEND[k - 1] + 0.5);
    return v;
  };
  // Scroll as a function of progress, integrated, then inverted onto a
  // uniform scroll grid.
  const u = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) u[i] = u[i - 1] + (d((i - 1) / N) + d(i / N)) / (2 * N);
  const out = new Float32Array(N + 1);
  for (let i = 0, j = 0; i <= N; i++) {
    const want = (i / N) * u[N];
    while (j < N - 1 && u[j + 1] < want) j++;
    out[i] = (j + (want - u[j]) / (u[j + 1] - u[j])) / N;
  }
  return out;
})();

/** Scroll share (0–STORY_LENGTH, already paced) to scene progress (0–1). */
export function story(share: number): number {
  const x = Math.min(1, Math.max(0, share / STORY_LENGTH)) * N;
  const i = Math.min(N - 1, Math.floor(x));
  return P_OF_U[i] + (P_OF_U[i + 1] - P_OF_U[i]) * (x - i);
}
