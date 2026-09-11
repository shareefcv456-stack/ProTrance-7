"use client";

import { useRef, useState, type FormEvent } from "react";
import { company } from "@/lib/site";
import { validateField, validateAll } from "@/lib/form-validation";
import { AnimatePresence, m } from "framer-motion";

type Status = "idle" | "submitting" | "success" | "error";

const cargoTypes = [
  "Dairy / Perishable",
  "Confectionery / Biscuits",
  "Cosmetics / Fragile",
  "General FMCG",
  "Other",
];

type Values = {
  name: string;
  company: string;
  email: string;
  phone: string;
  cargo: string;
  message: string;
};

type FieldName = keyof Values;

const EMPTY: Values = {
  name: "",
  company: "",
  email: "",
  phone: "",
  cargo: cargoTypes[0],
  message: "",
};

const VALIDATED: FieldName[] = ["name", "email", "phone", "message"];

type Errors = Partial<Record<FieldName, string>>;

/**
 * Client-side enquiry form. Validates required fields and email format, then
 * hands off to the visitor's mail client with a prefilled message (no backend
 * required).
 */
export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [form, setForm] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  // A field's error only appears once the visitor has left it or tried to
  // submit. Validating while someone is still typing their address flags
  // "j" as an invalid email, which is true and useless.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const update = (key: FieldName) => (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const next = { ...form, [key]: e.target.value };
    setForm(next);
    // Re-check as they type only once the field has already been flagged, so
    // the message clears the moment it is fixed rather than at the next blur.
    if (touched[key]) {
      setErrors((prev) => ({ ...prev, [key]: validateField(key, next[key]) }));
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
      // Move the caret to the problem rather than leaving the visitor to hunt
      // for the red text, which may be off-screen on a phone.
      const el = formRef.current?.elements.namedItem(firstInvalid);
      if (el instanceof HTMLElement) {
        el.focus();
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
      return;
    }

    setStatus("submitting");

    const subject = `Logistics enquiry — ${form.company || form.name}`;
    const body = [
      `Name: ${form.name}`,
      `Company: ${form.company}`,
      `Email: ${form.email}`,
      `Phone: ${form.phone}`,
      `Cargo type: ${form.cargo}`,
      "",
      form.message,
    ].join("\n");

    // Brief delay for the success transition, then open mail client.
    window.setTimeout(() => {
      try {
        window.location.href = `mailto:${company.email}?subject=${encodeURIComponent(
          subject,
        )}&body=${encodeURIComponent(body)}`;
        setStatus("success");
      } catch {
        // A blocked or missing mail handler must not leave the button stuck
        // on "Preparing…" with no way forward.
        setStatus("error");
      }
    }, 650);
  };

  const reset = () => {
    setForm(EMPTY);
    setErrors({});
    setTouched({});
    setStatus("idle");
  };

  const invalidCount = Object.values(errors).filter(Boolean).length;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-paper-line bg-white/50 p-7 sm:p-9">
      <AnimatePresence mode="wait">
        {status === "success" ? (
          <m.div
            key="success"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-[420px] flex-col items-center justify-center text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-signal/15">
              <svg
                className="h-8 w-8 text-signal"
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
            </div>
            <h3 className="mt-6 font-display text-2xl font-800 tracking-tight text-ink">
              Message ready to send
            </h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink/55">
              We&apos;ve opened your email app with the details filled in. Prefer
              to call? Reach us any time on the numbers listed.
            </p>
            <button
              onClick={reset}
              className="mt-8 rounded-full border border-paper-line px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-signal hover:text-signal"
            >
              Send another
            </button>
          </m.div>
        ) : (
          <m.form
            key="form"
            ref={formRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onSubmit={onSubmit}
            // The browser's own bubbles would fire before this handler runs and
            // replace the inline messages below with a tooltip on one field at
            // a time. The `required` attributes stay for assistive tech.
            noValidate
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="name"
                label="Full name"
                required
                value={form.name}
                onChange={update("name")}
                onBlur={blur("name")}
                error={touched.name ? errors.name : undefined}
                placeholder="Your name"
                autoComplete="name"
              />
              <Field
                name="company"
                label="Company"
                value={form.company}
                onChange={update("company")}
                placeholder="Brand / business"
                autoComplete="organization"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="email"
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={update("email")}
                onBlur={blur("email")}
                error={touched.email ? errors.email : undefined}
                placeholder="you@company.com"
                autoComplete="email"
                inputMode="email"
              />
              <Field
                name="phone"
                label="Phone"
                type="tel"
                value={form.phone}
                onChange={update("phone")}
                onBlur={blur("phone")}
                error={touched.phone ? errors.phone : undefined}
                placeholder="+91 00000 00000"
                autoComplete="tel"
                inputMode="tel"
              />
            </div>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink/50">
                Cargo type
              </span>
              <select
                name="cargo"
                value={form.cargo}
                onChange={update("cargo")}
                className="w-full rounded-xl border border-paper-line bg-white px-4 py-3.5 text-sm text-ink outline-none transition-colors duration-300 focus:border-signal"
              >
                {cargoTypes.map((c) => (
                  <option key={c} value={c} className="bg-paper">
                    {c}
                  </option>
                ))}
              </select>
              <span className="mt-1 block min-h-[1.05rem]" aria-hidden="true" />
            </label>

            <label className="block">
              <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink/50">
                What do you need to move?
                <span className="text-signal"> *</span>
              </span>
              <textarea
                name="message"
                required
                value={form.message}
                onChange={update("message")}
                onBlur={blur("message")}
                rows={4}
                placeholder="Tell us about your routes, timelines, and cargo…"
                aria-invalid={touched.message && !!errors.message}
                aria-describedby={
                  touched.message && errors.message ? "err-message" : undefined
                }
                className={`w-full resize-none rounded-xl border bg-white px-4 py-3.5 text-sm text-ink placeholder:text-ink/30 outline-none transition-colors duration-300 ${
                  touched.message && errors.message
                    ? "border-danger focus:border-danger"
                    : "border-paper-line focus:border-signal"
                }`}
              />
              <FieldError id="err-message" message={touched.message ? errors.message : undefined} />
            </label>

            {/* Submit-level feedback. One line, so a visitor who hit the button
                with three empty fields is told why the page did not move. */}
            {/* Reserved for the same reason as the field slots: this line is
                what appears when a submit is rejected, and it must not shove
                the button the visitor just pressed. */}
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
                  <a className="font-semibold underline" href={`mailto:${company.email}`}>
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
                  className="text-sm text-danger"
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
              className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-signal px-7 py-4 text-sm font-semibold text-asphalt transition-transform duration-300 ease-smooth hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            >
              {status === "submitting" && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <span>
                {status === "submitting" ? "Preparing…" : "Send Enquiry"}
              </span>
              {status !== "submitting" && (
                <svg
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
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
              )}
            </button>
          </m.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One inline validation line, in a slot that is always there.

    Reserved rather than inserted: growing the field by 18px the instant a
    message appears pushes every control below it down mid-interaction, and on
    a phone that moves the submit button out from under a thumb already on its
    way to it. The slot costs one line of empty space per validated field and
    the form never changes height. */
function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <span className="mt-1 block min-h-[1.05rem]">
      <AnimatePresence initial={false} mode="wait">
        {message && (
          <m.span
            key={message}
            id={id}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.16 }}
            className="block text-[0.7rem] leading-[1.05rem] text-danger"
          >
            {message}
          </m.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Field({
  label,
  name,
  error,
  ...props
}: {
  label: string;
  name: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const errorId = `err-${name}`;
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-[0.62rem] uppercase tracking-[0.18em] text-ink/50">
        {label}
        {props.required && <span className="text-signal"> *</span>}
      </span>
      <input
        {...props}
        name={name}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-xl border bg-white px-4 py-3.5 text-sm text-ink placeholder:text-ink/30 outline-none transition-colors duration-300 ${
          error
            ? "border-danger focus:border-danger"
            : "border-paper-line focus:border-signal"
        }`}
      />
      <FieldError id={errorId} message={error} />
    </label>
  );
}
