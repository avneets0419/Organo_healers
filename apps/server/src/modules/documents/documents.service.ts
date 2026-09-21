import type { DocumentStatus, DocumentType, Prisma as P } from "@prisma/client";
import {
  calculateDocument,
  documentInput,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  formatINR,
  formatPhone,
  manualStatusesFor,
  normalizeLayout,
  statusesFor,
  type CustomerSnapshot,
  type RenderableDocument,
  type BusinessSnapshot,
} from "@organo/shared";
import type { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError } from "../../lib/http";
import { Prisma, prisma, type Tx } from "../../lib/prisma";
import { syncCustomerStatus } from "../customers/customer-status";
import { syncDocumentStock } from "../inventory/stock.service";
import { businessSnapshot, getSettings, settingsLayout } from "../settings/settings.service";
import { newPublicToken, reserveDocumentNumber } from "./numbering";

type DocumentData = z.output<typeof documentInput>;

export const documentInclude = {
  groups: { orderBy: { position: "asc" }, include: { items: { orderBy: { position: "asc" } } } },
  customer: { select: { id: true, name: true, phone: true, email: true, status: true } },
  sourceDocument: { select: { id: true, number: true, type: true, status: true } },
  derivedDocuments: { select: { id: true, number: true, type: true, status: true, grandTotal: true } },
  payments: { where: { voidedAt: null }, orderBy: { paidAt: "desc" } },
  createdBy: { select: { id: true, name: true } },
} satisfies P.DocumentInclude;

export type FullDocument = P.DocumentGetPayload<{ include: typeof documentInclude }>;

const D = Prisma.Decimal;

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

function customerSnapshotFrom(
  c: { name: string; companyName: string | null; phone: string | null; email: string | null; gstin: string | null; billingAddress: string | null; shippingAddress: string | null },
  overrides: DocumentData["customerOverrides"] = {},
): CustomerSnapshot {
  const pick = <K extends keyof CustomerSnapshot>(k: K, v: CustomerSnapshot[K]) =>
    overrides && k in overrides && overrides[k as keyof typeof overrides] !== undefined
      ? (overrides[k as keyof typeof overrides] as CustomerSnapshot[K])
      : v;
  return {
    name: pick("name", c.name) || c.name,
    companyName: pick("companyName", c.companyName),
    phone: pick("phone", c.phone ? formatPhone(c.phone) : null),
    email: pick("email", c.email),
    gstin: pick("gstin", c.gstin),
    billingAddress: pick("billingAddress", c.billingAddress),
    shippingAddress: pick("shippingAddress", c.shippingAddress),
  };
}

/** Product snapshot defaults for items that reference a catalog product. */
async function resolveItems(tx: Tx, groups: DocumentData["groups"]) {
  const ids = [...new Set(groups.flatMap((g) => g.items.map((i) => i.productId)).filter((x): x is string => !!x))];
  const products = ids.length ? await tx.product.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const id of ids) if (!byId.has(id)) throw ApiError.badRequest("A selected product no longer exists. Remove it and add it again.");
  return byId;
}

async function writeGroups(tx: Tx, documentId: string, data: DocumentData, calc: ReturnType<typeof calculateDocument>) {
  const products = await resolveItems(tx, data.groups);
  // Two statements regardless of size: all groups, then all items. Matters on a
  // remote database where every round trip costs real time.
  const groups = await tx.documentGroup.createManyAndReturn({
    data: data.groups.map((g, gi) => ({ documentId, name: g.name, notes: g.notes, position: gi, subtotal: calc.groups[gi]!.subtotal })),
    select: { id: true, position: true },
  });
  const groupId = new Map(groups.map((g) => [g.position, g.id]));
  const items = data.groups.flatMap((g, gi) =>
    g.items.map((it, ii) => {
      const p = it.productId ? products.get(it.productId) : undefined;
      const ic = calc.groups[gi]!.items[ii]!;
      return {
        documentId,
        groupId: groupId.get(gi)!,
        position: ii,
        productId: p?.id ?? null,
        name: it.name,
        sku: it.sku ?? p?.sku ?? null,
        description: it.description ?? null,
        unit: it.unit ?? p?.unit ?? null,
        kind: it.kind ?? p?.kind ?? null,
        attributes: (it.attributes ?? {}) as P.InputJsonValue,
        quantity: it.quantity,
        mrp: it.mrp ?? null,
        rate: it.rate,
        discountType: it.discountType ?? null,
        discountValue: it.discountType ? (it.discountValue ?? null) : null,
        taxRate: it.taxRate ?? "0",
        lineSubtotal: ic.lineSubtotal,
        discountAmount: ic.discountAmount,
        taxableAmount: ic.taxableAmount,
        taxAmount: ic.taxAmount,
        total: ic.total,
      };
    }),
  );
  if (items.length) await tx.documentItem.createMany({ data: items });
}

