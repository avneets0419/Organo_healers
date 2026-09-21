import { Router } from "express";
import type { MovementType, Prisma as P } from "@prisma/client";
import { MOVEMENT_TYPE_LABEL, MOVEMENT_TYPES, paginationQuery, stockMovementInput } from "@organo/shared";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError, created, handler, ok, pageMeta, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";
import { recordMovement, signedQuantity } from "./stock.service";

export const inventoryRouter = Router();

inventoryRouter.get(
  "/movements",
  handler(async (req, res) => {
    const q = parse(
      paginationQuery.extend({ productId: z.string().optional(), type: z.enum(MOVEMENT_TYPES).optional() }),
      req.query,
    );
    const where: P.InventoryMovementWhereInput = {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.q ? { product: { name: { contains: q.q, mode: "insensitive" } } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          product: { select: { id: true, name: true, sku: true, unit: true } },
          user: { select: { name: true } },
          document: { select: { id: true, number: true, type: true } },
        },
      }),
    ]);
    ok(res, serialize(rows), pageMeta(q.page, q.pageSize, total));
  }),
);

inventoryRouter.post(
  "/movements",
  requirePermission("inventory:write"),
  handler(async (req, res) => {
    const data = parse(stockMovementInput, req.body);
    const type = data.type as MovementType;
    const qty = signedQuantity(type, data.quantity);
    const movement = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: data.productId } });
      if (!product) throw ApiError.notFound("Product");
      if (!product.trackStock) throw ApiError.badRequest("Stock isn't tracked for this product");
      const m = await recordMovement(tx, { productId: product.id, type, quantity: qty, unitCost: data.unitCost, reason: data.reason, userId: req.user?.id });
      await logActivity(tx, {
        type: "STOCK_CHANGED",
        description: `${product.name}: ${MOVEMENT_TYPE_LABEL[type]} ${qty.gt(0) ? "+" : ""}${qty.toString()} (now ${m!.balanceAfter.toString()})${data.reason ? `. ${data.reason}` : ""}`,
        entityType: "product",
        entityId: product.id,
        metadata: { movementId: m!.id, type, quantity: qty.toString() },
        userId: req.user?.id,
      });
      return m;
    });
    created(res, serialize(movement));
  }),
);
