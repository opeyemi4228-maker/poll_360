/**
 * One number, one shape.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The same Nigerian mobile arrives in at least three forms. WhatsApp's webhook
 * sends `2348031234567` with no plus. A person typing it writes
 * `+234 803 123 4567`. A spreadsheet exported from anywhere writes
 * `08031234567`. They are the same phone.
 *
 * Contacts are looked up by a keyed hash of the number, so the hash is only
 * useful if the number going into it is always written the same way. It was
 * not, and the database ended up holding one coordinator twice: once as they
 * appeared over WhatsApp and once as somebody had typed them. Two contacts,
 * two message threads, two halves of one conversation, and a desk with no way
 * of knowing they were the same person.
 *
 * ── WHAT IT DOES, AND WHAT IT REFUSES TO DO ────────────────────────────────
 * It canonicalises to digits with a country code and nothing else. It does not
 * validate: a number that is not recognisably Nigerian is passed through as
 * its own digits rather than rejected, because this product is used at the
 * edge of a network by people whose number may legitimately be foreign, and
 * refusing to record them would be worse than recording them oddly.
 * ───────────────────────────────────────────────────────────────────────────
 */

const NIGERIA = "234";

export function normalisePhone(value) {
  if (value === null || value === undefined) return null;

  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;

  /* 08031234567 -> 2348031234567. The leading zero is a domestic dialling
     prefix, not part of the number. */
  if (digits.startsWith("0") && digits.length === 11) return NIGERIA + digits.slice(1);

  /* ── 8031234567, AS PEOPLE WRITE IT WHEN THEY DROP BOTH ────────────────
     A leading zero is excluded deliberately. "0803000000" is ten digits and
     starts with the domestic prefix, so it is an eleven-digit number with a
     digit missing — a typo. Prepending 234 to it produced "2340803000000",
     which is thirteen characters and therefore passes the `^234\d{10}$` check
     every caller makes, so a mistyped number arrived in the database looking
     perfectly well formed and belonging to nobody. */
  if (digits.length === 10 && !digits.startsWith("0") && !digits.startsWith(NIGERIA)) {
    return NIGERIA + digits;
  }

  /* 00234... , the older international prefix. */
  if (digits.startsWith("00")) return digits.slice(2);

  return digits;
}

/**
 * Is this actually a Nigerian mobile number?
 *
 * ── WHY THE RULE LIVES HERE AND NOT AT EACH CALL SITE ──────────────────────
 * `normalisePhone` shapes a number and deliberately does not judge it, which
 * is the right split: the same string is a typo in a sign-up form and a fact
 * in a migration script. But the judging was then written out twice, in two
 * server actions, as the same regular expression with the same comment above
 * it — and not written at all in the two other places that take a number.
 * A rule duplicated is a rule that drifts.
 *
 * 234 plus ten digits, and the subscriber number begins 7, 8 or 9, which is
 * every Nigerian mobile prefix in service.
 */
export function isNigerianMobile(value) {
  const digits = normalisePhone(value);
  return Boolean(digits) && /^234[789]\d{9}$/.test(digits);
}

/** The last four, for a desk that has to recognise a caller without unsealing. */
export function phoneTail(value) {
  const digits = normalisePhone(value);
  return digits ? digits.slice(-4) : "";
}

/** How a number is shown once somebody has asked to see it. */
export function formatPhone(value) {
  const digits = normalisePhone(value);
  if (!digits) return "";
  if (digits.startsWith(NIGERIA) && digits.length === 13) {
    return `+${NIGERIA} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}
