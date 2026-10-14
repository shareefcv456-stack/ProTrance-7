/** Renderer strings of software rasterisers, which get the poster, not the scene. */
export const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|basic render|software|微软/i;

/* Reads the WebGL renderer string from a worker, off the main thread.

   On a machine with no GPU (PageSpeed's own lab, VMs, remote desktops) the
   first WebGL context costs seconds just to initialise the software
   rasteriser, and on the main thread that is one long frozen task — measured
   at 3.5s on a 4x-throttled run, the bulk of the hero's Total Blocking Time.
   In a worker the same wait blocks nothing, and HomeHero can decide before
   three.js is even requested.

   Resolves "" whenever it cannot tell (no worker, no OffscreenCanvas WebGL,
   an error): "" means unknown, never software, and HeroScene then probes on
   the main thread as it always did. */
const SRC = `try{const c=new OffscreenCanvas(1,1);const g=c.getContext("webgl2")||c.getContext("webgl");const i=g&&g.getExtension("WEBGL_debug_renderer_info");postMessage(i?String(g.getParameter(i.UNMASKED_RENDERER_WEBGL)||""):"");g&&g.getExtension("WEBGL_lose_context")?.loseContext()}catch(e){postMessage("")}`;

export function probeGpuOffThread(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return resolve("");
    let url = "";
    try {
      url = URL.createObjectURL(new Blob([SRC], { type: "text/javascript" }));
      const w = new Worker(url);
      const done = (name: string) => {
        w.terminate();
        URL.revokeObjectURL(url);
        resolve(name);
      };
      w.onmessage = (e) => done(typeof e.data === "string" ? e.data : "");
      w.onerror = () => done("");
    } catch {
      if (url) URL.revokeObjectURL(url);
      resolve("");
    }
  });
}
