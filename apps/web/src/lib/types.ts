import type {
  CustomerStatus,
  DocumentStatus,
  DocumentType,
  DocumentLayout,
  ProductKind,
  RenderableDocument,
  FollowUpStatus,
  FollowUpPriority,
  FollowUpChannel,
  ActivityType,
  PaymentMethod,
  MovementType,
} from "@organo/shared";

export interface Category {
  id: string;
  name: string;
  slug: string;
  kind: ProductKind;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  kind: ProductKind;
  unit: string;
  mrp: string | null;
  sellingPrice: string;
  costPrice: string | null;
  taxRate: string;
  hsnCode: string | null;
  trackStock: boolean;
  stockQuantity: string;
  lowStockThreshold: string | null;
  imageUrl: string | null;
  attributes: Record<string, string | boolean | null>;
  active: boolean;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  updatedAt: string;
  createdAt: string;
}

export interface CustomerLite {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  status: CustomerStatus;
}

export interface DocumentGroup {
  id: string;
  name: string;
  notes: string | null;
  position: number;
  subtotal: string;
  items: Array<{
    id: string;
    productId: string | null;
    name: string;
    sku: string | null;
    description: string | null;
    unit: string | null;
    kind: ProductKind | null;
    attributes: Record<string, string | number | boolean | null>;
    quantity: string;
    mrp: string | null;
    rate: string;
    discountType: "PERCENT" | "AMOUNT" | null;
    discountValue: string | null;
    taxRate: string;
    total: string;
  }>;
}

export interface DocumentDetail {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  title: string | null;
  publicToken: string;
  publicUrl: string;
  customerId: string;
  customer: { id: string; name: string; phone: string | null; email: string | null; status: CustomerStatus };
  customerSnapshot: { billingAddress?: string | null; shippingAddress?: string | null; name: string; phone?: string | null; email?: string | null };
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  discountType: "PERCENT" | "AMOUNT" | null;
  discountValue: string | null;
  notes: string | null;
  terms: string | null;
  paymentTerms: string | null;
  footer: string | null;
  layout: DocumentLayout;
  groups: DocumentGroup[];
  sourceDocument: { id: string; number: string; type: DocumentType; status: DocumentStatus } | null;
  derivedDocuments: Array<{ id: string; number: string; type: DocumentType; status: DocumentStatus; grandTotal: string }>;
  payments: Payment[];
  createdBy: { id: string; name: string } | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  convertedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  renderable: RenderableDocument;
}

export interface DocumentRow {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  title: string | null;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  sentAt: string | null;
  viewedAt: string | null;
  publicToken: string;
  customer: { id: string; name: string; phone: string | null; email: string | null };
  sourceDocument: { id: string; number: string } | null;
  derivedDocuments: Array<{ id: string; number: string }>;
  _count: { items: number };
}

export interface Payment {
  id: string;
  documentId: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  paidAt: string;
  voidedAt: string | null;
  createdAt: string;
  document?: { number: string };
}

export interface Settings {
  businessName: string;
  legalName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  gstNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  upiId: string | null;
  upiPhone: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  paymentInstructions: string | null;
  invoicePrefix: string;
  proformaPrefix: string;
  numberPadding: number;
  invoiceStartNumber: number;
  proformaStartNumber: number;
  defaultTaxRate: string;
  pricesIncludeTax: boolean;
  roundToRupee: boolean;
  invoiceDueDays: number;
  proformaValidDays: number;
  defaultNotes: string | null;
  defaultTerms: string | null;
  paymentTerms: string | null;
  invoiceFooter: string | null;
  defaultLayout: DocumentLayout;
  emailSenderName: string | null;
  emailReplyTo: string | null;
  salespersonName: string | null;
  integrations: { email: { provider: string; configured: boolean } };
}

export interface FollowUp {
  id: string;
  customerId: string;
  documentId: string | null;
  title: string;
  notes: string | null;
  channel: FollowUpChannel;
  dueAt: string;
  reminderAt: string | null;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  outcome: string | null;
  completedAt: string | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string | null; email: string | null; status: CustomerStatus };
  document: { id: string; number: string; type: DocumentType; status: DocumentStatus; grandTotal: string; publicToken: string } | null;
  assignedTo: { id: string; name: string } | null;
  template: { id: string; key: string; name: string } | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  customerId: string | null;
  documentId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string } | null;
  document?: { id: string; number: string; type: DocumentType } | null;
  customer?: { id: string; name: string } | null;
}

export interface Movement {
  id: string;
  productId: string;
  type: MovementType;
  quantity: string;
  balanceAfter: string;
  unitCost: string | null;
  reason: string | null;
  createdAt: string;
  product?: { id: string; name: string; sku: string; unit: string };
  user: { name: string } | null;
  document: { id: string; number: string; type: DocumentType } | null;
}
