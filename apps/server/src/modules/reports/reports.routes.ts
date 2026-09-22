import { Router } from "express";
import type { Prisma as P } from "@prisma/client";
import { DOCUMENT_STATUSES, FOLLOWUP_STATUSES } from "@organo/shared";
import { z } from "zod";
import { ApiError, handler, ok, param, parse } from "../../lib/http";
import { Prisma, prisma } from "../../lib/prisma";
import { requirePermission } from "../../middleware/auth";

export const reportsRouter = Router();
reportsRouter.use(requirePermission("reports:read"));

const D = Prisma.Decimal;
const s = (v: P.Decimal | null | undefined) => (v ?? new D(0)).toString();
const MAX_ROWS = 2000;

const filters = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  customerId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.string().optional(),
});
type Filters = z.infer<typeof filters>;

function range(f: Filters) {
  // `to` is a calendar day: include the whole day.
  const to = f.to ? new Date(f.to.getTime() + 86_400_000 - 1) : undefined;
  return f.from || to ? { ...(f.from ? { gte: f.from } : {}), ...(to ? { lte: to } : {}) } : undefined;
}

async function documentsReport(type: "INVOICE" | "PROFORMA", f: Filters, issuedOnly: boolean) {
  const status = f.status && (DOCUMENT_STATUSES as readonly string[]).includes(f.status) ? (f.status as P.DocumentWhereInput["status"]) : undefined;
  const where: P.DocumentWhereInput = {
    type,
    ...(issuedOnly ? { status: { notIn: ["DRAFT", "CANCELLED"] } } : {}),
    ...(status ? { status } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(range(f) ? { issueDate: range(f) } : {}),
    ...(f.categoryId ? { items: { some: { product: { categoryId: f.categoryId } } } } : {}),
  };
  const rows = await prisma.document.findMany({
    where,
    orderBy: { issueDate: "desc" },
    take: MAX_ROWS,
    select: { id: true, number: true, status: true, issueDate: true, dueDate: true, grandTotal: true, amountPaid: true, balanceDue: true, taxTotal: true, customer: { select: { id: true, name: true } } },
  });
  const sum = (k: "grandTotal" | "amountPaid" | "balanceDue" | "taxTotal") => rows.reduce((a, r) => a.plus(r[k]), new D(0)).toString();
  return {
    columns: [
      { key: "issueDate", label: "Date", type: "date" },
      { key: "number", label: "Number", type: "link" },
      { key: "customer", label: "Customer" },
      { key: "status", label: "Status", type: "status" },
      { key: "grandTotal", label: "Total", type: "money" },
      ...(type === "INVOICE"
        ? [
            { key: "taxTotal", label: "GST", type: "money" },
            { key: "amountPaid", label: "Paid", type: "money" },
            { key: "balanceDue", label: "Balance", type: "money" },
          ]
        : []),
    ],
    rows: rows.map((r) => ({
      id: r.id,
      href: `/${type === "INVOICE" ? "invoices" : "proformas"}/${r.id}`,
      issueDate: r.issueDate.toISOString(),
      number: r.number,
      customer: r.customer.name,
      status: r.status,
      grandTotal: s(r.grandTotal),
      taxTotal: s(r.taxTotal),
      amountPaid: s(r.amountPaid),
      balanceDue: s(r.balanceDue),
    })),
    summary: [
      { label: type === "INVOICE" ? "Invoices" : "Proformas", value: String(rows.length), type: "count" },
      { label: "Total value", value: sum("grandTotal"), type: "money" },
      ...(type === "INVOICE"
        ? [
            { label: "Collected", value: sum("amountPaid"), type: "money" },
            { label: "Outstanding", value: sum("balanceDue"), type: "money" },
          ]
        : [{ label: "Converted", value: String(rows.filter((r) => r.status === "CONVERTED").length), type: "count" }]),
    ],
    truncated: rows.length === MAX_ROWS,
  };
}

const REPORTS: Record<string, (f: Filters) => Promise<unknown>> = {
  sales: (f) => documentsReport("INVOICE", f, true),
  invoices: (f) => documentsReport("INVOICE", f, false),
  proformas: (f) => documentsReport("PROFORMA", f, false),

  customers: async (f) => {
    const docRange = range(f);
    const rows = await prisma.$queryRaw<
      Array<{ id: string; name: string; phone: string | null; status: string; proformas: bigint; invoices: bigint; quoted: P.Decimal | null; invoiced: P.Decimal | null; paid: P.Decimal | null; outstanding: P.Decimal | null; lastContactAt: Date | null }>
    >`
      SELECT c.id, c.name, c.phone, c.status::text AS status, c."lastContactAt",
        COUNT(d.id) FILTER (WHERE d.type = 'PROFORMA') AS proformas,
        COUNT(d.id) FILTER (WHERE d.type = 'INVOICE' AND d.status NOT IN ('DRAFT','CANCELLED')) AS invoices,
        SUM(d."grandTotal") FILTER (WHERE d.type = 'PROFORMA') AS quoted,
        SUM(d."grandTotal") FILTER (WHERE d.type = 'INVOICE' AND d.status NOT IN ('DRAFT','CANCELLED')) AS invoiced,
        SUM(d."amountPaid") FILTER (WHERE d.type = 'INVOICE') AS paid,
        SUM(d."balanceDue") FILTER (WHERE d.type = 'INVOICE' AND d.status NOT IN ('DRAFT','CANCELLED')) AS outstanding
      FROM "Customer" c
      LEFT JOIN "Document" d ON d."customerId" = c.id
        ${docRange?.gte ? Prisma.sql`AND d."issueDate" >= ${docRange.gte}` : Prisma.empty}
        ${docRange?.lte ? Prisma.sql`AND d."issueDate" <= ${docRange.lte}` : Prisma.empty}
      WHERE c."archivedAt" IS NULL ${f.customerId ? Prisma.sql`AND c.id = ${f.customerId}` : Prisma.empty}
      GROUP BY c.id ORDER BY COALESCE(SUM(d."grandTotal") FILTER (WHERE d.type = 'INVOICE' AND d.status NOT IN ('DRAFT','CANCELLED')), 0) DESC, c.name
      LIMIT ${MAX_ROWS}`;
    return {
      columns: [
        { key: "name", label: "Customer", type: "link" },
        { key: "status", label: "Stage", type: "customerStatus" },
        { key: "proformas", label: "Proformas", type: "count" },
        { key: "quoted", label: "Quoted", type: "money" },
        { key: "invoices", label: "Invoices", type: "count" },
        { key: "invoiced", label: "Invoiced", type: "money" },
        { key: "paid", label: "Paid", type: "money" },
        { key: "outstanding", label: "Outstanding", type: "money" },
        { key: "lastContactAt", label: "Last contact", type: "date" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        href: `/customers/${r.id}`,
        name: r.name,
        status: r.status,
        proformas: Number(r.proformas),
        quoted: s(r.quoted),
        invoices: Number(r.invoices),
        invoiced: s(r.invoiced),
        paid: s(r.paid),
        outstanding: s(r.outstanding),
        lastContactAt: r.lastContactAt?.toISOString() ?? null,
      })),
      summary: [
        { label: "Customers", value: String(rows.length), type: "count" },
        { label: "Invoiced", value: rows.reduce((a, r) => a.plus(r.invoiced ?? 0), new D(0)).toString(), type: "money" },
        { label: "Outstanding", value: rows.reduce((a, r) => a.plus(r.outstanding ?? 0), new D(0)).toString(), type: "money" },
      ],
    };
  },

  products: async (f) => {
    const r = range(f);
    const basis = f.status === "QUOTED" ? Prisma.sql`d.type = 'PROFORMA'` : Prisma.sql`d.type = 'INVOICE' AND d.status NOT IN ('DRAFT','CANCELLED')`;
    const rows = await prisma.$queryRaw<Array<{ productId: string | null; name: string; sku: string | null; category: string | null; quantity: P.Decimal; revenue: P.Decimal; documents: bigint }>>`
      SELECT i."productId", COALESCE(p.name, i.name) AS name, COALESCE(p.sku, i.sku) AS sku, cat.name AS category,
        SUM(i.quantity) AS quantity, SUM(i.total) AS revenue, COUNT(DISTINCT d.id) AS documents
      FROM "DocumentItem" i
      JOIN "Document" d ON d.id = i."documentId"
      LEFT JOIN "Product" p ON p.id = i."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      WHERE ${basis}
        ${r?.gte ? Prisma.sql`AND d."issueDate" >= ${r.gte}` : Prisma.empty}
        ${r?.lte ? Prisma.sql`AND d."issueDate" <= ${r.lte}` : Prisma.empty}
        ${f.customerId ? Prisma.sql`AND d."customerId" = ${f.customerId}` : Prisma.empty}
        ${f.categoryId ? Prisma.sql`AND p."categoryId" = ${f.categoryId}` : Prisma.empty}
      GROUP BY i."productId", COALESCE(p.name, i.name), COALESCE(p.sku, i.sku), cat.name
      ORDER BY revenue DESC LIMIT ${MAX_ROWS}`;
    return {
      columns: [
        { key: "name", label: "Product", type: "link" },
        { key: "sku", label: "SKU", type: "mono" },
        { key: "category", label: "Category" },
        { key: "quantity", label: "Quantity", type: "qty" },
        { key: "documents", label: "Documents", type: "count" },
        { key: "revenue", label: f.status === "QUOTED" ? "Quoted value" : "Revenue", type: "money" },
      ],
      rows: rows.map((x) => ({
        id: x.productId ?? x.name,
        href: x.productId ? `/inventory/${x.productId}` : undefined,
        name: x.name,
        sku: x.sku,
        category: x.category ?? "Custom lines",
        quantity: x.quantity.toString(),
        documents: Number(x.documents),
        revenue: s(x.revenue),
      })),
      summary: [
        { label: "Products", value: String(rows.length), type: "count" },
        { label: f.status === "QUOTED" ? "Quoted value" : "Revenue", value: rows.reduce((a, x) => a.plus(x.revenue), new D(0)).toString(), type: "money" },
      ],
      options: { statusChoices: [{ value: "INVOICED", label: "Invoiced" }, { value: "QUOTED", label: "Quoted in proformas" }] },
    };
  },

  outstanding: async (f) => {
    const rows = await prisma.document.findMany({
      where: { type: "INVOICE", status: { notIn: ["DRAFT", "CANCELLED", "PAID"] }, balanceDue: { gt: 0 }, ...(f.customerId ? { customerId: f.customerId } : {}) },
      orderBy: { dueDate: "asc" },
      take: MAX_ROWS,
      select: { id: true, number: true, status: true, issueDate: true, dueDate: true, grandTotal: true, balanceDue: true, customer: { select: { name: true, phone: true } } },
    });
    const now = Date.now();
    const bucketOf = (due: Date | null) => {
      const days = due ? Math.floor((now - due.getTime()) / 86_400_000) : -1;
      return days < 0 ? "Not due" : days <= 30 ? "1-30 days" : days <= 60 ? "31-60 days" : days <= 90 ? "61-90 days" : "90+ days";
    };
    const buckets = new Map<string, P.Decimal>();
    for (const r of rows) buckets.set(bucketOf(r.dueDate), (buckets.get(bucketOf(r.dueDate)) ?? new D(0)).plus(r.balanceDue));
    return {
      columns: [
        { key: "number", label: "Invoice", type: "link" },
        { key: "customer", label: "Customer" },
        { key: "dueDate", label: "Due", type: "date" },
        { key: "age", label: "Overdue by" },
        { key: "grandTotal", label: "Total", type: "money" },
        { key: "balanceDue", label: "Balance", type: "money" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        href: `/invoices/${r.id}`,
        number: r.number,
        customer: r.customer.name,
        dueDate: r.dueDate?.toISOString() ?? null,
        age: bucketOf(r.dueDate),
        grandTotal: s(r.grandTotal),
        balanceDue: s(r.balanceDue),
      })),
      summary: ["Not due", "1-30 days", "31-60 days", "61-90 days", "90+ days"].map((b) => ({ label: b, value: s(buckets.get(b)), type: "money" })),
    };
  },

  payments: async (f) => {
    const rows = await prisma.payment.findMany({
      where: { voidedAt: null, ...(range(f) ? { paidAt: range(f) } : {}), ...(f.customerId ? { customerId: f.customerId } : {}) },
      orderBy: { paidAt: "desc" },
      take: MAX_ROWS,
      include: { document: { select: { id: true, number: true } }, customer: { select: { name: true } }, recordedBy: { select: { name: true } } },
    });
    const byMethod = new Map<string, P.Decimal>();
    for (const p of rows) byMethod.set(p.method, (byMethod.get(p.method) ?? new D(0)).plus(p.amount));
    return {
      columns: [
        { key: "paidAt", label: "Date", type: "date" },
        { key: "number", label: "Invoice", type: "link" },
        { key: "customer", label: "Customer" },
        { key: "method", label: "Method", type: "paymentMethod" },
        { key: "reference", label: "Reference" },
        { key: "amount", label: "Amount", type: "money" },
      ],
      rows: rows.map((p) => ({
        id: p.id,
        href: `/invoices/${p.document.id}`,
        paidAt: p.paidAt.toISOString(),
        number: p.document.number,
        customer: p.customer.name,
        method: p.method,
        reference: p.reference,
        amount: s(p.amount),
      })),
      summary: [
        { label: "Collected", value: rows.reduce((a, p) => a.plus(p.amount), new D(0)).toString(), type: "money" },
        ...[...byMethod.entries()].map(([m, v]) => ({ label: m, value: v.toString(), type: "money", method: true })),
      ],
    };
  },

  followups: async (f) => {
    const status = f.status && (FOLLOWUP_STATUSES as readonly string[]).includes(f.status) ? (f.status as P.FollowUpWhereInput["status"]) : undefined;
    const rows = await prisma.followUp.findMany({
      where: { ...(range(f) ? { dueAt: range(f) } : {}), ...(status ? { status } : {}), ...(f.customerId ? { customerId: f.customerId } : {}) },
      orderBy: { dueAt: "desc" },
      take: MAX_ROWS,
      include: { customer: { select: { id: true, name: true } }, assignedTo: { select: { name: true } }, document: { select: { number: true } } },
    });
    const count = (st: string) => rows.filter((r) => r.status === st).length;
    return {
      columns: [
        { key: "dueAt", label: "Due", type: "date" },
        { key: "customer", label: "Customer", type: "link" },
        { key: "title", label: "Task" },
        { key: "channel", label: "Channel" },
        { key: "status", label: "Status", type: "followupStatus" },
        { key: "outcome", label: "Outcome" },
        { key: "assignedTo", label: "Owner" },
      ],
      rows: rows.map((r) => ({
        id: r.id,
        href: `/customers/${r.customer.id}`,
        dueAt: r.dueAt.toISOString(),
        customer: r.customer.name,
        title: r.title + (r.document ? ` (${r.document.number})` : ""),
        channel: r.channel,
        status: r.status,
        outcome: r.outcome,
        assignedTo: r.assignedTo?.name ?? null,
      })),
      summary: [
        { label: "Follow-ups", value: String(rows.length), type: "count" },
        { label: "Completed", value: String(count("COMPLETED")), type: "count" },
        { label: "Open", value: String(count("PENDING") + count("SCHEDULED")), type: "count" },
        { label: "Cancelled", value: String(count("CANCELLED")), type: "count" },
      ],
    };
  },
};

reportsRouter.get(
  "/:type",
  handler(async (req, res) => {
    const run = REPORTS[param(req, "type")];
    if (!run) throw ApiError.notFound("Report");
    ok(res, await run(parse(filters, req.query)));
  }),
);