function totalsData(calc: ReturnType<typeof calculateDocument>) {
  const t = calc.totals;
  return {
    subtotal: t.subtotal,
    itemDiscountTotal: t.itemDiscountTotal,
    discountTotal: t.discountTotal,
    taxableTotal: t.taxableTotal,
    taxTotal: t.taxTotal,
    roundOff: t.roundOff,
    grandTotal: t.grandTotal,
    amountPaid: t.amountPaid,
    balanceDue: t.balanceDue,
  };
}

function activityTypeFor(type: DocumentType, action: "CREATED" | "EDITED" | "SENT" | "STATUS_CHANGED" | "VIEWED") {
  const prefix = type === "INVOICE" ? "INVOICE" : "PROFORMA";
  return `${prefix}_${action}` as P.ActivityCreateInput["type"];
}

export interface CreateOptions {
  userId?: string | null;
  sourceDocumentId?: string;
  /** Seed/import only: keep historical status without side effects. */
  importedFrom?: string;
}

export async function createDocument(data: DocumentData, opts: CreateOptions = {}) {
  return prisma.$transaction(
    async (tx) => {
      const [customer, settings] = await Promise.all([tx.customer.findUnique({ where: { id: data.customerId } }), getSettings(tx)]);
      if (!customer) throw ApiError.notFound("Customer");
      const issueDate = data.issueDate ?? new Date();
      const status: DocumentStatus = data.status ?? "DRAFT";

      const calc = calculateDocument(data.groups, {
        discountType: data.discountType,
        discountValue: data.discountValue,
        pricesIncludeTax: settings.pricesIncludeTax,
        roundToRupee: settings.roundToRupee,
      });

      const number = await reserveDocumentNumber(tx, data.type, issueDate, settings);
      const layout = data.layout ?? settingsLayout(settings);

      const doc = await tx.document.create({
        data: {
          type: data.type,
          number,
          status,
          publicToken: newPublicToken(),
          title: data.title,
          customerId: customer.id,
          customerSnapshot: customerSnapshotFrom(customer, data.customerOverrides) as unknown as P.InputJsonValue,
          businessSnapshot: businessSnapshot(settings) as unknown as P.InputJsonValue,
          issueDate,
          dueDate:
            data.dueDate === undefined ? (data.type === "INVOICE" ? addDays(issueDate, settings.invoiceDueDays) : null) : data.dueDate,
          validUntil:
            data.validUntil === undefined
              ? data.type === "PROFORMA"
                ? addDays(issueDate, settings.proformaValidDays)
                : null
              : data.validUntil,
          discountType: data.discountType ?? null,
          discountValue: data.discountType ? (data.discountValue ?? null) : null,
          ...totalsData(calc),
          notes: data.notes === undefined ? settings.defaultNotes : data.notes,
          terms: data.terms === undefined ? settings.defaultTerms : data.terms,
          paymentTerms: data.paymentTerms === undefined ? settings.paymentTerms : data.paymentTerms,
          footer: data.footer === undefined ? settings.invoiceFooter : data.footer,
          layout: layout as unknown as P.InputJsonValue,
          sourceDocumentId: opts.sourceDocumentId ?? null,
          createdById: opts.userId ?? null,
          sentAt: status === "SENT" ? issueDate : null,
        },
      });
      await writeGroups(tx, doc.id, data, calc);

      await logActivity(tx, {
        type: activityTypeFor(data.type, "CREATED"),
        description: opts.importedFrom
          ? `${DOCUMENT_TYPE_LABEL[data.type]} ${number} imported from ${opts.importedFrom}`
          : `${DOCUMENT_TYPE_LABEL[data.type]} ${number} created for ${formatINR(calc.totals.grandTotal)}`,
        customerId: customer.id,
        documentId: doc.id,
        entityType: "document",
        entityId: doc.id,
        metadata: { number, total: calc.totals.grandTotal, groups: data.groups.length },
        userId: opts.userId,
        touchCustomer: false,
      });

      if (data.type === "INVOICE") await syncDocumentStock(tx, doc.id, opts.userId);
      await syncCustomerStatus(tx, customer.id, { force: true });
      return tx.document.findUniqueOrThrow({ where: { id: doc.id }, include: documentInclude });
    },
    { timeout: 20_000 },
  );
}

