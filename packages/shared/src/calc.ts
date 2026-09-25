import { D, dec, money, moneyStr, type Dec, type DecimalInput } from "./money";
import type { DiscountType } from "./enums";

/**
 * Deterministic document maths. The SAME function runs in the browser (live POS
 * preview) and on the server (source of truth that gets persisted). All
 * arithmetic is Decimal; inputs and outputs cross boundaries as strings.
 *
 * Order of operations
 *   line subtotal   = qty x rate
 *   line discount   = % of line subtotal, or flat amount (capped at subtotal)
 *   line taxable    = subtotal - discount
 *   doc discount    = % of sum(taxable), or flat amount (capped)
 *   tax             = per line, on taxable after its pro-rata share of doc discount
 *                     (exclusive: added on top, inclusive: extracted from price)
 *   grand total     = taxable total (+ tax if exclusive), optionally rounded to rupee
 */

export interface CalcItemInput {
  quantity: DecimalInput;
  rate: DecimalInput;
  discountType?: DiscountType | null;
  discountValue?: DecimalInput | null;
  taxRate?: DecimalInput | null;
}

export interface CalcGroupInput<I extends CalcItemInput = CalcItemInput> {
  items: I[];
}

export interface CalcOptions {
  discountType?: DiscountType | null;
  discountValue?: DecimalInput | null;
  pricesIncludeTax?: boolean;
  roundToRupee?: boolean;
  amountPaid?: DecimalInput | null;
}

export interface CalcItemResult {
  lineSubtotal: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  total: string;
}

export interface CalcGroupResult {
  subtotal: string;
  items: CalcItemResult[];
}

export interface CalcTotals {
  subtotal: string;
  itemDiscountTotal: string;
  discountTotal: string;
  taxableTotal: string;
  taxTotal: string;
  roundOff: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
}

export interface CalcResult {
  groups: CalcGroupResult[];
  totals: CalcTotals;
}

function discountOf(base: Dec, type: DiscountType | null | undefined, value: DecimalInput | null | undefined): Dec {
  if (!type || value === null || value === undefined || value === "") return new D(0);
  const v = dec(value);
  if (v.lte(0)) return new D(0);
  const raw = type === "PERCENT" ? base.mul(D.min(v, 100)).div(100) : v;
  return money(D.min(raw, base.gt(0) ? base : new D(0)));
}

export function calculateItem(item: CalcItemInput, pricesIncludeTax = false): CalcItemResult & { _taxable: Dec } {
  const qty = dec(item.quantity);
  const rate = dec(item.rate);
  const lineSubtotal = money(qty.mul(rate));
  const discountAmount = discountOf(lineSubtotal, item.discountType, item.discountValue);
  const taxable = lineSubtotal.minus(discountAmount);
  const r = dec(item.taxRate);
  let taxAmount: Dec;
  let total: Dec;
  if (r.lte(0)) {
    taxAmount = new D(0);
    total = taxable;
  } else if (pricesIncludeTax) {
    taxAmount = money(taxable.minus(taxable.div(r.div(100).plus(1))));
    total = taxable;
  } else {
    taxAmount = money(taxable.mul(r).div(100));
    total = taxable.plus(taxAmount);
  }
  return {
    lineSubtotal: moneyStr(lineSubtotal),
    discountAmount: moneyStr(discountAmount),
    taxableAmount: moneyStr(taxable),
    taxAmount: moneyStr(taxAmount),
    total: moneyStr(total),
    _taxable: taxable,
  };
}

export function calculateDocument<I extends CalcItemInput>(
  groups: CalcGroupInput<I>[],
  opts: CalcOptions = {},
): CalcResult {
  const inclusive = !!opts.pricesIncludeTax;
  let subtotal = new D(0);
  let itemDiscountTotal = new D(0);
  let taxableBefore = new D(0);

  const computed = groups.map((g) => {
    let groupSubtotal = new D(0);
    const items = g.items.map((it) => {
      const r = calculateItem(it, inclusive);
      subtotal = subtotal.plus(r.lineSubtotal);
      itemDiscountTotal = itemDiscountTotal.plus(r.discountAmount);
      taxableBefore = taxableBefore.plus(r._taxable);
      groupSubtotal = groupSubtotal.plus(r.total);
      return { r, taxRate: dec(it.taxRate) };
    });
    return { groupSubtotal, items };
  });

  const discountTotal = discountOf(taxableBefore, opts.discountType, opts.discountValue);
  const taxableTotal = taxableBefore.minus(discountTotal);
  const factor = taxableBefore.gt(0) ? taxableTotal.div(taxableBefore) : new D(1);

  // Tax on the post-discount base, summed per line so mixed rates stay exact.
  let taxTotal = new D(0);
  for (const g of computed) {
    for (const { r, taxRate } of g.items) {
      if (taxRate.lte(0)) continue;
      const base = r._taxable.mul(factor);
      const t = inclusive ? base.minus(base.div(taxRate.div(100).plus(1))) : base.mul(taxRate).div(100);
      taxTotal = taxTotal.plus(money(t));
    }
  }

  const exact = inclusive ? taxableTotal : taxableTotal.plus(taxTotal);
  const grand = opts.roundToRupee ? exact.toDecimalPlaces(0, D.ROUND_HALF_UP) : money(exact);
  const roundOff = grand.minus(exact);
  const paid = money(dec(opts.amountPaid));
  const balance = D.max(grand.minus(paid), 0);

  return {
    groups: computed.map((g) => ({
      subtotal: moneyStr(g.groupSubtotal),
      items: g.items.map(({ r }) => ({
        lineSubtotal: r.lineSubtotal,
        discountAmount: r.discountAmount,
        taxableAmount: r.taxableAmount,
        taxAmount: r.taxAmount,
        total: r.total,
      })),
    })),
    totals: {
      subtotal: moneyStr(subtotal),
      itemDiscountTotal: moneyStr(itemDiscountTotal),
      discountTotal: moneyStr(discountTotal),
      taxableTotal: moneyStr(taxableTotal),
      taxTotal: moneyStr(taxTotal),
      roundOff: moneyStr(roundOff),
      grandTotal: moneyStr(grand),
      amountPaid: moneyStr(paid),
      balanceDue: moneyStr(balance),
    },
  };
}

/** Organo's observed pricing convention for planters: 30% off MRP, rounded up to the rupee. */
export function suggestRateFromMrp(mrp: DecimalInput, discountPercent: DecimalInput = 30): string {
  const m = dec(mrp);
  return moneyStr(m.mul(new D(100).minus(dec(discountPercent))).div(100).toDecimalPlaces(0, D.ROUND_CEIL));
}
