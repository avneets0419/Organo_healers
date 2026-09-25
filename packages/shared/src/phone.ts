/**
 * Indian phone helpers. We store E.164 (+91XXXXXXXXXX) and accept the many ways
 * people type numbers: "99922 23310", "09992223310", "+91-99922-23310", "919992223310".
 */
export function normalizeIndianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // International format supplied explicitly.
    if (digits.startsWith("91") && digits.length === 12 && /^[6-9]/.test(digits.slice(2))) {
      return `+${digits}`;
    }
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  return null;
}

export function isValidIndianMobile(input: string | null | undefined): boolean {
  const n = normalizeIndianPhone(input);
  return !!n && /^\+91[6-9]\d{9}$/.test(n);
}

/** Digits-only form used by wa.me links (country code, no plus). */
export function toWhatsAppNumber(input: string | null | undefined): string | null {
  const n = normalizeIndianPhone(input);
  return n ? n.replace(/^\+/, "") : null;
}

/** "+91 99922 23310" */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const n = normalizeIndianPhone(input);
  if (n && n.startsWith("+91") && n.length === 13) {
    return `+91 ${n.slice(3, 8)} ${n.slice(8)}`;
  }
  return input;
}

/** Digits a user typed, for partial "starts with / contains" search. */
export function phoneSearchDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("91")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
}
