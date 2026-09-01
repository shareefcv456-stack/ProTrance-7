# PRO TRANS — Hero Film Sequence Prompts

**Style: 3D animated movie (Unreal Engine 5 / Pixar-grade render).**

Two steps. Generate a still frame first, then animate it — that is what keeps the
stylized look and the truck identity consistent across all four clips.

```
Midjourney / Leonardo  →  4 stills  →  Runway / Kling / Luma  →  4 clips  →  public/videos/
     (Step 1)                              (Step 2)
```

**Rules that matter more than the wording:**

1. Each Step-1 still becomes the **reference image for its own Step-2 clip**. Do not
   reuse the original photoreal truck photo here — a photoreal reference fights a 3D
   output and you get neither look cleanly.
2. To hold the truck identity across all four stills, generate Frame 1 first, then pass
   its URL as a style/character reference (`--sref <url>` in Midjourney) to Frames 2–4.
3. Feed the still as a *reference / style* input to the video model, **not** as a locked
   first frame, or the camera moves in Shots 2 and 3 will not happen.
4. Do **not** ask one generation for all four chapters. Every model caps at ~8–10s;
   a 4-chapter request returns morphing trucks and a mutating logo.
5. Cut on motion — end each clip with the truck moving in the direction the next starts.

The hero currently runs a pure-CSS 3D scroll scene instead of video (see
`components/home/HomeHero.tsx`). When the clips exist, save them to `public/videos/`
with these exact filenames and ask for the swap — the scroll/chapter machinery is
already in place, only the visual layer changes:

| Shot | File |
|------|------|
| 1 | `public/videos/shot-1-warehouse.mp4` |
| 2 | `public/videos/shot-2-highway.mp4` |
| 3 | `public/videos/shot-3-coastal.mp4` |
| 4 | `public/videos/shot-4-port.mp4` |

Keep the Step-1 stills too — save them alongside as `shot-1-warehouse.jpg` etc. and
they become per-clip poster images (one line to wire up, ask me).

---

# Step 1 — Still frames (Midjourney / Leonardo AI)

## Frame 1 — Warehouse (Dawn)

> 3D animated movie style, stylized photorealistic render, Unreal Engine 5. A bright
> white container truck with 'PRO TRANS LOGISTICS LLP' written clearly on the side,
> parked in a futuristic stylized cargo warehouse. Cute 3D character forklifts loading
> heavy wooden crates into the back door. Early morning volumetric blue light rays,
> Pixar quality lighting, vibrant colors, 8k resolution --ar 16:9

## Frame 2 — Highway (Sunset)

> 3D animated movie style, Unreal Engine 5 render. The stylized white 'PRO TRANS
> LOGISTICS LLP' container truck driving along a smooth desert highway at golden hour
> sunset. Low angle dynamic perspective, glowing lights, crisp clear 3D textures,
> vibrant sunset sky, Pixar animation style --ar 16:9

## Frame 3 — Coastal (Aerial)

> 3D animated aerial shot, stylized 3D environment. High-angle view of the white
> 'PRO TRANS LOGISTICS LLP' truck driving smoothly along an ocean cliff road. Vivid blue
> ocean with stylized animated waves, golden sun glare, colorful cinematic lighting
> --ar 16:9

## Frame 4 — Port Arrival

> 3D animated movie ending scene. The white 'PRO TRANS LOGISTICS LLP' truck parked at a
> colorful animated container terminal shipyard. Giant stylized gantry cranes lifting
> containers and big cargo ships in the background, warm cinematic sunset lighting
> --ar 16:9

---

# Step 2 — Motion clips (Runway / Kling / Luma / Veo)

Feed each Step-1 still as the reference for its matching shot.

## Shot 1 — Warehouse Loading (Dawn)

> 3D animated movie style, stylized photorealistic render, Unreal Engine 5. A bright
> white container truck with 'PRO TRANS LOGISTICS LLP' written clearly on the side,
> parked in a futuristic stylized cargo warehouse. Cute 3D character forklifts loading
> heavy wooden crates into the back door. Early morning volumetric blue light rays,
> Pixar quality lighting, smooth camera track, vibrant colors, 60fps.

