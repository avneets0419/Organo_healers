import { z } from "zod";
import {
  CUSTOMER_STATUSES,
  DISCOUNT_TYPES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  FOLLOWUP_CHANNELS,
  FOLLOWUP_PRIORITIES,
  FOLLOWUP_STATUSES,
  MANUAL_ACTIVITY_TYPES,
  MANUAL_MOVEMENT_TYPES,
  MESSAGE_CHANNELS,
  PAYMENT_METHODS,
  PRODUCT_KINDS,
} from "./enums";
import { layoutSchema } from "./layout";
import { normalizeIndianPhone } from "./phone";

// ─── Primitives ──────────────────────────────────────────────────────────────

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Accepts "1,505", 1505, "1505.5"; outputs a canonical decimal string. */
export const decimalString = (opts: { min?: number; max?: number; maxDp?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).replace(/,/g, "").trim())
    .refine((v) => DECIMAL_RE.test(v), "Must be a number")
    .refine((v) => (v.split(".")[1]?.length ?? 0) <= (opts.maxDp ?? 2), `At most ${opts.maxDp ?? 2} decimal places`)
    .refine((v) => opts.min === undefined || Number(v) >= opts.min, `Must be at least ${opts.min}`)
    .refine((v) => opts.max === undefined || Number(v) <= opts.max, `Must be at most ${opts.max}`);

export const moneyInput = decimalString({ min: 0, max: 999_999_999 });
export const qtyInput = decimalString({ min: 0.001, max: 9_999_999, maxDp: 3 });
export const taxRateInput = decimalString({ min: 0, max: 100 });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const phoneInput = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeIndianPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return n;
  });

export const emailInput = z
  .string()
  .trim()
  .toLowerCase()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!z.email().safeParse(v).success) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address" });
      return z.NEVER;
    }
    return v;
  });

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/;
export const gstinInput = z
  .string()
  .trim()
  .toUpperCase()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!GSTIN_RE.test(v)) {
      ctx.addIssue({ code: "custom", message: "GSTIN should be 15 characters, e.g. 06AXDPS65721ZK" });
      return z.NEVER;
    }
    return v;
  });

export const isoDate = z.coerce.date();

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(120).optional(),
});

// ─── Customers ───────────────────────────────────────────────────────────────

export const customerInput = z.object({
    name: z.string().trim().min(1, "Customer name is required").max(160),
    companyName: optionalText(160),
    phone: phoneInput,
    email: emailInput,
    gstin: gstinInput,
    billingAddress: optionalText(500),
    shippingAddress: optionalText(500),
    city: optionalText(80),
    status: z.enum(CUSTOMER_STATUSES).optional(),
    source: optionalText(80),
    notes: optionalText(4000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  });
export type CustomerInput = z.input<typeof customerInput>;
export type CustomerData = z.output<typeof customerInput>;

export const customerUpdateInput = customerInput.partial();

export const customerContactInput = z.object({
  name: z.string().trim().min(1).max(120),
  role: optionalText(80),
  phone: phoneInput,
  email: emailInput,
  isPrimary: z.boolean().optional(),
});

// ─── Products ────────────────────────────────────────────────────────────────

/** Kind-specific attributes. All optional strings so imports stay forgiving. */
export const productAttributesSchema = z
  .object({
    // Plants / trees
    localName: optionalText(120),
    scientificName: optionalText(160),
    bagSize: optionalText(40),
    height: optionalText(40),
    plantType: optionalText(60),
    // Pots / planters
    series: optionalText(80),
    potSize: optionalText(40),
    dimensions: optionalText(80),
    material: optionalText(80),
    color: optionalText(80),
    packOf: optionalText(20),
    brand: optionalText(80),
    // Services / materials
    serviceType: optionalText(80),
    materialType: optionalText(80),
    // Pricing hints
    priceOnRequest: z.boolean().nullish(),
  })
  .partial();
export type ProductAttributes = z.infer<typeof productAttributesSchema>;

export const productInput = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .min(2)
    .max(40)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Use letters, digits and dashes"),
  name: z.string().trim().min(1).max(160),
  description: optionalText(2000),
  kind: z.enum(PRODUCT_KINDS),
  categoryId: z.string().nullish(),
  unit: z.string().trim().min(1).max(20).default("pc"),
  mrp: moneyInput.nullish(),
  sellingPrice: moneyInput,
  costPrice: moneyInput.nullish(),
  taxRate: taxRateInput.default("0"),
  hsnCode: optionalText(20),
  trackStock: z.boolean().default(true),
  lowStockThreshold: decimalString({ min: 0, maxDp: 3 }).nullish(),
  imageUrl: optionalText(2000),
  attributes: productAttributesSchema.default({}),
  active: z.boolean().default(true),
  /** Only used on create: opening stock, recorded as an OPENING movement. */
  openingStock: decimalString({ min: 0, maxDp: 3 }).optional(),
  priceNote: optionalText(200),
});
export type ProductInput = z.input<typeof productInput>;
export const productUpdateInput = productInput.omit({ openingStock: true }).partial();

