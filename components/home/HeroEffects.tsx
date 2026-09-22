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
  // Width and height as numbers, not the size object. R3F rebuilds `size`
  // whenever the canvas's page offset changes — every debounced scroll tick
  // once the sticky panel releases — and depending on that object reran the
  // resize below, freeing and reallocating every bloom target each time.
  const width = useThree((st) => st.size.width);
  const height = useThree((st) => st.size.height);
  const dpr = useThree((st) => st.viewport.dpr);

  const { composer, bloom } = useMemo(() => {
    // No MSAA on this target, and the antialiasing is better for it.
    //
    // A multisampled half-float target is resolved to memory every frame, and
    // on a tile-based GPU that resolve is the expensive path. Measured at
    // 1440x900 on an M2, scrubbing the whole hero, frames over 32ms:
    //
    //   dpr 1.00, samples 2 ->  0.0%   (1440x900 backbuffer)
    //   dpr 1.50, samples 2 -> 19.5%
    //   dpr 1.50, samples 0 ->  2.3%   (2160x1350 backbuffer)
    //   dpr 1.75, samples 0 -> 27.9%
    //
    // So two samples cost about what 2.25x the shading resolution costs, and
    // the pixel ratio is the better place to spend it. Supersampling
    // antialiases everything — the container corrugation, the wet asphalt
    // specular, the chain-link, the tyre tread — where MSAA only ever covered
    // polygon edges and left every one of those shimmering. Compared side by
    // side at matched frame cost the higher ratio is cleaner on textured
    // surfaces and indistinguishable on thin geometry (the guardrail, the
    // lamp masts, the palm fronds).
    //
    // The pixel ratio is what carries this now, so the high path's adaptive
    // floor is raised to 1.25 to match — see AdaptiveResolution.
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 0,
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
    composer.setSize(width, height);
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
    //
    // CSS pixels, deliberately not device pixels. Two reasons, and the second
    // is the one that showed up in a trace.
    //
    // Visually it changes nothing: this chain is a five-level Gaussian with a
    // 0.32 radius thresholded at 1.05, so its output carries no detail finer
    // than the kernel and running it at 1x rather than 1.75x is the same glow.
    // It is also exactly the chain a 1x display already renders, and the scene
    // was composed against that.
    //
    // The cost it removes is the reallocation. UnrealBloomPass owns eleven
    // render targets, and WebGLRenderTarget.setSize only frees and rebuilds
    // when the dimensions actually differ — so sizing this off the device
    // ratio meant every adaptive-resolution step tore down and rebuilt the
    // whole chain mid-scroll. Off CSS pixels the chain simply does not move
    // when the ratio does, and a resolution step touches the composer's two
    // HDR targets and nothing else.
    bloom.setSize(
      Math.max(2, width * BLOOM_SCALE),
      Math.max(2, height * BLOOM_SCALE),
    );
  }, [composer, bloom, width, height, dpr]);

  useFrame(() => {
    // Bloom earns its keep only once the lamps are the subject: near-nothing
    // in the day-lit dock, strongest at the dusk yard.
    const p = clamp01(progress.current);
    bloom.strength = 0.08 + smooth(clamp01((p - 0.66) / 0.24)) * 0.26;
    composer.render();
  }, 1);

  return null;
}