const LOCKED: DocumentStatus[] = ["CONVERTED", "CANCELLED"];

export async function updateDocument(id: string, data: DocumentData, userId?: string | null) {
  return prisma.$transaction(
    async (tx) => {
      const [existing, customer, settings, paid] = await Promise.all([
        tx.document.findUnique({ where: { id } }),
        tx.customer.findUnique({ where: { id: data.customerId } }),
        getSettings(tx),
        tx.payment.aggregate({ where: { documentId: id, voidedAt: null }, _sum: { amount: true } }),
      ]);
      if (!existing) throw ApiError.notFound("Document");
      if (LOCKED.includes(existing.status)) {
        throw ApiError.conflict(`This ${DOCUMENT_TYPE_LABEL[existing.type].toLowerCase()} is ${DOCUMENT_STATUS_LABEL[existing.status].toLowerCase()} and can no longer be edited. Duplicate it instead.`);
      }
      if (data.type !== existing.type) throw ApiError.badRequest("Document type can't change after creation. Convert or duplicate instead.");
      if (!customer) throw ApiError.notFound("Customer");
      const calc = calculateDocument(data.groups, {
        discountType: data.discountType,
        discountValue: data.discountValue,
        pricesIncludeTax: settings.pricesIncludeTax,
        roundToRupee: settings.roundToRupee,
        amountPaid: paid._sum.amount?.toString() ?? "0",
      });

      await tx.documentGroup.deleteMany({ where: { documentId: id } }); // cascades items
      await tx.document.update({
        where: { id },
        data: {
          title: data.title,
          customerId: customer.id,
          customerSnapshot: customerSnapshotFrom(customer, data.customerOverrides) as unknown as P.InputJsonValue,
          issueDate: data.issueDate ?? existing.issueDate,
          dueDate: data.dueDate === undefined ? existing.dueDate : data.dueDate,
          validUntil: data.validUntil === undefined ? existing.validUntil : data.validUntil,
          discountType: data.discountType ?? null,
          discountValue: data.discountType ? (data.discountValue ?? null) : null,
          ...totalsData(calc),
          notes: data.notes === undefined ? existing.notes : data.notes,
          terms: data.terms === undefined ? existing.terms : data.terms,
          paymentTerms: data.paymentTerms === undefined ? existing.paymentTerms : data.paymentTerms,
          footer: data.footer === undefined ? existing.footer : data.footer,
          layout: (data.layout ?? normalizeLayout(existing.layout)) as unknown as P.InputJsonValue,
        },
      });
      await writeGroups(tx, id, data, calc);
      if (existing.type === "INVOICE") await refreshPaymentStatus(tx, id);

      const before = existing.grandTotal.toString();
      await logActivity(tx, {
        type: activityTypeFor(existing.type, "EDITED"),
        description:
          existing.grandTotal.equals(calc.totals.grandTotal)
            ? `${existing.number} edited`
            : `${existing.number} edited: ${formatINR(before)} to ${formatINR(calc.totals.grandTotal)}`,
        customerId: customer.id,
        documentId: id,
        entityType: "document",
        entityId: id,
        metadata: { before, after: calc.totals.grandTotal },
        userId,
        touchCustomer: false,
      });
      if (existing.type === "INVOICE") await syncDocumentStock(tx, id, userId);
      await syncCustomerStatus(tx, customer.id);
      if (customer.id !== existing.customerId) await syncCustomerStatus(tx, existing.customerId);
      return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude });
    },
    { timeout: 20_000 },
  );
}

/** Recalculate paid / balance and the payment-driven invoice status. */
export async function refreshPaymentStatus(tx: Tx, documentId: string) {
  const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
  const sum = await tx.payment.aggregate({ where: { documentId, voidedAt: null }, _sum: { amount: true } });
  const paid = sum._sum.amount ?? new D(0);
  const balance = D.max(doc.grandTotal.minus(paid), 0);
  let status = doc.status;
  let paidAt = doc.paidAt;
  // Payment drives invoice status. A draft can be paid on the spot (walk-in sale);
  // with no payments left it returns to Draft unless it was already sent.
  const skip = doc.type !== "INVOICE" || doc.status === "CANCELLED" || (doc.status === "DRAFT" && paid.lte(0));
  if (!skip) {
    if (paid.gt(0) && balance.lte(0)) {
      status = "PAID";
      paidAt ??= new Date();
    } else if (paid.gt(0)) {
      status = "PARTIALLY_PAID";
      paidAt = null;
    } else if (!doc.sentAt) {
      status = "DRAFT";
      paidAt = null;
    } else {
      status = doc.dueDate && doc.dueDate < new Date() ? "OVERDUE" : "SENT";
      paidAt = null;
    }
  }
  return tx.document.update({ where: { id: documentId }, data: { amountPaid: paid, balanceDue: balance, status, paidAt } });
}

