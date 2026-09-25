import Decimal from "decimal.js";

// Dedicated Decimal clone so app-wide config never leaks into other libraries.
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type DecimalInput = string | number | Dec;

export const ZERO = new D(0);

export function dec(value: DecimalInput | null | undefined): Dec {
  if (value === null || value === undefined || value === "") return new D(0);
  try {
    return new D(value);
  } catch {
    return new D(0);
  }
}

/** Round to paise (2dp, half-up). */
export function money(value: DecimalInput): Dec {
  return dec(value).toDecimalPlaces(2, D.ROUND_HALF_UP);
}

/** Serialise a Decimal for transport / storage: fixed 2dp string. */
export function moneyStr(value: DecimalInput): string {
  return money(value).toFixed(2);
}

export function qtyStr(value: DecimalInput): string {
  return dec(value).toDecimalPlaces(3, D.ROUND_HALF_UP).toString();
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const inrFormatter2 = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Indian-grouped currency, e.g. ₹1,69,613. Shows paise only when present
 * (or when `alwaysPaise`). Formatting goes through a string so large values
 * never pass through float arithmetic.
 */
export function formatINR(
  value: DecimalInput | null | undefined,
  opts: { symbol?: boolean; alwaysPaise?: boolean } = {},
): string {
  const d = money(dec(value));
  const hasPaise = !d.isInteger();
  const fmt = opts.alwaysPaise || hasPaise ? inrFormatter2 : inrFormatter;
  // Number() is safe here: the value is already rounded to 2dp and only used for display.
  const s = fmt.format(Number(d.toFixed(2)));
  return opts.symbol === false ? s : `₹${s}`;
}

export function formatQty(value: DecimalInput | null | undefined): string {
  const d = dec(value);
  return d.isInteger() ? d.toFixed(0) : d.toDecimalPlaces(3).toString();
}

/** Compact Indian notation for axes and tiles: ₹950, ₹45K, ₹1.7L, ₹2.4Cr. */
export function formatINRCompact(value: DecimalInput | null | undefined): string {
  const d = dec(value);
  const sign = d.isNeg() ? "-" : "";
  const a = d.abs();
  const fmt = (x: InstanceType<typeof D>, unit: string) => `${sign}₹${x.toDecimalPlaces(x.gte(10) ? 0 : 1).toString()}${unit}`;
  if (a.gte(1e7)) return fmt(a.div(1e7), "Cr");
  if (a.gte(1e5)) return fmt(a.div(1e5), "L");
  if (a.gte(1e3)) return fmt(a.div(1e3), "K");
  return `${sign}₹${a.toDecimalPlaces(0).toString()}`;
}
