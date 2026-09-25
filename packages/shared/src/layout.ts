import { z } from "zod";

/**
 * Invoice layout: which columns show, in what order, with what labels / widths /
 * alignment, plus which sections render. Stored per document (so a sent invoice
 * never changes when defaults change) and as a default in BusinessSettings.
 */

export const COLUMN_KEYS = [
  "sr",
  "item",
  "description",
  "bagSize",
  "height",
  "size",
  "qty",
  "unit",
  "mrp",
  "rate",
  "discount",
  "tax",
  "total",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const ALIGNMENTS = ["left", "center", "right"] as const;
export type Alignment = (typeof ALIGNMENTS)[number];

export const columnSchema = z.object({
  key: z.enum(COLUMN_KEYS),
  label: z.string().max(40),
  visible: z.boolean(),
  /** Relative width weight (fr units). */
  width: z.number().min(0.3).max(8),
  align: z.enum(ALIGNMENTS),
});
export type ColumnConfig = z.infer<typeof columnSchema>;

export const sectionsSchema = z.object({
  showLogo: z.boolean(),
  showGst: z.boolean(),
  showBusinessAddress: z.boolean(),
  showBusinessContact: z.boolean(),
  showCustomerPhone: z.boolean(),
  showCustomerEmail: z.boolean(),
  showBillingAddress: z.boolean(),
  showShippingAddress: z.boolean(),
  showGroupSubtotals: z.boolean(),
  showMrpSavings: z.boolean(),
  showNotes: z.boolean(),
  showTerms: z.boolean(),
  showPaymentTerms: z.boolean(),
  showBankDetails: z.boolean(),
  showUpiDetails: z.boolean(),
  showUpiQr: z.boolean(),
  showSignature: z.boolean(),
  showFooter: z.boolean(),
});
export type SectionsConfig = z.infer<typeof sectionsSchema>;

/** Optional per-document overrides of the business header. null/undefined = use snapshot. */
export const headerOverridesSchema = z.object({
  businessName: z.string().max(120).nullish(),
  tagline: z.string().max(120).nullish(),
  gstNumber: z.string().max(30).nullish(),
  address: z.string().max(400).nullish(),
  phone: z.string().max(40).nullish(),
  email: z.string().max(120).nullish(),
  logoUrl: z.string().max(2000).nullish(),
});
export type HeaderOverrides = z.infer<typeof headerOverridesSchema>;

export const layoutSchema = z.object({
  template: z.string().default("modern"),
  preset: z.string().optional(),
  columns: z.array(columnSchema).min(1),
  sections: sectionsSchema,
  header: headerOverridesSchema.default({}),
  customText: z.string().max(2000).nullish(),
  signatureLabel: z.string().max(80).nullish(),
});
export type DocumentLayout = z.infer<typeof layoutSchema>;

const col = (key: ColumnKey, label: string, visible: boolean, width: number, align: Alignment): ColumnConfig => ({
  key,
  label,
  visible,
  width,
  align,
});

/** Every column, in default order. Presets toggle visibility / labels. */
export function allColumns(): ColumnConfig[] {
  return [
    col("sr", "#", true, 0.5, "left"),
    col("item", "Item", true, 4, "left"),
    col("description", "Description", false, 3, "left"),
    col("bagSize", "Bag size", false, 1.2, "center"),
    col("height", "Height", false, 1.1, "center"),
    col("size", "Size", false, 1, "center"),
    col("qty", "Qty", true, 0.8, "right"),
    col("unit", "Unit", false, 0.8, "left"),
    col("mrp", "MRP", true, 1.2, "right"),
    col("rate", "Rate", true, 1.2, "right"),
    col("discount", "Discount", false, 1.1, "right"),
    col("tax", "GST", false, 1, "right"),
    col("total", "Amount", true, 1.4, "right"),
  ];
}

export const DEFAULT_SECTIONS: SectionsConfig = {
  showLogo: true,
  showGst: true,
  showBusinessAddress: true,
  showBusinessContact: true,
  showCustomerPhone: true,
  showCustomerEmail: true,
  showBillingAddress: true,
  showShippingAddress: false,
  showGroupSubtotals: true,
  showMrpSavings: true,
  showNotes: true,
  showTerms: true,
  showPaymentTerms: true,
  showBankDetails: true,
  showUpiDetails: true,
  showUpiQr: true,
  showSignature: true,
  showFooter: true,
};

export interface LayoutPreset {
  key: string;
  name: string;
  description: string;
  apply: (cols: ColumnConfig[]) => ColumnConfig[];
}

function setCols(
  cols: ColumnConfig[],
  visible: ColumnKey[],
  labels: Partial<Record<ColumnKey, string>> = {},
): ColumnConfig[] {
  const order = [...visible, ...cols.map((c) => c.key).filter((k) => !visible.includes(k))];
  return order.map((k) => {
    const c = cols.find((x) => x.key === k)!;
    return { ...c, visible: visible.includes(k), label: labels[k] ?? c.label };
  });
}

/**
 * Presets mirror how Organo Healers already structures estimates:
 *  - "particulars": Sr / Particulars / Qty / MRP / Rate / Total (OMAX, TDI estimates)
 *  - "trees":       Sr / Tree local name / Bag size / Height / Qty / Rate / Total (Ashoka estimate)
 */
export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    key: "particulars",
    name: "Particulars with MRP",
    description: "Pots, plants and services with MRP and your rate.",
    apply: (c) => setCols(c, ["sr", "item", "qty", "mrp", "rate", "total"], { item: "Particulars" }),
  },
  {
    key: "trees",
    name: "Trees & saplings",
    description: "Bag size and height columns for plantation orders.",
    apply: (c) =>
      setCols(c, ["sr", "item", "bagSize", "height", "qty", "rate", "total"], {
        item: "Tree / local name",
        bagSize: "Bag size (in)",
        height: "Height (ft)",
      }),
  },
  {
    key: "gst",
    name: "Tax invoice",
    description: "Adds discount and GST columns.",
    apply: (c) => setCols(c, ["sr", "item", "qty", "rate", "discount", "tax", "total"]),
  },
  {
    key: "simple",
    name: "Simple",
    description: "Item, quantity, rate and amount only.",
    apply: (c) => setCols(c, ["sr", "item", "qty", "rate", "total"]),
  },
];

