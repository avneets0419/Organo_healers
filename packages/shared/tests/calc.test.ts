import { describe, expect, it } from "vitest";
import { calculateDocument, calculateItem, suggestRateFromMrp } from "../src/calc";

const item = (quantity: string | number, rate: string | number, extra: Record<string, unknown> = {}) => ({
  quantity,
  rate,
  ...extra,
});

describe("calculateItem", () => {
  it("multiplies quantity by rate exactly", () => {
    expect(calculateItem(item(3, "2309")).total).toBe("6927.00");
    // Classic float trap: 0.1 * 3 !== 0.3 in IEEE754
    expect(calculateItem(item("3", "0.1")).total).toBe("0.30");
    expect(calculateItem(item("1.5", "33.33")).total).toBe("50.00"); // 49.995 rounds half-up
  });

  it("applies percent and flat line discounts, capped at the subtotal", () => {
    expect(calculateItem(item(2, 1000, { discountType: "PERCENT", discountValue: "10" })).total).toBe("1800.00");
    expect(calculateItem(item(1, 500, { discountType: "AMOUNT", discountValue: "900" })).total).toBe("0.00");
  });

  it("adds exclusive GST and extracts inclusive GST", () => {
    const ex = calculateItem(item(1, 1000, { taxRate: "18" }));
    expect(ex.taxAmount).toBe("180.00");
    expect(ex.total).toBe("1180.00");
    const inc = calculateItem(item(1, 1180, { taxRate: "18" }), true);
    expect(inc.taxAmount).toBe("180.00");
    expect(inc.total).toBe("1180.00");
  });
});

describe("calculateDocument - reproduces the historical Organo Healers estimates", () => {
  it("Sunil Saroha (OMAX): 5 groups totalling 1,69,613", () => {
    const groups = [
      { items: [item(2, 2309), item(2, 1505), item(2, 2695), item(4, 650), item(2, 3850), item(2, 8500), item(2, 5500)] },
      { items: [item(2, 2309), item(2, 2000)] },
      { items: [item(3, 2309), item(3, 1505), item(1, 300), item(3, 850), item(2, 1505), item(2, 550)] },
      { items: [item(30, 50), item(30, 100), item(2, 7000), item(2, 3000), item(1, 8500), item(10, 600), item(5, 150), item(5, 50), item(1, 2625), item(1, 6000)] },
      { items: [item(50, 18), item(20, 100), item(1, 20000), item(50, 55), item(150, 100), item(1, 2000)] },
    ];
    const r = calculateDocument(groups, { roundToRupee: true });
    expect(r.groups.map((g) => g.subtotal)).toEqual(["51318.00", "8618.00", "18402.00", "48625.00", "42650.00"]);
    expect(r.totals.grandTotal).toBe("169613.00");
    expect(r.totals.roundOff).toBe("0.00");
  });

  it("TDI residential: 98,963", () => {
    const groups = [
      { items: [item(2, 2309), item(2, 1505), item(2, 2695), item(4, 650), item(2, 3850)] },
      { items: [item(2, 2309), item(2, 2000)] },
      { items: [item(3, 2309), item(3, 1505), item(1, 300), item(3, 850), item(2, 1505), item(2, 550)] },
      { items: [item(30, 50), item(30, 100), item(2, 7000), item(2, 3000), item(1, 8500), item(10, 600), item(5, 150), item(5, 50), item(1, 2625), item(1, 6000)] },
    ];
    expect(calculateDocument(groups).totals.grandTotal).toBe("98963.00");
  });

  it("Ashoka University: unpriced rows count as zero, total 42,060", () => {
    const rows: Array<[number, number]> = [
      [22, 180], [27, 180], [31, 0], [33, 0], [5, 650], [3, 650], [38, 0], [17, 0],
      [14, 0], [39, 180], [10, 180], [27, 280], [25, 180], [14, 280], [18, 180],
    ];
    const r = calculateDocument([{ items: rows.map(([q, rate]) => item(q, rate)) }]);
    expect(r.totals.grandTotal).toBe("42060.00");
  });
});

describe("calculateDocument - discounts, tax, rounding, balance", () => {
  it("applies a document discount before tax", () => {
    const r = calculateDocument([{ items: [item(1, 1000, { taxRate: "18" }), item(1, 1000)] }], {
      discountType: "PERCENT",
      discountValue: "10",
    });
    expect(r.totals.subtotal).toBe("2000.00");
    expect(r.totals.discountTotal).toBe("200.00");
    expect(r.totals.taxableTotal).toBe("1800.00");
    expect(r.totals.taxTotal).toBe("162.00"); // 18% of 900
    expect(r.totals.grandTotal).toBe("1962.00");
  });

  it("rounds to the nearest rupee and reports the round-off", () => {
    const r = calculateDocument([{ items: [item(1, "999.50")] }], { roundToRupee: true });
    expect(r.totals.grandTotal).toBe("1000.00");
    expect(r.totals.roundOff).toBe("0.50");
    const down = calculateDocument([{ items: [item(1, "999.49")] }], { roundToRupee: true });
    expect(down.totals.grandTotal).toBe("999.00");
    expect(down.totals.roundOff).toBe("-0.49");
  });

  it("computes balance due from payments and never goes negative", () => {
    const r = calculateDocument([{ items: [item(1, 5000)] }], { amountPaid: "2500" });
    expect(r.totals.balanceDue).toBe("2500.00");
    expect(calculateDocument([{ items: [item(1, 100)] }], { amountPaid: "500" }).totals.balanceDue).toBe("0.00");
  });

  it("handles empty groups", () => {
    const r = calculateDocument([{ items: [] }, { items: [item(1, 10)] }]);
    expect(r.groups[0]!.subtotal).toBe("0.00");
    expect(r.totals.grandTotal).toBe("10.00");
  });
});

describe("suggestRateFromMrp", () => {
  it("matches Organo's 30%-off-MRP planter pricing seen in estimates", () => {
    expect(suggestRateFromMrp("3299")).toBe("2310.00"); // estimates used 2309 (rounded down)
    expect(suggestRateFromMrp("2149")).toBe("1505.00");
    expect(suggestRateFromMrp("3849")).toBe("2695.00");
    expect(suggestRateFromMrp("3749")).toBe("2625.00");
  });
});

import { amountInWords } from "../src/words";
import { buildUpiUri } from "../src/upi";

describe("amountInWords (Indian numbering)", () => {
  it.each([
    ["169613", "Rupees One Lakh Sixty-Nine Thousand Six Hundred Thirteen Only"],
    ["98963", "Rupees Ninety-Eight Thousand Nine Hundred Sixty-Three Only"],
    ["42060", "Rupees Forty-Two Thousand Sixty Only"],
    ["12500000.50", "Rupees One Crore Twenty-Five Lakh and Fifty Paise Only"],
    ["0", "Rupees Zero Only"],
  ])("%s", (n, words) => expect(amountInWords(n)).toBe(words));
});

describe("buildUpiUri", () => {
  it("builds an NPCI-style pay link", () => {
    expect(buildUpiUri({ upiId: "organohealers@kotak", payeeName: "Organo Healers", amount: "98963", note: "PI-2026-0002" })).toBe(
      "upi://pay?pa=organohealers%40kotak&pn=Organo%20Healers&cu=INR&am=98963.00&tn=PI-2026-0002",
    );
  });
});
