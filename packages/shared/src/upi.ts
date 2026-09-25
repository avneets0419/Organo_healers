import { dec, type DecimalInput } from "./money";

/** UPI deep link (NPCI spec). Scanned by GPay / PhonePe / Paytm. */
export function buildUpiUri(opts: { upiId: string; payeeName: string; amount?: DecimalInput | null; note?: string }): string {
  const params = new URLSearchParams({ pa: opts.upiId, pn: opts.payeeName, cu: "INR" });
  if (opts.amount && dec(opts.amount).gt(0)) params.set("am", dec(opts.amount).toFixed(2));
  if (opts.note) params.set("tn", opts.note.slice(0, 80));
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
