import { DOCUMENT_TYPE_LABEL, type DocumentType } from "./enums";
import { formatINR } from "./money";
import { toWhatsAppNumber } from "./phone";

export const TEMPLATE_VARIABLES = [
  { key: "customer_name", description: "Customer's name" },
  { key: "document_type", description: "Proforma Invoice / Invoice" },
  { key: "invoice_number", description: "Document number, e.g. PI-2026-0012" },
  { key: "amount", description: "Grand total, e.g. ₹98,963" },
  { key: "balance_due", description: "Amount still to be paid" },
  { key: "invoice_link", description: "Secure public link to the document" },
  { key: "business_name", description: "Your business name" },
  { key: "business_phone", description: "Your business phone" },
  { key: "salesperson", description: "Person sending the message" },
  { key: "due_date", description: "Due date or validity date" },
  { key: "upi_id", description: "UPI ID from settings" },
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type TemplateVars = Partial<Record<TemplateVariable, string | null | undefined>>;

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Replace {{variables}}. Unknown variables stay visible so typos are noticed. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(VAR_RE, (match, key: string) => {
    const v = vars[key as TemplateVariable];
    return v === undefined || v === null ? match : String(v);
  });
}

export function findUnknownVariables(body: string): string[] {
  const known = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
  const out = new Set<string>();
  for (const m of body.matchAll(VAR_RE)) if (m[1] && !known.has(m[1])) out.add(m[1]);
  return [...out];
}

/**
 * Click-to-chat link. wa.me opens the WhatsApp app on mobile and WhatsApp Web /
 * Desktop on computers, with the chat for `phone` and the text prefilled.
 * It does NOT send anything; the user still has to press send in WhatsApp.
 */
export function buildWhatsAppUrl(phone: string | null | undefined, text: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export interface DocumentMessageContext {
  type: DocumentType;
  number: string;
  grandTotal: string;
  balanceDue?: string | null;
  customerName: string;
  link: string;
  businessName: string;
  businessPhone?: string | null;
  salesperson?: string | null;
  dueDate?: Date | string | null;
  upiId?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "07 Sep 2026" in India time, identical on server and browser (no locale quirks like "Sept"). */
export function formatDisplayDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const ist = new Date(date.getTime() + 5.5 * 3600_000);
  return `${String(ist.getUTCDate()).padStart(2, "0")} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

export function documentTemplateVars(ctx: DocumentMessageContext): TemplateVars {
  return {
    customer_name: ctx.customerName,
    document_type: DOCUMENT_TYPE_LABEL[ctx.type],
    invoice_number: ctx.number,
    amount: formatINR(ctx.grandTotal),
    balance_due: formatINR(ctx.balanceDue ?? ctx.grandTotal),
    invoice_link: ctx.link,
    business_name: ctx.businessName,
    business_phone: ctx.businessPhone ?? "",
    salesperson: ctx.salesperson ?? ctx.businessName,
    due_date: formatDisplayDate(ctx.dueDate),
    upi_id: ctx.upiId ?? "",
  };
}

export interface DefaultTemplate {
  channel: "WHATSAPP" | "EMAIL";
  key: string;
  name: string;
  subject?: string;
  body: string;
  documentType?: DocumentType;
  isDefault?: boolean;
}

/** Seeded templates. Editable in Settings > Templates. */
export const DEFAULT_MESSAGE_TEMPLATES: DefaultTemplate[] = [
  {
    channel: "WHATSAPP",
    key: "proforma",
    name: "Proforma Invoice",
    documentType: "PROFORMA",
    isDefault: true,
    body: `Hello {{customer_name}},

Please find your Proforma Invoice from {{business_name}}.

Invoice No: {{invoice_number}}
Amount: {{amount}}

You can view the invoice here:
{{invoice_link}}

Thank you,
{{business_name}}
Plant Studio`,
  },
  {
    channel: "WHATSAPP",
    key: "invoice",
    name: "Final Invoice",
    documentType: "INVOICE",
    isDefault: true,
    body: `Hello {{customer_name}},

Thank you for your order. Here is your invoice from {{business_name}}.

Invoice No: {{invoice_number}}
Amount: {{amount}}
Due: {{due_date}}

View and download:
{{invoice_link}}

UPI: {{upi_id}}

Thank you,
{{business_name}}
Plant Studio`,
  },
  {
    channel: "WHATSAPP",
    key: "payment_reminder",
    name: "Payment Reminder",
    documentType: "INVOICE",
    body: `Hello {{customer_name}},

A gentle reminder that {{balance_due}} is pending on invoice {{invoice_number}}.

You can view the invoice here:
{{invoice_link}}

UPI: {{upi_id}}

Thank you,
{{salesperson}}
{{business_name}}`,
  },
  {
    channel: "WHATSAPP",
    key: "follow_up",
    name: "Follow-up",
    body: `Hello {{customer_name}},

Just checking in on the {{document_type}} {{invoice_number}} we shared. Happy to adjust plants, pots or quantities if needed.

{{invoice_link}}

Regards,
{{salesperson}}
{{business_name}}`,
  },
  {
    channel: "WHATSAPP",
    key: "thank_you",
    name: "Thank You",
    body: `Hello {{customer_name}},

Thank you for choosing {{business_name}}. We hope your plants settle in beautifully. Reach out any time for care tips.

{{salesperson}}
{{business_name}}`,
  },
  {
    channel: "WHATSAPP",
    key: "order_confirmation",
    name: "Order Confirmation",
    body: `Hello {{customer_name}},

Your order {{invoice_number}} ({{amount}}) is confirmed. Material will be delivered within the week.

{{invoice_link}}

{{business_name}}`,
  },
  {
    channel: "WHATSAPP",
    key: "delivery_update",
    name: "Delivery Update",
    body: `Hello {{customer_name}},

Your plants for {{invoice_number}} are scheduled for delivery. Our team will call before arriving.

{{business_name}}
{{business_phone}}`,
  },
  {
    channel: "WHATSAPP",
    key: "custom",
    name: "Custom",
    body: `Hello {{customer_name}},

{{business_name}}`,
  },
  {
    channel: "EMAIL",
    key: "proforma",
    name: "Proforma Invoice email",
    documentType: "PROFORMA",
    isDefault: true,
    subject: "Proforma Invoice {{invoice_number}} from {{business_name}}",
    body: `Hello {{customer_name}},

Please find attached your Proforma Invoice {{invoice_number}} for {{amount}}.

You can also view it online: {{invoice_link}}

Let us know if you would like any changes to plants, pots or quantities.

Warm regards,
{{salesperson}}
{{business_name}}
{{business_phone}}`,
  },
  {
    channel: "EMAIL",
    key: "invoice",
    name: "Invoice email",
    documentType: "INVOICE",
    isDefault: true,
    subject: "Invoice {{invoice_number}} from {{business_name}}",
    body: `Hello {{customer_name}},

Thank you for your order. Please find attached invoice {{invoice_number}} for {{amount}}, due {{due_date}}.

View online: {{invoice_link}}

UPI: {{upi_id}}

Warm regards,
{{salesperson}}
{{business_name}}
{{business_phone}}`,
  },
  {
    channel: "EMAIL",
    key: "payment_reminder",
    name: "Payment reminder email",
    documentType: "INVOICE",
    subject: "Payment reminder: {{invoice_number}}",
    body: `Hello {{customer_name}},

This is a gentle reminder that {{balance_due}} is pending on invoice {{invoice_number}}.

View online: {{invoice_link}}

Warm regards,
{{business_name}}`,
  },
];
