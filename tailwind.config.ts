import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Short viewports: Windows laptops at 125–150% scaling land around
        // 600–700px of visible height. The home hero compacts under these.
        short: { raw: "(min-width: 640px) and (max-height: 820px)" },
        squat: { raw: "(max-width: 639px) and (max-height: 700px)" },
      },
      colors: {
        // ── Core palette ─────────────────────────────────────────────
        ink: {
          DEFAULT: "#272727", // primary dark
          800: "#494949",
        },
        grey: {
          600: "#6B6B6B",
          500: "#8D8D8D",
          400: "#AFAFAF",
          300: "#D1D1D1",
        },
        paper: {
          DEFAULT: "#FFFCFC", // warm white
          soft: "#F6F2F2",
          line: "#E9E4E4",
        },
        // Single accent — CTAs, active states, small highlights only.
        accent: {
          DEFAULT: "#F28C28",
          deep: "#C2660B",
          soft: "#FDF0E0",
        },
        // ── Legacy aliases (inner pages still reference these) ──────
        asphalt: {
          DEFAULT: "#272727",
          soft: "#313131",
          line: "#454545",
        },
        signal: {
          DEFAULT: "#F28C28",
          soft: "#F5A75C",
          deep: "#C2660B",
        },
        // Validation only. The palette's single accent is orange, which is
        // also the CTA and the "this is good" colour — reusing it to mean
        // "this field is wrong" would make the two indistinguishable.
        danger: {
          DEFAULT: "#C0392B",
          soft: "#FBEBE9",
          // The same hue lifted for dark surfaces. #C0392B on the ink
          // enquiry card is roughly 3.3:1 — under the 4.5:1 small-text
          // floor, i.e. an error message you cannot comfortably read. This
          // is an addition for the home form's validation text only; nothing
          // already on the page uses it, so no existing pixel changes.
          light: "#F08D80",
        },
        cold: {
          DEFAULT: "#B4B4B4",
          soft: "#DADADA",
          deep: "#7C7C7C",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
        tighter: "-0.03em",
      },
      fontWeight: {
        "400": "400",
        "500": "500",
        "600": "600",
        "700": "700",
        "800": "800",
        "900": "900",
      },
      maxWidth: {
        shell: "1320px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
        entrance: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { transform: "scale(0.6)", opacity: "0.8" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        "scroll-x": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.22,1,0.36,1) infinite",
        "scroll-x": "scroll-x 34s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
