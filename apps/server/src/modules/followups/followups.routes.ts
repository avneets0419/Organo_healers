import { Router } from "express";
import type { Prisma as P } from "@prisma/client";
import { FOLLOWUP_CHANNEL_LABEL, followUpInput, followUpListQuery, followUpUpdateInput, formatDisplayDate } from "@organo/shared";
import { logActivity } from "../../lib/activity";
import { ApiError, created, handler, ok, pageMeta, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";

export const followupsRouter = Router();

const OPEN = ["PENDING", "SCHEDULED"] as const;

function istDayBounds(now = new Date()) {
  const offset = 5.5 * 3600_000;
  const local = new Date(now.getTime() + offset);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

const include = {
  customer: { select: { id: true, name: true, phone: true, email: true, status: true } },
  document: { select: { id: true, number: true, type: true, status: true, grandTotal: true, publicToken: true } },
  assignedTo: { select: { id: true, name: true } },
  template: { select: { id: true, key: true, name: true } },
} satisfies P.FollowUpInclude;

followupsRouter.get(
  "/counts/sidebar",
  handler(async (_req, res) => {
    const { end } = istDayBounds();
    const followupsDue = await prisma.followUp.count({ where: { status: { in: [...OPEN] }, dueAt: { lt: end } } });
    ok(res, { followupsDue });
  }),
);

followupsRouter.get(
  "/summary",
  handler(async (_req, res) => {
    const { start, end } = istDayBounds();
    const [overdue, today, upcoming, completedWeek] = await Promise.all([
      prisma.followUp.count({ where: { status: { in: [...OPEN] }, dueAt: { lt: start } } }),
      prisma.followUp.count({ where: { status: { in: [...OPEN] }, dueAt: { gte: start, lt: end } } }),
      prisma.followUp.count({ where: { status: { in: [...OPEN] }, dueAt: { gte: end } } }),
      prisma.followUp.count({ where: { status: "COMPLETED", completedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
    ]);
    ok(res, { overdue, today, upcoming, completedWeek });
  }),
);

followupsRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(followUpListQuery, req.query);
    const { start, end } = istDayBounds();
    const where: P.FollowUpWhereInput = {
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.assignedToId ? { assignedToId: q.assignedToId } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" } }, { customer: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
    };
    if (q.status === "OPEN") where.status = { in: [...OPEN] };
    else if (q.status) where.status = q.status as P.EnumFollowUpStatusFilter["equals"];
    if (q.scope === "today") Object.assign(where, { status: { in: [...OPEN] }, dueAt: { gte: start, lt: end } });
    if (q.scope === "overdue") Object.assign(where, { status: { in: [...OPEN] }, dueAt: { lt: start } });
    if (q.scope === "upcoming") Object.assign(where, { status: { in: [...OPEN] }, dueAt: { gte: end } });
    if (q.scope === "completed") Object.assign(where, { status: "COMPLETED" });
    const [total, rows] = await Promise.all([
      prisma.followUp.count({ where }),
      prisma.followUp.findMany({
        where,
        include,
        orderBy: q.scope === "completed" ? [{ completedAt: "desc" }] : [{ dueAt: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    ok(res, serialize(rows), pageMeta(q.page, q.pageSize, total));
  }),
);

followupsRouter.post(
  "/",
  requirePermission("customers:write"),
  handler(async (req, res) => {
    const data = parse(followUpInput, req.body);
    const f = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: data.customerId }, select: { id: true } });
      if (!customer) throw ApiError.notFound("Customer");
      const fu = await tx.followUp.create({ data: { ...data, assignedToId: data.assignedToId ?? req.user?.id, createdById: req.user?.id }, include });
      await logActivity(tx, {
        type: "FOLLOWUP_CREATED",
        description: `${FOLLOWUP_CHANNEL_LABEL[fu.channel]} follow-up for ${formatDisplayDate(fu.dueAt)}: ${fu.title}`,
        customerId: fu.customerId,
        documentId: fu.documentId,
        entityType: "followup",
        entityId: fu.id,
        metadata: { dueAt: fu.dueAt.toISOString(), priority: fu.priority },
        userId: req.user?.id,
        touchCustomer: false,
      });
      return fu;
    });
    created(res, serialize(f));
  }),
);

followupsRouter.patch(
  "/:id",
  requirePermission("customers:write"),
  handler(async (req, res) => {
    const id = param(req, "id");
    const data = parse(followUpUpdateInput, req.body);
    const before = await prisma.followUp.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound("Follow-up");
    const completing = data.status === "COMPLETED" && before.status !== "COMPLETED";
    const f = await prisma.$transaction(async (tx) => {
      const fu = await tx.followUp.update({
        where: { id },
        data: { ...data, completedAt: completing ? new Date() : data.status && data.status !== "COMPLETED" ? null : undefined },
        include,
      });
      await logActivity(tx, {
        type: completing ? "FOLLOWUP_COMPLETED" : "FOLLOWUP_UPDATED",
        description: completing ? `Completed: ${fu.title}${data.outcome ? `. ${data.outcome}` : ""}` : `Follow-up updated: ${fu.title}`,
        customerId: fu.customerId,
        documentId: fu.documentId,
        entityType: "followup",
        entityId: fu.id,
        metadata: { changes: Object.keys(data) },
        userId: req.user?.id,
      });
      return fu;
    });
    ok(res, serialize(f));
  }),
);
