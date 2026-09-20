import type { Prisma as P } from "@prisma/client";
import { productInput, productUpdateInput } from "@organo/shared";
import type { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError } from "../../lib/http";
import { Prisma, prisma } from "../../lib/prisma";
import { recordMovement } from "../inventory/stock.service";

type ProductData = z.output<typeof productInput>;
type ProductUpdate = z.output<typeof productUpdateInput>;

export function productSearchWhere(q: string | undefined): P.ProductWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const words = term.split(/\s+/).filter(Boolean).slice(0, 5);
  // Every word must match name or SKU or a searchable attribute, so "flutex 18" finds "Flutex 18"".
  return {
    AND: words.map((w) => ({
      OR: [
        { name: { contains: w, mode: "insensitive" } },
        { sku: { contains: w, mode: "insensitive" } },
        { attributes: { path: ["localName"], string_contains: w } },
        { attributes: { path: ["scientificName"], string_contains: w } },
        { attributes: { path: ["series"], string_contains: w } },
      ],
    })),
  } as P.ProductWhereInput;
}

export async function createProduct(data: ProductData, userId?: string) {
  const { openingStock, priceNote, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: { ...rest, attributes: rest.attributes as P.InputJsonValue, stockQuantity: 0 },
    });
    await tx.productPrice.create({
      data: { productId: p.id, mrp: p.mrp, sellingPrice: p.sellingPrice, costPrice: p.costPrice, source: "MANUAL", note: priceNote ?? "Product created", userId },
    });
    if (openingStock && new Prisma.Decimal(openingStock).gt(0) && p.trackStock) {
      await recordMovement(tx, { productId: p.id, type: "OPENING", quantity: openingStock, reason: "Opening stock", userId });
    }
    await logActivity(tx, {
      type: "PRODUCT_CREATED",
      description: `Product ${p.name} (${p.sku}) created`,
      entityType: "product",
      entityId: p.id,
      userId,
    });
    return p;
  });
}

const PRICE_FIELDS = ["mrp", "sellingPrice", "costPrice"] as const;

export async function updateProduct(id: string, data: ProductUpdate, userId?: string) {
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound("Product");
  const { priceNote, ...rest } = data;
  return prisma.$transaction(async (tx) => {
    const p = await tx.product.update({
      where: { id },
      data: { ...rest, attributes: rest.attributes as P.InputJsonValue | undefined },
    });
    const priceChanged = PRICE_FIELDS.some((f) => String(before[f] ?? "") !== String(p[f] ?? ""));
    if (priceChanged) {
      await tx.productPrice.create({
        data: { productId: id, mrp: p.mrp, sellingPrice: p.sellingPrice, costPrice: p.costPrice, source: "MANUAL", note: priceNote ?? null, userId },
      });
      const parts = PRICE_FIELDS.filter((f) => String(before[f] ?? "") !== String(p[f] ?? "")).map(
        (f) => `${f === "sellingPrice" ? "price" : f === "mrp" ? "MRP" : "cost"} ${before[f]?.toString() ?? "none"} to ${p[f]?.toString() ?? "none"}`,
      );
      await logActivity(tx, {
        type: "PRODUCT_PRICE_CHANGED",
        description: `${p.name}: ${parts.join(", ")}`,
        entityType: "product",
        entityId: id,
        metadata: Object.fromEntries(PRICE_FIELDS.map((f) => [f, { from: before[f]?.toString() ?? null, to: p[f]?.toString() ?? null }])),
        userId,
      });
    }
    const otherChanges = Object.keys(rest).filter(
      (k) => !(PRICE_FIELDS as readonly string[]).includes(k) && JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((p as Record<string, unknown>)[k]),
    );
    if (otherChanges.length) {
      await logActivity(tx, {
        type: "PRODUCT_UPDATED",
        description: `${p.name}: updated ${otherChanges.join(", ")}`,
        entityType: "product",
        entityId: id,
        metadata: { fields: otherChanges },
        userId,
      });
    }
    return p;
  });
}
