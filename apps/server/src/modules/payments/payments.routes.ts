import { Router } from "express";
import type { Prisma as P } from "@prisma/client";
import { formatINR, PAYMENT_METHOD_LABEL, paginationQuery, paymentInput } from "@organo/shared";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError, created, handler, ok, pageMeta, param, parse } from "../../lib/http";
import { Prisma, prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";
import { syncCustomerStatus } from "../customers/customer-status";
import { refreshPaymentStatus } from "../documents/documents.service";

export const paymentsRouter = Router();

paymentsRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(paginationQuery.extend({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), customerId: z.string().optional() }), req.query);
    const where: P.PaymentWhereInput = {
      voidedAt: null,
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.from || q.to ? { paidAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
    const [total, rows, sum] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { paidAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { document: { select: { id: true, number: true } }, customer: { select: { id: true, name: true } }, recordedBy: { select: { name: true } } },
      }),
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
    ]);
    ok(res, serialize(rows), { ...pageMeta(q.page, q.pageSize, total), sum: sum._sum.amount?.toString() ?? "0" });
  }),
);

/** Record a payment against an invoice. Status (partially paid / paid) follows from the recorded amounts. */
paymentsRouter.post(
  "/documents/:documentId",
  requirePermission("payments:write"),
  handler(async (req, res) => {
    const documentId = param(req, "documentId");
    const data = parse(paymentInput, req.body);
    const payment = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.findUnique({ where: { id: documentId } });
      if (!doc) throw ApiError.notFound("Invoice");
      if (doc.type !== "INVOICE") throw ApiError.badRequest("Payments are recorded against invoices. Convert the proforma first.");
      if (doc.status === "CANCELLED") throw ApiError.conflict("This invoice is cancelled");
      const amount = new Prisma.Decimal(data.amount);
      if (amount.gt(doc.balanceDue)) {
        throw ApiError.badRequest(`Amount is more than the balance due (${formatINR(doc.balanceDue.toString())})`);
      }
      const p = await tx.payment.create({
        data: { ...data, documentId, customerId: doc.customerId, recordedById: req.user?.id },
      });
      const updated = await refreshPaymentStatus(tx, documentId);
      await logActivity(tx, {
        type: "PAYMENT_RECEIVED",
        description: `${formatINR(data.amount)} received by ${PAYMENT_METHOD_LABEL[data.method]} for ${doc.number}${data.reference ? ` (ref ${data.reference})` : ""}. Balance ${formatINR(updated.balanceDue.toString())}`,
        customerId: doc.customerId,
        documentId,
        entityType: "payment",
        entityId: p.id,
        metadata: { amount: data.amount, method: data.method, balance: updated.balanceDue.toString() },
        userId: req.user?.id,
      });
      await syncCustomerStatus(tx, doc.customerId);
      return p;
    });
    created(res, serialize(payment));
  }),
);

paymentsRouter.post(
  "/:id/void",
  requirePermission("payments:write"),
  handler(async (req, res) => {
    const id = param(req, "id");
    const { reason } = parse(z.object({ reason: z.string().trim().min(1, "Give a reason").max(300) }), req.body);
    const p = await prisma.$transaction(async (tx) => {
      const pay = await tx.payment.findUnique({ where: { id }, include: { document: true } });
      if (!pay) throw ApiError.notFound("Payment");
      if (pay.voidedAt) throw ApiError.conflict("Payment already voided");
      const v = await tx.payment.update({ where: { id }, data: { voidedAt: new Date(), notes: [pay.notes, `Voided: ${reason}`].filter(Boolean).join("\n") } });
      await refreshPaymentStatus(tx, pay.documentId);
      await logActivity(tx, {
        type: "PAYMENT_VOIDED",
        description: `Payment of ${formatINR(pay.amount.toString())} on ${pay.document.number} voided: ${reason}`,
        customerId: pay.customerId,
        documentId: pay.documentId,
        entityType: "payment",
        entityId: id,
        userId: req.user?.id,
        touchCustomer: false,
      });
      await syncCustomerStatus(tx, pay.customerId);
      return v;
    });
    ok(res, serialize(p));
  }),
);
