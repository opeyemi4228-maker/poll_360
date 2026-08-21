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

  /* 8031234567, as people write it when they drop both. */
  if (digits.length === 10 && !digits.startsWith(NIGERIA)) return NIGERIA + digits;

  /* 00234... , the older international prefix. */
  if (digits.startsWith("00")) return digits.slice(2);

  return digits;
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
