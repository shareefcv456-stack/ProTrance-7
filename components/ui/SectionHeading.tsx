import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";

type Props = {
  eyebrow: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "left" | "center";
  theme?: "dark" | "light";
};

/** Consistent section header: mono eyebrow + display title + optional intro. */
export function SectionHeading({
  eyebrow,
  title,
  intro,
  align = "left",
  theme = "dark",
}: Props) {
  const muted = theme === "dark" ? "text-paper/55" : "text-ink/60";
  const accent = theme === "dark" ? "text-signal" : "text-signal-deep";
  const heading = theme === "dark" ? "text-paper" : "text-ink";

  return (
    <div
      className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : ""}`}
    >
      <Reveal>
        <div
          className={`flex items-center gap-3 ${
            align === "center" ? "justify-center" : ""
          }`}
        >
          <span className={`h-px w-8 ${theme === "dark" ? "bg-signal/50" : "bg-signal-deep/40"}`} />
          <span className={`eyebrow ${accent}`}>{eyebrow}</span>
        </div>
      </Reveal>
      <Reveal delay={0.08}>
        <h2
          className={`mt-5 font-display text-[clamp(1.5rem,1.2rem+1.9vw,2.5rem)] font-800 leading-[1.08] tracking-tighter ${heading}`}
        >
          {title}
        </h2>
      </Reveal>
      {intro && (
        <Reveal delay={0.16}>
          <p className={`mt-5 text-base leading-relaxed sm:text-lg ${muted}`}>
            {intro}
          </p>
        </Reveal>
      )}
    </div>
  );
}