export const productListQuery = paginationQuery.extend({
  categoryId: z.string().optional(),
  kind: z.enum(PRODUCT_KINDS).optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
  stock: z.enum(["all", "low", "out"]).default("all"),
  sort: z.enum(["name", "price", "stock", "updated"]).default("name"),
});

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(PRODUCT_KINDS).default("OTHER"),
  parentId: z.string().nullish(),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});

export const stockMovementInput = z.object({
  productId: z.string().min(1),
  type: z.enum(MANUAL_MOVEMENT_TYPES as [string, ...string[]]),
  /** For PURCHASE/RETURN a positive quantity adds stock; DAMAGE removes it;
   *  ADJUSTMENT / MANUAL_CORRECTION accept a signed delta. */
  quantity: decimalString({ maxDp: 3 }).refine((v) => Number(v) !== 0, "Quantity cannot be zero"),
  unitCost: moneyInput.nullish(),
  reason: optionalText(300),
});

// ─── Documents ───────────────────────────────────────────────────────────────

export const documentItemInput = z.object({
  id: z.string().optional(),
  productId: z.string().nullish(),
  name: z.string().trim().min(1, "Item name is required").max(200),
  sku: optionalText(40),
  description: optionalText(1000),
  unit: optionalText(20),
  kind: z.enum(PRODUCT_KINDS).nullish(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  quantity: qtyInput,
  mrp: moneyInput.nullish(),
  rate: moneyInput,
  discountType: z.enum(DISCOUNT_TYPES).nullish(),
  discountValue: moneyInput.nullish(),
  taxRate: taxRateInput.default("0"),
});
export type DocumentItemInput = z.input<typeof documentItemInput>;

export const documentGroupInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().max(160).default(""),
  notes: optionalText(1000),
  items: z.array(documentItemInput).max(500),
});
export type DocumentGroupInput = z.input<typeof documentGroupInput>;

/** Fields of the customer block that can be edited per document (snapshot only). */
export const customerSnapshotOverrides = z
  .object({
    name: optionalText(160),
    companyName: optionalText(160),
    phone: optionalText(40),
    email: optionalText(160),
    gstin: optionalText(20),
    billingAddress: optionalText(500),
    shippingAddress: optionalText(500),
  })
  .partial();

export const documentInput = z
  .object({
    type: z.enum(DOCUMENT_TYPES),
    customerId: z.string().min(1, "Select or create a customer"),
    title: optionalText(160),
    issueDate: isoDate.optional(),
    dueDate: isoDate.nullish(),
    validUntil: isoDate.nullish(),
    groups: z.array(documentGroupInput).min(1).max(100),
    discountType: z.enum(DISCOUNT_TYPES).nullish(),
    discountValue: moneyInput.nullish(),
    notes: optionalText(4000),
    terms: optionalText(4000),
    paymentTerms: optionalText(2000),
    footer: optionalText(1000),
    layout: layoutSchema.optional(),
    customerOverrides: customerSnapshotOverrides.optional(),
    status: z.enum(["DRAFT", "SENT"]).optional(),
  })
  .refine((d) => d.groups.some((g) => g.items.length > 0), {
    message: "Add at least one item",
    path: ["groups"],
  });
export type DocumentInput = z.input<typeof documentInput>;
export type DocumentData = z.output<typeof documentInput>;

export const documentListQuery = paginationQuery.extend({
  type: z.enum(DOCUMENT_TYPES).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  customerId: z.string().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(["newest", "oldest", "amount", "due"]).default("newest"),
});

export const documentStatusInput = z.object({
  status: z.enum(DOCUMENT_STATUSES),
  note: optionalText(500),
});

export const sendDocumentInput = z.object({
  channels: z.array(z.enum(MESSAGE_CHANNELS)).min(1),
  email: z
    .object({
      to: z.email(),
      subject: z.string().trim().min(1).max(200).optional(),
      body: z.string().trim().min(1).max(10000).optional(),
      attachPdf: z.boolean().default(true),
    })
    .optional(),
  whatsapp: z
    .object({
      phone: phoneInput,
      message: z.string().trim().min(1).max(4000).optional(),
      templateKey: z.string().optional(),
    })
    .optional(),
});

