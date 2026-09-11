/* Shared enquiry-form rules.
 *
 * Both forms — the contact page's full enquiry and the home page's short
 * one — ask for the same four things, so the rules live here rather than in
 * each component. A second copy is a second set of messages to drift: the
 * home form used to have no validation at all, and the fix for that is to
 * point it at the rules already proven on /contact, not to write new ones.
 *
 * Takes the field's value rather than the whole form object, so a form with
 * extra fields (company, cargo type) and one without can both call it. */

/** The fields both forms validate. Everything else is optional copy. */
export type ValidatedField = "name" | "email" | "phone" | "message";

/* Deliberately permissive. A stricter pattern rejects real addresses — new
   TLDs, plus-addressing, sub-domains — and the only authority on whether an
   address exists is the mail that gets sent to it. This catches the mistakes
   worth catching: no @, nothing before or after it, no dot in the domain,
   a stray space. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/* Phone is optional; validated only when the visitor typed something. Digits
   after stripping the punctuation a person actually uses. */
const PHONE_CHARS = /^[0-9+()\-.\s]+$/;

/** Per-field rules. Returns a message, or undefined when the value is fine.
    An unknown field name is not an error — it is a field with no rules. */
export function validateField(name: string, value: string): string | undefined {
  const v = value.trim();
  switch (name) {
    case "name":
      if (!v) return "Please enter your name.";
      if (v.length < 2) return "That name looks too short.";
      return;
    case "email":
      if (!v) return "Please enter an email address.";
      if (!EMAIL.test(v)) return "Enter a valid email, like you@company.com.";
      return;
    case "phone":
      // Optional — but if it is filled in it has to be usable.
      if (!v) return;
      if (!PHONE_CHARS.test(v)) return "Use digits, spaces, + and - only.";
      if (v.replace(/\D/g, "").length < 8) return "That number looks too short.";
      return;
    case "message":
      if (!v) return "Tell us what you need to move.";
      if (v.length < 10) return "A little more detail helps us quote accurately.";
      return;
    default:
      return;
  }
}

/** Runs `validateField` over `fields`, returning only the ones that failed. */
export function validateAll<K extends string>(
  fields: readonly K[],
  values: Record<K, string>,
): Partial<Record<K, string>> {
  const errors: Partial<Record<K, string>> = {};
  for (const name of fields) {
    const message = validateField(name, values[name]);
    if (message) errors[name] = message;
  }
  return errors;
}
