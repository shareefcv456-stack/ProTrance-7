import Link from "next/link";
import Image from "next/image";
import { services } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

type Group = {
  index: string;
  title: string;
  line: string;
  cutout: { src: string; alt: string; fit?: string; imgClass?: string };
  ids: string[];
  reversed?: boolean;
};

/** The ten services, grouped into three capability rows. */
const groups: Group[] = [
  {
    index: "01",
    title: "Distribution network",
    line: "Factory to shelf, across every state line.",
    cutout: {
      src: "/images/image-Photoroom (10).png",
      alt: "Stacked cargo containers",
      // Anchored to the panel's bottom-left corner: the box extends across
      // the card padding so the image touches the left and bottom edges.
      // The clip lives on the wrapper so the translate (which eats the PNG's
      // transparent margins) can't paint past the card's rounded corner.
      fit: "-left-7 -right-7 -bottom-7 top-0 overflow-hidden rounded-b-2xl sm:-top-[10%] sm:-left-9 sm:-bottom-9 sm:right-0 sm:rounded-br-none",
      imgClass:
        "object-cover object-[center_60%] sm:object-contain sm:object-left-bottom sm:origin-bottom-left sm:-translate-x-[1.6%] sm:translate-y-[16.5%] sm:scale-[1.03]",
    },
    ids: ["pan-india", "distribution", "express"],
  },
  {
    index: "02",
    title: "Cold chain and careful handling",
    line: "Temperature-monitored, fragile-safe transport.",
    cutout: {
      src: "/images/image-Photoroom (9).png",
      alt: "Orange cargo container",
      // Anchored to the panel's bottom-left corner, same as cards 01 and 03.
      // The clip lives on the wrapper so the translate (which eats the PNG's
      // transparent margins) can't paint past the card's rounded corner.
      fit: "-top-[10%] -left-7 -bottom-7 right-0 overflow-hidden rounded-bl-2xl sm:-left-9 sm:-bottom-9",
      imgClass: "object-contain object-left-bottom -translate-x-[1.7%] translate-y-[1.6%]",
    },
    ids: ["cold-chain", "fragile", "time-sensitive"],
    reversed: true,
  },
  {
    index: "03",
    title: "Visibility and control",
    line: "Every load tracked, every border cleared.",
    cutout: {
      src: "/images/image-Photoroom (5).png",
      alt: "Cargo container seen from a low angle",
      // Anchored to the panel's bottom-left corner, same as card 01.
      fit: "-top-[10%] -left-7 -bottom-7 right-0 sm:-left-9 sm:-bottom-9",
      imgClass: "object-contain object-left-bottom rounded-bl-2xl",
    },
    ids: ["tracking", "fleet-management", "compliance"],
  },
];

export function ServiceRows() {
  return (
    <section className="py-14 sm:py-20">
      <div className="shell">
        <Reveal>
          <div className="max-w-[650px]">
            <span className="eyebrow text-accent-deep">What we move</span>
            <h2 className="mt-5 font-display text-3xl font-600 leading-[1.06] tracking-tighter sm:text-4xl md:text-[2.8rem]">
              Built for the pace of fast-moving goods.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-grey-600 sm:text-lg">
              Every service is tuned to the realities of FMCG: shelf-life,
              fragility, and turnover speed.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 flex flex-col gap-6">
          {groups.map((group) => {
            const items = group.ids
              .map((id) => services.find((s) => s.id === id))
              .filter(Boolean) as (typeof services)[number][];

            return (
              <Reveal key={group.index}>
                <div
                  className={`flex flex-col gap-6 lg:flex-row ${
                    group.reversed ? "lg:flex-row-reverse" : ""
                  }`}
                >
                  {/* Wide black panel — cutout image left, text right */}
                  <Link
                    href="/services"
                    className="group relative flex min-h-[300px] flex-col gap-6 rounded-2xl bg-[#0A0A0A] p-7 transition-transform duration-500 ease-smooth hover:scale-[1.02] sm:min-h-[320px] sm:flex-row sm:items-stretch sm:gap-8 sm:p-9 lg:w-[63%] lg:shrink-0 lg:self-stretch"
                  >
                    {/* Text column — ordered after the image on sm+ */}
                    <div className="flex flex-col justify-center sm:order-2 sm:w-1/2">
                      <div>
                        <h3 className="font-display text-2xl font-600 tracking-tight text-paper transition-transform duration-500 ease-smooth group-hover:translate-x-1 sm:text-[1.7rem]">
                          {group.title}
                        </h3>
                        <p className="mt-2 text-sm text-grey-400 sm:text-base">
                          {group.line}
                        </p>
                      </div>
                    </div>

                    {/* Cutout image column */}
                    <div className="relative min-h-[220px] flex-1 sm:min-h-0">
                      <div
                        className={`absolute ${group.cutout.fit ?? "inset-0"}`}
                      >
                        <Image
                          src={group.cutout.src}
                          alt={group.cutout.alt}
                          fill
                          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
                          className={`drop-shadow-[0_24px_30px_rgba(0,0,0,0.45)] ${
                            group.cutout.imgClass ?? ""
                          }`}
                        />
                      </div>
                    </div>
                  </Link>

                  {/* Outlined services card */}
                  <div className="flex flex-1 flex-col justify-between rounded-2xl border border-ink/15 p-7 sm:p-8">
                    <ul className="divide-y divide-ink/10">
                      {items.map((s) => (
                        <li key={s.id}>
                          <Link
                            href="/services"
                            className="group flex items-center justify-between gap-4 py-3.5 transition-transform duration-300 ease-smooth hover:translate-x-1"
                          >
                            <span>
                              <span className="block font-display text-base font-600 tracking-tight text-ink">
                                {s.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-grey-600">
                                {s.short}
                              </span>
                            </span>
                            <svg
                              className="h-4 w-4 shrink-0 text-grey-400 transition-colors duration-300 group-hover:text-accent-deep"
                              viewBox="0 0 16 16"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M3 8h9M8 4l4 4-4 4"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