// ─── Payments ────────────────────────────────────────────────────────────────

export const paymentInput = z.object({
  amount: decimalString({ min: 0.01, max: 999_999_999 }),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(120),
  notes: optionalText(500),
  paidAt: isoDate.default(() => new Date()),
});

// ─── CRM ─────────────────────────────────────────────────────────────────────

export const followUpInput = z.object({
  customerId: z.string().min(1),
  documentId: z.string().nullish(),
  title: z.string().trim().min(1, "Add a short title").max(200),
  notes: optionalText(2000),
  channel: z.enum(FOLLOWUP_CHANNELS).default("CALL"),
  dueAt: isoDate,
  reminderAt: isoDate.nullish(),
  priority: z.enum(FOLLOWUP_PRIORITIES).default("MEDIUM"),
  status: z.enum(FOLLOWUP_STATUSES).default("PENDING"),
  assignedToId: z.string().nullish(),
  templateId: z.string().nullish(),
});
export const followUpUpdateInput = followUpInput.partial().extend({
  outcome: optionalText(1000),
});

export const followUpListQuery = paginationQuery.extend({
  status: z.enum([...FOLLOWUP_STATUSES, "OPEN"] as [string, ...string[]]).optional(),
  scope: z.enum(["all", "today", "overdue", "upcoming", "completed"]).default("all"),
  customerId: z.string().optional(),
  assignedToId: z.string().optional(),
});

export const activityInput = z.object({
  customerId: z.string().min(1),
  documentId: z.string().nullish(),
  type: z.enum(MANUAL_ACTIVITY_TYPES as [string, ...string[]]),
  description: z.string().trim().min(1).max(2000),
});

// ─── Templates ───────────────────────────────────────────────────────────────

export const messageTemplateInput = z.object({
  channel: z.enum(MESSAGE_CHANNELS),
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, digits, - and _"),
  name: z.string().trim().min(1).max(80),
  subject: optionalText(200),
  body: z.string().trim().min(1).max(10000),
  documentType: z.enum(DOCUMENT_TYPES).nullish(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
});

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsInput = z
  .object({
    businessName: z.string().trim().min(1).max(120),
    legalName: optionalText(160),
    tagline: optionalText(120),
    logoUrl: optionalText(500_000), // allows data: URLs for uploaded logos
    gstNumber: gstinInput,
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(80),
    state: optionalText(80),
    postalCode: optionalText(12),
    phone: optionalText(40),
    email: emailInput,
    website: optionalText(200),
    upiId: optionalText(80),
    upiPhone: optionalText(40),
    bankName: optionalText(120),
    accountName: optionalText(120),
    accountNumber: optionalText(40),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .nullish()
      .transform((v, ctx) => {
        if (!v) return null;
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) {
          ctx.addIssue({ code: "custom", message: "IFSC looks like KKBK0004366" });
          return z.NEVER;
        }
        return v;
      }),
    paymentInstructions: optionalText(1000),
    invoicePrefix: z.string().trim().min(1).max(10).regex(/^[A-Z0-9]+$/i),
    proformaPrefix: z.string().trim().min(1).max(10).regex(/^[A-Z0-9]+$/i),
    numberPadding: z.number().int().min(3).max(8),
    invoiceStartNumber: z.number().int().min(1),
    proformaStartNumber: z.number().int().min(1),
    defaultTaxRate: taxRateInput,
    pricesIncludeTax: z.boolean(),
    roundToRupee: z.boolean(),
    invoiceDueDays: z.number().int().min(0).max(365),
    proformaValidDays: z.number().int().min(0).max(365),
    defaultNotes: optionalText(4000),
    defaultTerms: optionalText(4000),
    paymentTerms: optionalText(2000),
    invoiceFooter: optionalText(1000),
    defaultLayout: layoutSchema.nullish(),
    emailSenderName: optionalText(120),
    emailReplyTo: emailInput,
    salespersonName: optionalText(120),
  })
  .partial();
export type SettingsInput = z.input<typeof settingsInput>;

// ─── Auth ────────────────────────────────────────────────────────────────────

export const loginInput = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const userInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().transform((v) => v.toLowerCase()),
  phone: phoneInput,
  roleId: z.string().min(1),
  password: z.string().min(10, "At least 10 characters").max(200).optional(),
  active: z.boolean().default(true),
});

export const dateRangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  customerId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.string().optional(),
});
