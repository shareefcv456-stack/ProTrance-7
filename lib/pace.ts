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
/** Progress per second, at most: ~4.5s for the whole story on a hard fling.
    0.35 (~2.9s) still read as rushing through the beats, so this is paired
    with a longer scroll runway in HomeHero. The chapter copy steps one beat
    at a time on its own (see HomeHero), so no beat is skipped either way. */
const MAX_RATE = 0.22;

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
