"use client";

import { useEffect, useMemo, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/* Its own module, and its own chunk.

   These four passes are 48.9k gzipped, and the low-quality path never mounts
   this component at all — so every phone was downloading a bloom composer it
   would not run, on the same connection the hero was waiting on. Splitting the
   import here means the bytes follow the code path that needs them. */

// Local copies rather than an import from HeroScene: that module lazily
// imports this one, and pulling two one-line pure functions back out of it
// would close the cycle for the sake of two expressions.
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

const BLOOM_SCALE = 0.5;

/** Lamp glow only: RenderPass → Bloom → Output. No depth of field — a
    defocus pass is the one effect that can only ever remove detail, and the
    truck has to stay sharp at every point on the scroll.

    The composer's own target carries the scene's antialiasing, because the
    canvas `antialias` flag applies to the default framebuffer and
    post-processing never touches it.

    Rendering into that target also means the renderer skips tone mapping, so
    bloom thresholds against real HDR values and OutputPass tone maps exactly
    once at the end. */
export default function Effects({
  progress,
}: {
  progress: MutableRefObject<number>;
}) {
  const gl = useThree((st) => st.gl);
  const scene = useThree((st) => st.scene);
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  const dpr = useThree((st) => st.viewport.dpr);

  const { composer, bloom } = useMemo(() => {
    // 2 samples, not 4. Measured at 1440x900 dpr 1.5 on an M2: the 4x
    // multisampled RGBA16F target alone was ~33ms of the frame — more than
    // every draw call in the scene put together, because resolving a
    // half-float multisampled buffer that size is pure memory bandwidth.
    // Dropping to 2 keeps the edges (this target is where all the scene's
    // antialiasing happens) at half the bandwidth.
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 2,
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
    // Bloom runs its mip chain at half the frame's linear resolution.
    //
    // composer.setSize() hands every pass the full framebuffer size, and
    // UnrealBloomPass then builds five levels of separable Gaussian off it —
    // ten blur passes whose first level alone was 1080x675 at dpr 1.5. Bloom
    // is a wide blur: its output carries no detail finer than the kernel, so
    // computing it at half resolution is not a visible reduction, it is the
    // same image for a quarter of the fill. Measured against the full-res
    // chain over the whole dusk yard frame: 0.2% mean channel difference.
    //
    // Called after setSize because that is what the composer overwrote.
    bloom.setSize(
      Math.max(2, size.width * dpr * BLOOM_SCALE),
      Math.max(2, size.height * dpr * BLOOM_SCALE),
    );
  }, [composer, bloom, size, dpr]);

  useFrame(() => {
    // Bloom earns its keep only once the lamps are the subject: near-nothing
    // in the day-lit dock, strongest at the dusk yard.
    const p = clamp01(progress.current);
    bloom.strength = 0.08 + smooth(clamp01((p - 0.66) / 0.24)) * 0.26;
    composer.render();
  }, 1);

  return null;
}