export async function setDocumentStatus(id: string, status: DocumentStatus, userId?: string | null, note?: string | null) {
  return prisma.$transaction(async (tx) => {
    const doc = await tx.document.findUnique({ where: { id } });
    if (!doc) throw ApiError.notFound("Document");
    if (!statusesFor(doc.type).includes(status)) throw ApiError.badRequest(`${DOCUMENT_STATUS_LABEL[status]} isn't a valid status for this document`);
    if (!manualStatusesFor(doc.type).includes(status)) {
      throw ApiError.badRequest(
        status === "CONVERTED"
          ? "Use Convert to invoice instead"
          : `${DOCUMENT_STATUS_LABEL[status]} is set automatically from payments`,
      );
    }
    if (doc.status === "CONVERTED") throw ApiError.conflict("A converted proforma keeps its status");
    if (doc.status === status) return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude });
    if (doc.type === "INVOICE" && status === "CANCELLED" && doc.amountPaid.gt(0)) {
      throw ApiError.conflict("Void the recorded payments before cancelling this invoice");
    }

    const now = new Date();
    await tx.document.update({
      where: { id },
      data: {
        status,
        sentAt: status === "SENT" ? (doc.sentAt ?? now) : doc.sentAt,
        acceptedAt: status === "ACCEPTED" ? now : doc.acceptedAt,
        cancelledAt: status === "CANCELLED" ? now : null,
      },
    });
    if (doc.type === "INVOICE" && status === "SENT") await refreshPaymentStatus(tx, id);

    await logActivity(tx, {
      type: doc.type === "INVOICE" && status === "CANCELLED" ? "INVOICE_CANCELLED" : activityTypeFor(doc.type, "STATUS_CHANGED"),
      description: `${doc.number}: ${DOCUMENT_STATUS_LABEL[doc.status]} to ${DOCUMENT_STATUS_LABEL[status]}${note ? `. ${note}` : ""}`,
      customerId: doc.customerId,
      documentId: id,
      entityType: "document",
      entityId: id,
      metadata: { from: doc.status, to: status },
      userId,
      touchCustomer: false,
    });
    await syncDocumentStock(tx, id, userId);
    await syncCustomerStatus(tx, doc.customerId);
    return tx.document.findUniqueOrThrow({ where: { id }, include: documentInclude });
  });
}

function toInput(doc: FullDocument, type: DocumentType): DocumentData {
  return {
    type,
    customerId: doc.customerId,
    title: doc.title,
    groups: doc.groups.map((g) => ({
      name: g.name,
      notes: g.notes,
      items: g.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        sku: it.sku,
        description: it.description,
        unit: it.unit,
        kind: it.kind,
        attributes: (it.attributes ?? {}) as Record<string, string | number | boolean | null>,
        quantity: it.quantity.toString(),
        mrp: it.mrp?.toString() ?? null,
        rate: it.rate.toString(),
        discountType: it.discountType,
        discountValue: it.discountValue?.toString() ?? null,
        taxRate: it.taxRate.toString(),
      })),
    })),
    discountType: doc.discountType,
    discountValue: doc.discountValue?.toString() ?? null,
    notes: doc.notes,
    terms: doc.terms,
    paymentTerms: doc.paymentTerms,
    footer: doc.footer,
    layout: normalizeLayout(doc.layout),
    customerOverrides: {
      billingAddress: (doc.customerSnapshot as unknown as CustomerSnapshot).billingAddress ?? null,
      shippingAddress: (doc.customerSnapshot as unknown as CustomerSnapshot).shippingAddress ?? null,
    },
  };
}

/**
 * Proforma -> Invoice. Creates a NEW invoice from the proforma's snapshot
 * (prices and group names exactly as quoted) and links it back. The proforma
 * itself is only marked CONVERTED; its content is never touched.
 */