export function defaultLayout(presetKey = "particulars"): DocumentLayout {
  const preset = LAYOUT_PRESETS.find((p) => p.key === presetKey) ?? LAYOUT_PRESETS[0]!;
  return {
    template: "modern",
    preset: preset.key,
    columns: preset.apply(allColumns()),
    sections: { ...DEFAULT_SECTIONS },
    header: {},
    customText: null,
    signatureLabel: "Authorised signatory",
  };
}

/** Parse stored JSON defensively: unknown/missing keys fall back to defaults. */
export function normalizeLayout(raw: unknown): DocumentLayout {
  const base = defaultLayout();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<DocumentLayout>;
  const known = new Map((Array.isArray(r.columns) ? r.columns : []).map((c) => [c.key, c]));
  const columns: ColumnConfig[] = [];
  for (const c of Array.isArray(r.columns) ? r.columns : []) {
    const parsed = columnSchema.safeParse(c);
    if (parsed.success && !columns.some((x) => x.key === parsed.data.key)) columns.push(parsed.data);
  }
  for (const c of allColumns()) if (!known.has(c.key)) columns.push({ ...c, visible: false });
  const sections = { ...DEFAULT_SECTIONS, ...(r.sections ?? {}) };
  const header = headerOverridesSchema.safeParse(r.header ?? {});
  return {
    template: typeof r.template === "string" ? r.template : base.template,
    preset: typeof r.preset === "string" ? r.preset : undefined,
    columns: columns.length ? columns : base.columns,
    sections: sectionsSchema.parse(sections),
    header: header.success ? header.data : {},
    customText: typeof r.customText === "string" ? r.customText : null,
    signatureLabel: typeof r.signatureLabel === "string" ? r.signatureLabel : base.signatureLabel,
  };
}
