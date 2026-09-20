import { Router } from "express";
import { Prisma, type Prisma as P } from "@prisma/client";
import { CUSTOMER_STATUSES, customerInput, customerUpdateInput, paginationQuery } from "@organo/shared";
import { z } from "zod";
import { ApiError, created, handler, ok, pageMeta, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";
import { createCustomer, customerSearchWhere, updateCustomer } from "./customers.service";

const prismaDecimal = Prisma.Decimal;

export const customersRouter = Router();

const listQuery = paginationQuery.extend({
  status: z.enum(CUSTOMER_STATUSES).optional(),
  filter: z
    .enum(["all", "leads", "proforma_sent", "proforma_accepted", "invoice_created", "invoice_paid", "overdue", "no_followup"])
    .default("all"),
  sort: z.enum(["recent", "name", "business", "contact"]).default("recent"),
});

function filterWhere(filter: z.infer<typeof listQuery>["filter"]): P.CustomerWhereInput {
  switch (filter) {
    case "leads":
      return { status: { in: ["LEAD", "QUOTED"] } };
    case "proforma_sent":
      return { documents: { some: { type: "PROFORMA", status: { in: ["SENT", "VIEWED", "NEGOTIATING"] } } } };
    case "proforma_accepted":
      return { documents: { some: { type: "PROFORMA", status: { in: ["ACCEPTED", "CONVERTED"] } } } };
    case "invoice_created":
      return { documents: { some: { type: "INVOICE", status: { not: "CANCELLED" } } } };
    case "invoice_paid":
      return { documents: { some: { type: "INVOICE", status: "PAID" } } };
    case "overdue":
      return { documents: { some: { type: "INVOICE", status: "OVERDUE" } } };
    case "no_followup":
      return { followUps: { none: { status: { in: ["PENDING", "SCHEDULED"] } } }, status: { notIn: ["COMPLETED", "INACTIVE", "PAID"] } };
    default:
      return {};
  }
}

customersRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(listQuery, req.query);
    const where: P.CustomerWhereInput = {
      archivedAt: null,
      ...customerSearchWhere(q.q),
      ...(q.status ? { status: q.status } : {}),
      ...filterWhere(q.filter),
    };
    const orderBy: P.CustomerOrderByWithRelationInput =
      q.sort === "name" ? { name: "asc" } : q.sort === "contact" ? { lastContactAt: { sort: "desc", nulls: "last" } } : { updatedAt: "desc" };
    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          documents: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { issueDate: "desc" },
            select: { id: true, type: true, number: true, status: true, grandTotal: true, amountPaid: true, balanceDue: true, issueDate: true },
          },
          followUps: {
            where: { status: { in: ["PENDING", "SCHEDULED"] } },
            orderBy: { dueAt: "asc" },
            take: 1,
            select: { id: true, title: true, dueAt: true, priority: true },
          },
        },
      }),
    ]);
    const data = rows.map(({ documents, followUps, ...c }) => {
      const invoices = documents.filter((d) => d.type === "INVOICE");
      const proformas = documents.filter((d) => d.type === "PROFORMA");
      const totalBusiness = invoices.reduce((s, d) => s.plus(d.grandTotal), new prismaDecimal(0));
      const outstanding = invoices.reduce((s, d) => s.plus(d.balanceDue), new prismaDecimal(0));
      return {
        ...(serialize(c) as object),
        totalBusiness: totalBusiness.toString(),
        outstanding: outstanding.toString(),
        lastInvoice: serialize(invoices[0] ?? null),
        lastProforma: serialize(proformas[0] ?? null),
        nextFollowUp: serialize(followUps[0] ?? null),
      };
    });
    ok(res, data, pageMeta(q.page, q.pageSize, total));
  }),
);


/** Fast typeahead for the POS: phone / email / name. */
customersRouter.get(
  "/lookup",
  handler(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(80) }), req.query);
    const rows = await prisma.customer.findMany({
      where: { archivedAt: null, ...customerSearchWhere(q) },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, name: true, companyName: true, phone: true, email: true, gstin: true, billingAddress: true, shippingAddress: true, status: true },
    });
    ok(res, rows);
  }),
);

customersRouter.get(
  "/:id",
  handler(async (req, res) => {
    const id = param(req, "id");
    const c = await prisma.customer.findUnique({
      where: { id },
      include: { contacts: true },
    });
    if (!c) throw ApiError.notFound("Customer");
    const [docs, payments, openFollowUps] = await Promise.all([
      prisma.document.findMany({
        where: { customerId: id },
        orderBy: { issueDate: "desc" },
        select: {
          id: true, type: true, number: true, status: true, grandTotal: true, amountPaid: true, balanceDue: true,
          issueDate: true, dueDate: true, validUntil: true, sentAt: true, viewedAt: true, sourceDocumentId: true,
          derivedDocuments: { select: { id: true, number: true } },
        },
      }),
      prisma.payment.findMany({ where: { customerId: id, voidedAt: null }, orderBy: { paidAt: "desc" }, include: { document: { select: { number: true } } } }),
      prisma.followUp.count({ where: { customerId: id, status: { in: ["PENDING", "SCHEDULED"] } } }),
    ]);
    const live = docs.filter((d) => d.status !== "CANCELLED");
    const invoices = live.filter((d) => d.type === "INVOICE");
    const proformas = docs.filter((d) => d.type === "PROFORMA");
    const converted = proformas.filter((p) => p.status === "CONVERTED" || p.derivedDocuments.length).length;
    const sum = (xs: typeof docs, k: "grandTotal" | "balanceDue" | "amountPaid") => xs.reduce((s, d) => s.plus(d[k]), new prismaDecimal(0)).toString();
    ok(res, {
      ...(serialize(c) as object),
      documents: serialize(docs),
      payments: serialize(payments),
      metrics: {
        totalRevenue: sum(invoices, "grandTotal"),
        paid: sum(invoices, "amountPaid"),
        outstanding: sum(invoices, "balanceDue"),
        invoiceCount: invoices.length,
        proformaCount: proformas.length,
        proformaValue: sum(proformas, "grandTotal"),
        conversionRate: proformas.length ? converted / proformas.length : null,
        lastContactAt: c.lastContactAt?.toISOString() ?? null,
        openFollowUps,
      },
    });
  }),
);

customersRouter.post(
  "/",
  requirePermission("customers:write"),
  handler(async (req, res) => {
    const c = await createCustomer(parse(customerInput, req.body), req.user?.id);
    created(res, serialize(c));
  }),
);

customersRouter.patch(
  "/:id",
  requirePermission("customers:write"),
  handler(async (req, res) => {
    const c = await updateCustomer(param(req, "id"), parse(customerUpdateInput, req.body), req.user?.id);
    ok(res, serialize(c));
  }),
);

customersRouter.post(
  "/:id/archive",
  requirePermission("customers:write"),
  handler(async (req, res) => {
    const c = await prisma.customer.update({ where: { id: param(req, "id") }, data: { archivedAt: new Date(), status: "INACTIVE" } });
    ok(res, serialize(c));
  }),
);