export async function convertProforma(id: string, userId?: string | null) {
  const proforma = await prisma.document.findUnique({ where: { id }, include: documentInclude });
  if (!proforma) throw ApiError.notFound("Proforma");
  if (proforma.type !== "PROFORMA") throw ApiError.badRequest("Only proformas can be converted to invoices");
  const existing = proforma.derivedDocuments.find((d) => d.type === "INVOICE");
  if (existing) throw ApiError.conflict(`Already converted to ${existing.number}`);
  if (proforma.status === "CANCELLED" || proforma.status === "REJECTED") {
    throw ApiError.conflict(`A ${DOCUMENT_STATUS_LABEL[proforma.status].toLowerCase()} proforma can't be converted. Change its status first.`);
  }

  const input = toInput(proforma, "INVOICE");
  input.issueDate = new Date();
  input.status = "DRAFT";
  input.title = proforma.title;
  const invoice = await createDocument(input, { userId, sourceDocumentId: proforma.id });

  await prisma.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { status: "CONVERTED", convertedAt: new Date() } });
    await logActivity(tx, {
      type: "PROFORMA_CONVERTED",
      description: `${proforma.number} converted to invoice ${invoice.number}`,
      customerId: proforma.customerId,
      documentId: proforma.id,
      entityType: "document",
      entityId: proforma.id,
      metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number },
      userId,
      touchCustomer: false,
    });
    await syncCustomerStatus(tx, proforma.customerId);
  });
  return prisma.document.findUniqueOrThrow({ where: { id: invoice.id }, include: documentInclude });
}

export async function duplicateDocument(id: string, type: DocumentType | undefined, userId?: string | null) {
  const doc = await prisma.document.findUnique({ where: { id }, include: documentInclude });
  if (!doc) throw ApiError.notFound("Document");
  const input = toInput(doc, type ?? doc.type);
  input.issueDate = new Date();
  input.status = "DRAFT";
  input.dueDate = undefined;
  input.validUntil = undefined;
  return createDocument(input, { userId });
}

export async function getDocument(id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: documentInclude });
  if (!doc) throw ApiError.notFound("Document");
  return doc;
}

let lastOverdueRefresh = 0;

/**
 * Flip SENT / PARTIALLY_PAID invoices past their due date to OVERDUE. Idempotent;
 * throttled to once a minute because it runs on read paths (lists, dashboard).
 */
export async function refreshOverdue(force = false) {
  if (!force && Date.now() - lastOverdueRefresh < 60_000) return;
  lastOverdueRefresh = Date.now();
  await prisma.document.updateMany({
    where: { type: "INVOICE", status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() }, balanceDue: { gt: 0 } },
    data: { status: "OVERDUE" },
  });
}

/** Map a stored document to the renderer contract (same shape the POS preview builds). */
export function toRenderable(doc: FullDocument): RenderableDocument {
  const s = (v: P.Decimal | null | undefined) => (v === null || v === undefined ? null : v.toString());
  return {
    type: doc.type,
    number: doc.number,
    status: doc.status,
    title: doc.title,
    issueDate: doc.issueDate.toISOString(),
    dueDate: doc.dueDate?.toISOString() ?? null,
    validUntil: doc.validUntil?.toISOString() ?? null,
    business: doc.businessSnapshot as unknown as BusinessSnapshot,
    customer: doc.customerSnapshot as unknown as CustomerSnapshot,
    groups: doc.groups.map((g) => ({
      name: g.name,
      notes: g.notes,
      subtotal: g.subtotal.toString(),
      items: g.items.map((it) => ({
        name: it.name,
        sku: it.sku,
        description: it.description,
        unit: it.unit,
        kind: it.kind,
        attributes: it.attributes as Record<string, unknown>,
        quantity: it.quantity.toString(),
        mrp: s(it.mrp),
        rate: it.rate.toString(),
        discountType: it.discountType,
        discountValue: s(it.discountValue),
        discountAmount: it.discountAmount.toString(),
        taxRate: it.taxRate.toString(),
        taxAmount: it.taxAmount.toString(),
        total: it.total.toString(),
      })),
    })),
    totals: {
      subtotal: doc.subtotal.toString(),
      itemDiscountTotal: doc.itemDiscountTotal.toString(),
      discountTotal: doc.discountTotal.toString(),
      discountType: doc.discountType,
      discountValue: s(doc.discountValue),
      taxableTotal: doc.taxableTotal.toString(),
      taxTotal: doc.taxTotal.toString(),
      roundOff: doc.roundOff.toString(),
      grandTotal: doc.grandTotal.toString(),
      amountPaid: doc.amountPaid.toString(),
      balanceDue: doc.balanceDue.toString(),
    },
    notes: doc.notes,
    terms: doc.terms,
    paymentTerms: doc.paymentTerms,
    footer: doc.footer,
    layout: normalizeLayout(doc.layout),
    sourceNumber: doc.sourceDocument?.number ?? null,
  };
}
