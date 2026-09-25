import type { DocumentLayout } from "./layout";
import type { DocumentStatus, DocumentType, ProductKind } from "./enums";

/** Frozen copy of business details at document creation time. */
export interface BusinessSnapshot {
  name: string;
  legalName?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  gstNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  upiId?: string | null;
  upiPhone?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  ifsc?: string | null;
  paymentInstructions?: string | null;
}

/** Frozen copy of customer details at document creation time. */
export interface CustomerSnapshot {
  name: string;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
}

export interface RenderableItem {
  name: string;
  sku?: string | null;
  description?: string | null;
  unit?: string | null;
  kind?: ProductKind | null;
  attributes?: Record<string, unknown> | null;
  quantity: string;
  mrp?: string | null;
  rate: string;
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: string | null;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
}

export interface RenderableGroup {
  name: string;
  notes?: string | null;
  subtotal: string;
  items: RenderableItem[];
}

export interface RenderableTotals {
  subtotal: string;
  itemDiscountTotal: string;
  discountTotal: string;
  discountType?: "PERCENT" | "AMOUNT" | null;
  discountValue?: string | null;
  taxableTotal: string;
  taxTotal: string;
  roundOff: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
}

/** Everything the invoice renderer needs. Same shape for preview, public page and PDF. */
export interface RenderableDocument {
  type: DocumentType;
  number: string | null; // null while an unsaved POS draft
  status: DocumentStatus;
  title?: string | null;
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  business: BusinessSnapshot;
  customer: CustomerSnapshot;
  groups: RenderableGroup[];
  totals: RenderableTotals;
  notes?: string | null;
  terms?: string | null;
  paymentTerms?: string | null;
  footer?: string | null;
  layout: DocumentLayout;
  sourceNumber?: string | null; // proforma this invoice was converted from
}

export function joinAddress(parts: Array<string | null | undefined>): string | null {
  const s = parts.map((p) => p?.trim()).filter(Boolean).join(", ");
  return s || null;
}
