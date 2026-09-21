import { Router } from "express";
import type { Prisma as P } from "@prisma/client";
import { DOCUMENT_TYPES, documentInput, documentListQuery, documentStatusInput } from "@organo/shared";
import { z } from "zod";
import { env } from "../../config/env";
import { ApiError, created, handler, ok, pageMeta, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";
import {
  convertProforma,
  createDocument,
  duplicateDocument,
  getDocument,
  refreshOverdue,
  setDocumentStatus,
  toRenderable,
  updateDocument,
  type FullDocument,
} from "./documents.service";

export const documentsRouter = Router();

export function presentDocument(doc: FullDocument) {
  return {
    ...(serialize(doc) as object),
    publicUrl: `${env.APP_URL}/i/${doc.publicToken}`,
    renderable: toRenderable(doc),
  };
}

documentsRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(documentListQuery, req.query);
    await refreshOverdue();
    const term = q.q?.trim();
    const where: P.DocumentWhereInput = {
      ...(q.type ? { type: q.type } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.from || q.to ? { issueDate: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: "insensitive" } },
              { customer: { name: { contains: term, mode: "insensitive" } } },
              { customer: { phone: { contains: term.replace(/\D/g, "") || term } } },
              { title: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const orderBy: P.DocumentOrderByWithRelationInput[] =
      q.sort === "oldest"
        ? [{ issueDate: "asc" }]
        : q.sort === "amount"
          ? [{ grandTotal: "desc" }]
          : q.sort === "due"
            ? [{ dueDate: { sort: "asc", nulls: "last" } }]
            : [{ issueDate: "desc" }, { number: "desc" }];
    const [total, rows, sums] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: {
          id: true, type: true, number: true, status: true, title: true, issueDate: true, dueDate: true, validUntil: true,
          grandTotal: true, amountPaid: true, balanceDue: true, sentAt: true, viewedAt: true, publicToken: true,
          customer: { select: { id: true, name: true, phone: true, email: true } },
          sourceDocument: { select: { id: true, number: true } },
          derivedDocuments: { select: { id: true, number: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.document.aggregate({ where: { ...where, status: { not: "CANCELLED" } }, _sum: { grandTotal: true, balanceDue: true, amountPaid: true } }),
    ]);
    ok(res, serialize(rows), {
      ...pageMeta(q.page, q.pageSize, total),
      sums: {
        grandTotal: sums._sum.grandTotal?.toString() ?? "0",
        balanceDue: sums._sum.balanceDue?.toString() ?? "0",
        amountPaid: sums._sum.amountPaid?.toString() ?? "0",
      },
    });
  }),
);

documentsRouter.get(
  "/:id",
  handler(async (req, res) => ok(res, presentDocument(await getDocument(param(req, "id"))))),
);

documentsRouter.post(
  "/",
  requirePermission("documents:write"),
  handler(async (req, res) => {
    const data = parse(documentInput, req.body);
    created(res, presentDocument(await createDocument(data, { userId: req.user?.id })));
  }),
);

documentsRouter.put(
  "/:id",
  requirePermission("documents:write"),
  handler(async (req, res) => {
    const data = parse(documentInput, req.body);
    ok(res, presentDocument(await updateDocument(param(req, "id"), data, req.user?.id)));
  }),
);

documentsRouter.post(
  "/:id/status",
  requirePermission("documents:write"),
  handler(async (req, res) => {
    const { status, note } = parse(documentStatusInput, req.body);
    ok(res, presentDocument(await setDocumentStatus(param(req, "id"), status, req.user?.id, note)));
  }),
);

documentsRouter.post(
  "/:id/convert",
  requirePermission("documents:write"),
  handler(async (req, res) => created(res, presentDocument(await convertProforma(param(req, "id"), req.user?.id)))),
);

documentsRouter.post(
  "/:id/duplicate",
  requirePermission("documents:write"),
  handler(async (req, res) => {
    const { type } = parse(z.object({ type: z.enum(DOCUMENT_TYPES).optional() }), req.body ?? {});
    created(res, presentDocument(await duplicateDocument(param(req, "id"), type, req.user?.id)));
  }),
);

documentsRouter.get(
  "/:id/activities",
  handler(async (req, res) => {
    const id = param(req, "id");
    if (!(await prisma.document.findUnique({ where: { id }, select: { id: true } }))) throw ApiError.notFound("Document");
    const rows = await prisma.activity.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true } } },
    });
    ok(res, serialize(rows));
  }),
);
