"use client";

import { useState, type FormEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { company } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

type Status = "idle" | "submitting" | "success";

const phone1 = company.phones.mobile[0];
const phone2 = company.phones.mobile[1];

/** Contact channels shown as the site's divided-row list idiom. */
const channels = [
  {
    label: "Call",
    value: `+91 ${phone1.slice(0, 5)} ${phone1.slice(5)}`,
    sub: `+91 ${phone2.slice(0, 5)} ${phone2.slice(5)}`,
    href: `tel:+91${phone1}`,
  },
  {
    label: "Email",
    value: company.email,
    sub: "Replies within one working day",
    href: `mailto:${company.email}`,
  },
  {
    label: "Visit",
    value: company.hq.line,
    sub: `${company.hq.area}, PIN ${company.hq.pin}`,
    href: `https://maps.google.com/?q=${encodeURIComponent(
      `${company.hq.line}, ${company.hq.area}`,
    )}`,
  },
];

function InputShell({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.18em] text-grey-400">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-paper/15 bg-paper/[0.06] px-4 py-3.5 text-sm text-paper placeholder:text-grey-500 outline-none transition-colors duration-300 focus:border-accent";

/**
 * Home-page contact block: channel rows on the left, an ink enquiry card on
 * the right. Submitting hands off to the visitor's mail client with the
 * message prefilled (same no-backend flow as the contact page).
 */
export function ContactSection() {
  const [status, setStatus] = useState<Status>("idle");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: "",
  });

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    const body = [
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`,
      "",
      form.message,
    ].join("\n");
    window.setTimeout(() => {
      window.location.href = `mailto:${company.email}?subject=${encodeURIComponent(
        `Logistics enquiry - ${form.name}`,
      )}&body=${encodeURIComponent(body)}`;
      setStatus("success");
    }, 650);
  };

  return (
    <section id="contact" className="bg-paper py-14 sm:py-20">
      <div className="shell grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        {/* Channels */}
        <div>
          <Reveal>
            <h2 className="max-w-md font-display text-[clamp(1.5rem,1.15rem+2.1vw,2.8rem)] font-600 leading-[1.1] tracking-tighter text-ink">
              Talk to our dispatch desk.
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-grey-600">
              A route, a rate, or a question about cold chain. Call, write, or
              send the form and we&apos;ll come back with a plan.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <ul className="mt-10 border-t border-ink/10">
              {channels.map((ch) => (
                <li key={ch.label} className="border-b border-ink/10">
                  <a
                    href={ch.href}
                    target={ch.label === "Visit" ? "_blank" : undefined}
                    rel={ch.label === "Visit" ? "noreferrer" : undefined}
                    className="group flex items-center justify-between gap-6 py-6 transition-transform duration-300 ease-smooth hover:translate-x-1"
                  >
                    <span>
                      <span className="block font-mono text-[0.62rem] uppercase tracking-[0.18em] text-grey-500">
                        {ch.label}
                      </span>
                      <span className="mt-1.5 block font-display text-lg font-600 tracking-tight text-ink sm:text-xl">
                        {ch.value}
                      </span>
                      <span className="mt-0.5 block text-sm text-grey-600">
                        {ch.sub}
                      </span>
                    </span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06] text-ink transition-all duration-300 ease-smooth group-hover:bg-accent">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8h9M8 4l4 4-4 4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Enquiry card */}
        <Reveal delay={0.15}>
          <div className="relative overflow-hidden rounded-2xl bg-ink p-7 sm:p-10">
            <AnimatePresence mode="wait" initial={false}>
              {status === "success" ? (
                <m.div
                  key="success"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex min-h-[420px] flex-col items-center justify-center text-center"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
                    <svg
                      className="h-7 w-7 text-accent"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <h3 className="mt-6 font-display text-2xl font-600 tracking-tight text-paper">
                    Message ready to send
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-grey-400">
                    Your email app has opened with the details filled in.
                    Prefer to talk? The numbers are on the left.
                  </p>
                  <button
                    onClick={() => setStatus("idle")}
                    className="mt-8 rounded-lg border border-paper/20 px-6 py-2.5 text-sm font-semibold text-paper transition-colors duration-300 hover:border-accent hover:text-accent"
                  >
                    Send another
                  </button>
                </m.div>
              ) : (
                <m.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={onSubmit}
                  className="space-y-5"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <InputShell label="Full name" required>
                      <input
                        required
                        value={form.name}
                        onChange={update("name")}
                        placeholder="Your name"
                        autoComplete="name"
                        className={inputClass}
                      />
                    </InputShell>
                    <InputShell label="Phone">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={update("phone")}
                        placeholder="+91 00000 00000"
                        autoComplete="tel"
                        className={inputClass}
                      />
                    </InputShell>
                  </div>

                  <InputShell label="Email" required>
                    <input
                      type="email"
                      required
                      value={form.email}
                      onChange={update("email")}
                      placeholder="you@company.com"
                      autoComplete="email"
                      className={inputClass}
                    />
                  </InputShell>

                  <InputShell label="What do you need to move?" required>
                    <textarea
                      required
                      value={form.message}
                      onChange={update("message")}
                      rows={5}
                      placeholder="Routes, timelines, and cargo type"
                      className={`${inputClass} resize-none`}
                    />
                  </InputShell>

                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="group inline-flex w-full items-center justify-center gap-3 rounded-lg bg-accent py-3 pl-7 pr-3 text-sm font-semibold text-ink transition-all duration-300 ease-smooth hover:bg-paper active:scale-[0.98] disabled:opacity-70 sm:w-auto"
                  >
                    {status === "submitting" ? "Preparing" : "Send enquiry"}
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-ink/10 transition-transform duration-300 ease-smooth group-hover:translate-x-0.5">
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M3 8h9M8 4l4 4-4 4"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                </m.form>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
