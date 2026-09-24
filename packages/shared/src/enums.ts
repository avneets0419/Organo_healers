// Mirrors of the Prisma enums so the web app never imports @prisma/client.
// Labels live next to the values so every surface speaks the same language.

export const DOCUMENT_TYPES = ["PROFORMA", "INVOICE", "QUOTATION", "CREDIT_NOTE"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  PROFORMA: "Proforma Invoice",
  INVOICE: "Invoice",
  QUOTATION: "Quotation",
  CREDIT_NOTE: "Credit Note",
};

export const DOCUMENT_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "NEGOTIATING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PROFORMA_STATUSES: DocumentStatus[] = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "NEGOTIATING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
];
export const INVOICE_STATUSES: DocumentStatus[] = [
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
];

export function statusesFor(type: DocumentType): DocumentStatus[] {
  return type === "INVOICE" ? INVOICE_STATUSES : PROFORMA_STATUSES;
}

/** Statuses a user may set by hand. Payment-driven and system statuses are excluded. */
export function manualStatusesFor(type: DocumentType): DocumentStatus[] {
  return type === "INVOICE"
    ? ["DRAFT", "SENT", "CANCELLED"]
    : ["DRAFT", "SENT", "NEGOTIATING", "ACCEPTED", "REJECTED", "EXPIRED"];
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  NEGOTIATING: "Negotiating",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CONVERTED: "Converted",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const CUSTOMER_STATUSES = [
  "LEAD",
  "QUOTED",
  "PROFORMA_SENT",
  "NEGOTIATING",
  "CONFIRMED",
  "INVOICE_SENT",
  "PARTIALLY_PAID",
  "PAID",
  "COMPLETED",
  "INACTIVE",
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  LEAD: "Lead",
  QUOTED: "Quoted",
  PROFORMA_SENT: "Proforma sent",
  NEGOTIATING: "Negotiating",
  CONFIRMED: "Confirmed",
  INVOICE_SENT: "Invoice sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  COMPLETED: "Completed",
  INACTIVE: "Inactive",
};

export const PRODUCT_KINDS = ["PLANT", "POT", "MATERIAL", "SERVICE", "OTHER"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  PLANT: "Plant",
  POT: "Pot / Planter",
  MATERIAL: "Material",
  SERVICE: "Service",
  OTHER: "Other",
};

export const MOVEMENT_TYPES = [
  "OPENING",
  "PURCHASE",
  "SALE",
  "ADJUSTMENT",
  "RETURN",
  "DAMAGE",
  "MANUAL_CORRECTION",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_TYPE_LABEL: Record<MovementType, string> = {
  OPENING: "Opening stock",
  PURCHASE: "Purchase",
  SALE: "Sale",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
  DAMAGE: "Damage",
  MANUAL_CORRECTION: "Manual correction",
};
/** Movement types a user records by hand (SALE / RETURN come from invoices). */
export const MANUAL_MOVEMENT_TYPES: MovementType[] = [
  "PURCHASE",
  "ADJUSTMENT",
  "RETURN",
  "DAMAGE",
  "MANUAL_CORRECTION",
];

export const PAYMENT_METHODS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

export const FOLLOWUP_STATUSES = ["PENDING", "SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];
export const FOLLOWUP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  PENDING: "Pending",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const FOLLOWUP_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type FollowUpPriority = (typeof FOLLOWUP_PRIORITIES)[number];
export const FOLLOWUP_PRIORITY_LABEL: Record<FollowUpPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const FOLLOWUP_CHANNELS = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "VISIT", "OTHER"] as const;
export type FollowUpChannel = (typeof FOLLOWUP_CHANNELS)[number];
export const FOLLOWUP_CHANNEL_LABEL: Record<FollowUpChannel, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  VISIT: "Site visit",
  OTHER: "Other",
};

export const DISCOUNT_TYPES = ["PERCENT", "AMOUNT"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const MESSAGE_CHANNELS = ["WHATSAPP", "EMAIL"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const ACTIVITY_TYPES = [
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "PROFORMA_CREATED",
  "PROFORMA_EDITED",
  "PROFORMA_SENT",
  "PROFORMA_VIEWED",
  "PROFORMA_STATUS_CHANGED",
  "PROFORMA_CONVERTED",
  "INVOICE_CREATED",
  "INVOICE_EDITED",
  "INVOICE_SENT",
  "INVOICE_VIEWED",
  "INVOICE_STATUS_CHANGED",
  "INVOICE_CANCELLED",
  "WHATSAPP_OPENED",
  "WHATSAPP_SENT",
  "EMAIL_SENT",
  "EMAIL_FAILED",
  "FOLLOWUP_CREATED",
  "FOLLOWUP_UPDATED",
  "FOLLOWUP_COMPLETED",
  "CALL",
  "MEETING",
  "NOTE",
  "PAYMENT_RECEIVED",
  "PAYMENT_VOIDED",
  "PAYMENT_REMINDER",
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_PRICE_CHANGED",
  "STOCK_CHANGED",
  "SETTINGS_UPDATED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  CUSTOMER_CREATED: "Customer created",
  CUSTOMER_UPDATED: "Customer updated",
  PROFORMA_CREATED: "Proforma created",
  PROFORMA_EDITED: "Proforma edited",
  PROFORMA_SENT: "Proforma sent",
  PROFORMA_VIEWED: "Proforma viewed",
  PROFORMA_STATUS_CHANGED: "Proforma status changed",
  PROFORMA_CONVERTED: "Converted to invoice",
  INVOICE_CREATED: "Invoice created",
  INVOICE_EDITED: "Invoice edited",
  INVOICE_SENT: "Invoice sent",
  INVOICE_VIEWED: "Invoice viewed",
  INVOICE_STATUS_CHANGED: "Invoice status changed",
  INVOICE_CANCELLED: "Invoice cancelled",
  WHATSAPP_OPENED: "WhatsApp opened",
  WHATSAPP_SENT: "WhatsApp sent",
  EMAIL_SENT: "Email sent",
  EMAIL_FAILED: "Email failed",
  FOLLOWUP_CREATED: "Follow-up created",
  FOLLOWUP_UPDATED: "Follow-up updated",
  FOLLOWUP_COMPLETED: "Follow-up completed",
  CALL: "Call",
  MEETING: "Meeting",
  NOTE: "Note",
  PAYMENT_RECEIVED: "Payment received",
  PAYMENT_VOIDED: "Payment voided",
  PAYMENT_REMINDER: "Payment reminder",
  PRODUCT_CREATED: "Product created",
  PRODUCT_UPDATED: "Product updated",
  PRODUCT_PRICE_CHANGED: "Price changed",
  STOCK_CHANGED: "Stock changed",
  SETTINGS_UPDATED: "Settings updated",
};

/** Activity types a user can log by hand from the CRM. */
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = [
  "CALL",
  "MEETING",
  "NOTE",
  "WHATSAPP_SENT",
  "PAYMENT_REMINDER",
];

export const PERMISSIONS = [
  "documents:read",
  "documents:write",
  "documents:send",
  "customers:read",
  "customers:write",
  "inventory:read",
  "inventory:write",
  "payments:write",
  "reports:read",
  "settings:write",
  "users:manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