## Shot 2 — Highway Acceleration (Sunset)

> 3D animation cinematic shot. The stylized white 'PRO TRANS LOGISTICS LLP' container
> truck driving fast along a smooth desert highway. Low angle dynamic tracking camera
> following the truck closely. Vibrant golden hour sunset, glowing exhaust effects,
> cartoon realistic speed blur on the wheels and road, crisp clear 3D textures, clean
> vehicle design, smooth motion.

## Shot 3 — Coastal Highway (Aerial View)

> 3D animated aerial drone shot. High-angle view following the stylized white
> 'PRO TRANS LOGISTICS LLP' truck driving smoothly along an ocean cliff road. Vivid blue
> sea with stylized animated waves, golden sun glare, cinematic camera motion, smooth
> pan, colorful lighting, highly detailed 3D environment.

## Shot 4 — Shipyard Arrival (Port Delivery)

> 3D animated movie ending scene. The white 'PRO TRANS LOGISTICS LLP' truck pulling up
> and coming to a smooth stop at a colorful animated container terminal shipyard. Giant
> stylized gantry cranes lifting containers and big cargo ships in the background.
> Sunset sky, warm cinematic lighting, high-end 3D character animation style, 60fps.

---

## Export settings

| Setting | Value |
|---------|-------|
| Aspect ratio | 16:9 |
| Resolution | 1080p (4K optional — downscale before shipping) |
| Duration | 5s or 8s per shot |
| Codec | H.264 MP4, ~5 Mbps |
| File size | Keep each under ~4 MB or the hero stalls on mobile |

---

## If the logo text comes out garbled

Stylized 3D renders mangle lettering far more than photoreal ones do. Two fixes, in
order of laziness:

1. Generate with a **plain white trailer** (drop the logo from the prompt), then
   composite the real logo on in post. Cleanest result, always legible.
2. Shorten the on-truck text to **'PRO TRANS'** only. Fewer characters survive better.

Fix this at Step 1. A garbled logo in the still frame propagates into every frame of
the clip that references it.

---

# Alternative — single continuous take

One master prompt covering all four stages, for models that can hold a long shot or
chain continuations. Two corrections applied from the draft: the badge reads
**ASHOK LEYLAND** (not "Ashoka"), and the reference file in this repo is
`public/image.png` — there is no `image_10.png`.

> Cinematic photorealistic movie-quality continuous video sequence of a large white
> logistics container truck featuring the 'PRO TRANS LOGISTICS LLP' logo and ASHOK
> LEYLAND badge on the cab, as seen in the reference photo. The video sequence must
> seamlessly flow through four story stages: Stage 1 opens with a slow dolly-in towards
> the truck parked at a high-tech warehouse bay, where automated forklifts load wooden
> crates into the rear container. Stage 2 smoothly transitions to a dynamic tracking
> shot, with the truck accelerating fast from the warehouse onto a desert highway with
> realistic wheel motion and tire dust. Stage 3 changes to an aerial drone view
> following the truck along a winding coastal cliff highway with sea spray. Stage 4
> finishes with a slow crane-up reveal as the truck pulls into a busy ocean port
> container terminal next to massive harbor cranes and a container ship.
> Hyper-realistic, 8k resolution, smooth and coherent cinematic camera movements,
> dramatic golden hour sunset lighting that gets warmer as the video progresses.

**How to actually get a continuous take.** No model renders four stages in one pass —
base generations run ~5–10s and a four-stage request returns a morphing truck. Use the
extend/continuation feature instead: generate Stage 1, then extend from its last frame
into Stage 2, and so on. Kling ("Extend"), Runway ("Extend Video") and Luma ("Extend")
all support this. Feed the master prompt as the overall style spec and the per-stage
prompt above as the instruction for each extension.

The result is one long mp4 rather than four clips — a different hero implementation
(scroll-scrubbed `currentTime` on a single video, instead of four crossfading layers).
Say which route you land on and I will wire it.
