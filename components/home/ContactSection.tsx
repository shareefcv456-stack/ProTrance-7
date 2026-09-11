"use client";

import { useRef, useState, type FormEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { company } from "@/lib/site";
import { validateField, validateAll } from "@/lib/form-validation";
import { Reveal } from "@/components/motion/Reveal";

// "error" is new: the mailto hand-off could previously fail silently and
// leave the button stuck on "Preparing" with no way forward.
type Status = "idle" | "submitting" | "success" | "error";

type FieldName = "name" | "phone" | "email" | "message";
type Errors = Partial<Record<FieldName, string>>;

/** Required plus the optional phone, which is checked only when filled.
    Same four fields, same rules and same wording as the contact page —
    see lib/form-validation. */
const VALIDATED: FieldName[] = ["name", "email", "phone", "message"];

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
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.18em] text-grey-400">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      {children}
      {/* Fixed min-height so a message appearing never shifts the fields
          below it — the same reservation the contact page's FieldError
          makes. danger-light rather than danger: this card is ink. */}
      <span className="mt-1 block min-h-[1.05rem]">
        <AnimatePresence initial={false} mode="wait">
          {error && (
            <m.span
              key={error}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.16 }}
              className="block text-[0.7rem] leading-[1.05rem] text-danger-light"
            >
              {error}
            </m.span>
          )}
        </AnimatePresence>
      </span>
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
  const [form, setForm] = useState<Record<FieldName, string>>({
    name: "",
    phone: "",
    email: "",
    message: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  // A field's error only appears once the visitor has left it or tried to
  // submit. Flagging an address as invalid while it is still being typed is
  // true and useless.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const update =
    (key: FieldName) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setForm((f) => ({ ...f, [key]: value }));
      // Re-check as they type only once the field has been flagged, so the
      // message clears the moment it is fixed rather than at the next blur.
      if (touched[key]) {
        setErrors((prev) => ({ ...prev, [key]: validateField(key, value) }));
      }
      if (status === "error") setStatus("idle");
    };

  const blur = (key: FieldName) => () => {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: validateField(key, form[key]) }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();

    const found = validateAll(VALIDATED, form);
    setErrors(found);
    setTouched(Object.fromEntries(VALIDATED.map((n) => [n, true])));

    const firstInvalid = VALIDATED.find((n) => found[n]);
    if (firstInvalid) {
      // Move the caret to the problem rather than leaving the visitor to
      // hunt for red text that may be off-screen on a phone.
      const el = formRef.current?.elements.namedItem(firstInvalid);
      if (el instanceof HTMLElement) {
        el.focus();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }

    setStatus("submitting");
    const body = [
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`,
      "",
      form.message,
    ].join("\n");
    window.setTimeout(() => {
      try {
        window.location.href = `mailto:${company.email}?subject=${encodeURIComponent(
          `Logistics enquiry - ${form.name}`,
        )}&body=${encodeURIComponent(body)}`;
        setStatus("success");
      } catch {
        // A blocked or missing mail handler must not leave the button stuck
        // on "Preparing" with no way forward.
        setStatus("error");
      }
    }, 650);
  };

  const invalidCount = Object.values(errors).filter(Boolean).length;

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
                  ref={formRef}
                  // Our own messages replace the browser's default bubbles,
                  // which are unstyled, one-at-a-time and vanish on blur.
                  // `required` stays on each field for assistive tech.
                  noValidate
                  className="space-y-5"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <InputShell
                      label="Full name"
                      required
                      error={touched.name ? errors.name : undefined}
                    >
                      <input
                        name="name"
                        required
                        aria-invalid={!!(touched.name && errors.name)}
                        value={form.name}
                        onChange={update("name")}
                        onBlur={blur("name")}
                        placeholder="Your name"
                        autoComplete="name"
                        className={inputClass}
                      />
                    </InputShell>
                    <InputShell
                      label="Phone"
                      error={touched.phone ? errors.phone : undefined}
                    >
                      <input
                        name="phone"
                        type="tel"
                        aria-invalid={!!(touched.phone && errors.phone)}
                        value={form.phone}
                        onChange={update("phone")}
                        onBlur={blur("phone")}
                        placeholder="+91 00000 00000"
                        autoComplete="tel"
                        className={inputClass}
                      />
                    </InputShell>
                  </div>

                  <InputShell
                    label="Email"
                    required
                    error={touched.email ? errors.email : undefined}
                  >
                    <input
                      name="email"
                      type="email"
                      required
                      aria-invalid={!!(touched.email && errors.email)}
                      value={form.email}
                      onChange={update("email")}
                      onBlur={blur("email")}
                      placeholder="you@company.com"
                      autoComplete="email"
                      className={inputClass}
                    />
                  </InputShell>

                  <InputShell
                    label="What do you need to move?"
                    required
                    error={touched.message ? errors.message : undefined}
                  >
                    <textarea
                      name="message"
                      required
                      aria-invalid={!!(touched.message && errors.message)}
                      value={form.message}
                      onChange={update("message")}
                      onBlur={blur("message")}
                      rows={5}
                      placeholder="Routes, timelines, and cargo type"
                      className={`${inputClass} resize-none`}
                    />
                  </InputShell>

                  {/* Summary alert. The per-field messages say what is
                      wrong; this says that something is, for anyone who
                      submitted from the bottom of a long card and cannot see
                      the flagged field. aria-live announces it without
                      stealing focus. */}
                  <div className="min-h-[2.6rem]" aria-live="polite">
                    <AnimatePresence initial={false} mode="wait">
                      {status === "error" && (
                        <m.p
                          key="send-error"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          role="alert"
                          className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
                        >
                          We couldn&apos;t open your mail app. Email us directly at{" "}
                          <a
                            className="font-semibold underline"
                            href={`mailto:${company.email}`}
                          >
                            {company.email}
                          </a>
                          .
                        </m.p>
                      )}
                      {status !== "error" && invalidCount > 0 && (
                        <m.p
                          key="invalid-summary"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          role="alert"
                          className="text-sm text-danger-light"
                        >
                          {invalidCount === 1
                            ? "One field needs attention before we can send this."
                            : `${invalidCount} fields need attention before we can send this.`}
                        </m.p>
                      )}
                    </AnimatePresence>
                  </div>

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
