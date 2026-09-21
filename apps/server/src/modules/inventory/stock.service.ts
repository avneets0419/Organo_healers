import type { MovementType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { ApiError } from "../../lib/http";
import type { Tx } from "../../lib/prisma";

const D = Prisma.Decimal;

/**
 * The ONLY way stock changes. Writes a movement row and updates the cached
 * product quantity in the same transaction, so stockQuantity always equals the
 * sum of movements and every change is traceable.
 */
export async function recordMovement(
  tx: Tx,
  input: {
    productId: string;
    type: MovementType;
    quantity: Prisma.Decimal | string; // signed delta
    unitCost?: string | null;
    reason?: string | null;
    documentId?: string | null;
    userId?: string | null;
  },
) {
  const qty = new D(input.quantity);
  if (qty.isZero()) return null;
  const product = await tx.product.update({
    where: { id: input.productId },
    data: { stockQuantity: { increment: qty } },
    select: { stockQuantity: true },
  });
  return tx.inventoryMovement.create({
    data: {
      productId: input.productId,
      type: input.type,
      quantity: qty,
      balanceAfter: product.stockQuantity,
      unitCost: input.unitCost ?? null,
      reason: input.reason ?? null,
      documentId: input.documentId ?? null,
      userId: input.userId ?? null,
    },
  });
}

/** Normalise a user-entered manual movement into a signed delta. */
export function signedQuantity(type: MovementType, quantity: string): Prisma.Decimal {
  const q = new D(quantity);
  switch (type) {
    case "PURCHASE":
    case "RETURN":
    case "OPENING":
      if (q.lte(0)) throw ApiError.badRequest("Quantity must be positive for purchases and returns");
      return q;
    case "DAMAGE":
    case "SALE":
      return q.abs().neg();
    case "ADJUSTMENT":
    case "MANUAL_CORRECTION":
      return q;
  }
}

/**
 * Reconcile stock for an invoice with what has already been recorded for it.
 * Idempotent: computes desired quantity per product (0 when cancelled), compares
 * with the net SALE/RETURN movements already linked to the document, and writes
 * only the difference. Handles create, edit, cancel and un-cancel uniformly.
 */
export async function syncDocumentStock(tx: Tx, documentId: string, userId?: string | null) {
  const doc = await tx.document.findUnique({
    where: { id: documentId },
    select: { id: true, type: true, status: true, number: true, items: { select: { productId: true, quantity: true } } },
  });
  if (!doc || doc.type !== "INVOICE") return;

  const desired = new Map<string, Prisma.Decimal>();
  if (doc.status !== "CANCELLED") {
    for (const it of doc.items) {
      if (!it.productId) continue;
      desired.set(it.productId, (desired.get(it.productId) ?? new D(0)).plus(it.quantity));
    }
  }

  const recorded = await tx.inventoryMovement.groupBy({
    by: ["productId"],
    where: { documentId, type: { in: ["SALE", "RETURN"] } },
    _sum: { quantity: true },
  });
  // Movements are negative for sales, so "already taken out" = -sum.
  const taken = new Map(recorded.map((r) => [r.productId, (r._sum.quantity ?? new D(0)).neg()]));

  const productIds = new Set([...desired.keys(), ...taken.keys()]);
  if (!productIds.size) return;
  const tracked = await tx.product.findMany({
    where: { id: { in: [...productIds] }, trackStock: true },
    select: { id: true },
  });
  for (const { id } of tracked) {
    const want = desired.get(id) ?? new D(0);
    const have = taken.get(id) ?? new D(0);
    const delta = want.minus(have);
    if (delta.isZero()) continue;
    await recordMovement(tx, {
      productId: id,
      type: delta.gt(0) ? "SALE" : "RETURN",
      quantity: delta.neg(),
      documentId,
      reason: delta.gt(0) ? `Invoice ${doc.number}` : `Invoice ${doc.number} ${doc.status === "CANCELLED" ? "cancelled" : "edited"}`,
      userId,
    });
  }
}
