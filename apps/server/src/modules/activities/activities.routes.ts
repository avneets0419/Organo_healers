import { Router } from "express";
import type { ActivityType, Prisma as P } from "@prisma/client";
import { ACTIVITY_TYPES, activityInput, paginationQuery } from "@organo/shared";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError, created, handler, ok, pageMeta, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";

export const activitiesRouter = Router();

activitiesRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(
      paginationQuery.extend({
        customerId: z.string().optional(),
        documentId: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        type: z.enum(ACTIVITY_TYPES).optional(),
      }),
      req.query,
    );
    const where: P.ActivityWhereInput = {
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.documentId ? { documentId: q.documentId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.type ? { type: q.type } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { id: true, name: true } }, document: { select: { id: true, number: true, type: true } }, customer: { select: { id: true, name: true } } },
      }),
    ]);
    ok(res, serialize(rows), pageMeta(q.page, q.pageSize, total));
  }),
);

/** Manually logged contact: call, meeting, note, WhatsApp sent (user-confirmed), payment reminder. */
activitiesRouter.post(
  "/",
  requirePermission("customers:write"),
  handler(async (req, res) => {
    const data = parse(activityInput, req.body);
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true } });
    if (!customer) throw ApiError.notFound("Customer");
    const a = await logActivity(prisma, {
      type: data.type as ActivityType,
      description: data.description,
      customerId: data.customerId,
      documentId: data.documentId,
      entityType: "customer",
      entityId: data.customerId,
      metadata: { manual: true },
      userId: req.user?.id,
    });
    created(res, serialize(a));
  }),
);
