import type { CustomerStatus, DocumentStatus, DocumentType } from "@prisma/client";
import type { Tx } from "../../lib/prisma";

interface DocLite {
  type: DocumentType;
  status: DocumentStatus;
}

/**
 * Derive the pipeline stage from the customer's documents. Pure so it can be
 * unit tested. Highest stage wins: payments > invoices > proforma progress > lead.
 */
export function deriveCustomerStatus(docs: DocLite[]): CustomerStatus {
  const invoices = docs.filter((d) => d.type === "INVOICE" && d.status !== "CANCELLED");
  const proformas = docs.filter((d) => d.type === "PROFORMA");
  const inv = (s: DocumentStatus) => invoices.some((d) => d.status === s);
  const pf = (s: DocumentStatus) => proformas.some((d) => d.status === s);

  if (invoices.length && invoices.every((d) => d.status === "PAID")) return "PAID";
  if (inv("PARTIALLY_PAID")) return "PARTIALLY_PAID";
  if (inv("SENT") || inv("OVERDUE")) return "INVOICE_SENT";
  if (inv("DRAFT") || inv("PAID") || pf("ACCEPTED") || pf("CONVERTED")) return "CONFIRMED";
  if (pf("NEGOTIATING")) return "NEGOTIATING";
  if (pf("SENT") || pf("VIEWED")) return "PROFORMA_SENT";
  if (proformas.length) return "QUOTED";
  return "LEAD";
}

/** Statuses a person set on purpose; automatic sync leaves them alone. */
const STICKY: CustomerStatus[] = ["COMPLETED", "INACTIVE"];

export async function syncCustomerStatus(tx: Tx, customerId: string, opts: { force?: boolean } = {}) {
  const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { status: true } });
  if (!customer) return;
  if (!opts.force && STICKY.includes(customer.status)) return;
  const docs = await tx.document.findMany({ where: { customerId }, select: { type: true, status: true } });
  const next = deriveCustomerStatus(docs);
  if (next !== customer.status) await tx.customer.update({ where: { id: customerId }, data: { status: next } });
}
