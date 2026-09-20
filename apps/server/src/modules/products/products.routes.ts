import { Router } from "express";
import type { Prisma as P } from "@prisma/client";
import { categoryInput, PRODUCT_KINDS, productInput, productListQuery, productUpdateInput } from "@organo/shared";
import { z } from "zod";

import { ApiError, created, handler, ok, pageMeta, param, parse } from "../../lib/http";
import { Prisma, prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";
import { createProduct, productSearchWhere, updateProduct } from "./products.service";

export const productsRouter = Router();
export const categoriesRouter = Router();

const productSelect = {
  id: true, sku: true, name: true, description: true, kind: true, unit: true, mrp: true, sellingPrice: true,
  costPrice: true, taxRate: true, hsnCode: true, trackStock: true, stockQuantity: true, lowStockThreshold: true,
  imageUrl: true, attributes: true, active: true, categoryId: true, updatedAt: true, createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies P.ProductSelect;

productsRouter.get(
  "/",
  handler(async (req, res) => {
    const q = parse(productListQuery, req.query);
    const where: P.ProductWhereInput = {
      ...productSearchWhere(q.q),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.active === "all" ? {} : { active: q.active === "true" }),
    };
    if (q.stock === "out") Object.assign(where, { trackStock: true, stockQuantity: { lte: 0 } });
    let lowIds: string[] | undefined;
    if (q.stock === "low") {
      // Column-to-column comparison needs raw SQL.
      const rows = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Product" WHERE "trackStock" AND "lowStockThreshold" IS NOT NULL AND "stockQuantity" <= "lowStockThreshold"`;
      lowIds = rows.map((r) => r.id);
      Object.assign(where, { id: { in: lowIds } });
    }
    const orderBy: P.ProductOrderByWithRelationInput[] =
      q.sort === "price" ? [{ sellingPrice: "asc" }] : q.sort === "stock" ? [{ stockQuantity: "asc" }] : q.sort === "updated" ? [{ updatedAt: "desc" }] : [{ name: "asc" }];
    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: productSelect }),
    ]);
    ok(res, serialize(rows), pageMeta(q.page, q.pageSize, total));
  }),
);

productsRouter.get(
  "/summary",
  handler(async (_req, res) => {
    const [total, active, out, low, value] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count({ where: { active: true, trackStock: true, stockQuantity: { lte: 0 } } }),
      prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*)::bigint AS n FROM "Product" WHERE active AND "trackStock" AND "lowStockThreshold" IS NOT NULL AND "stockQuantity" <= "lowStockThreshold" AND "stockQuantity" > 0`,
      prisma.$queryRaw<Array<{ retail: Prisma.Decimal | null; cost: Prisma.Decimal | null }>>`
        SELECT SUM(GREATEST("stockQuantity",0) * "sellingPrice") AS retail, SUM(GREATEST("stockQuantity",0) * COALESCE("costPrice",0)) AS cost FROM "Product" WHERE active AND "trackStock"`,
    ]);
    ok(res, {
      total,
      active,
      outOfStock: out,
      lowStock: Number(low[0]?.n ?? 0),
      stockValueRetail: value[0]?.retail?.toString() ?? "0",
      stockValueCost: value[0]?.cost?.toString() ?? "0",
    });
  }),
);

productsRouter.get(
  "/:id",
  handler(async (req, res) => {
    const id = param(req, "id");
    const p = await prisma.product.findUnique({ where: { id }, select: productSelect });
    if (!p) throw ApiError.notFound("Product");
    const [prices, movements, sales] = await Promise.all([
      prisma.productPrice.findMany({ where: { productId: id }, orderBy: { effectiveAt: "desc" }, take: 50, include: { user: { select: { name: true } } } }),
      prisma.inventoryMovement.findMany({
        where: { productId: id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { user: { select: { name: true } }, document: { select: { id: true, number: true, type: true } } },
      }),
      prisma.documentItem.aggregate({
        where: { productId: id, document: { type: "INVOICE", status: { not: "CANCELLED" } } },
        _sum: { quantity: true, total: true },
      }),
    ]);
    ok(res, {
      ...(serialize(p) as object),
      prices: serialize(prices),
      movements: serialize(movements),
      sales: { quantity: sales._sum.quantity?.toString() ?? "0", revenue: sales._sum.total?.toString() ?? "0" },
    });
  }),
);

productsRouter.post(
  "/",
  requirePermission("inventory:write"),
  handler(async (req, res) => created(res, serialize(await createProduct(parse(productInput, req.body), req.user?.id)))),
);

productsRouter.patch(
  "/:id",
  requirePermission("inventory:write"),
  handler(async (req, res) => ok(res, serialize(await updateProduct(param(req, "id"), parse(productUpdateInput, req.body), req.user?.id)))),
);

productsRouter.post(
  "/:id/duplicate",
  requirePermission("inventory:write"),
  handler(async (req, res) => {
    const src = await prisma.product.findUnique({ where: { id: param(req, "id") } });
    if (!src) throw ApiError.notFound("Product");
    let sku = `${src.sku}-COPY`;
    for (let i = 2; await prisma.product.findUnique({ where: { sku } }); i++) sku = `${src.sku}-COPY${i}`;
    const p = await createProduct(
      parse(productInput, {
        ...src,
        sku,
        name: `${src.name} (copy)`,
        mrp: src.mrp?.toString() ?? null,
        sellingPrice: src.sellingPrice.toString(),
        costPrice: src.costPrice?.toString() ?? null,
        taxRate: src.taxRate.toString(),
        lowStockThreshold: src.lowStockThreshold?.toString() ?? null,
        attributes: src.attributes ?? {},
        priceNote: `Duplicated from ${src.sku}`,
      }),
      req.user?.id,
    );
    created(res, serialize(p));
  }),
);

/**
 * CSV import (rows parsed client-side). Upserts by SKU; new SKUs are created with
 * optional opening stock, existing ones are updated through the normal service so
 * price changes land in price history. Invalid rows are reported, not fatal.
 */
productsRouter.post(
  "/import",
  requirePermission("inventory:write"),
  handler(async (req, res) => {
    const { rows } = parse(z.object({ rows: z.array(z.record(z.string(), z.string())).min(1).max(1000) }), req.body);
    const cats = await prisma.category.findMany();
    const catFor = (v?: string) => {
      const t = v?.trim().toLowerCase();
      if (!t) return null;
      return cats.find((c) => c.slug === t || c.name.toLowerCase() === t)?.id ?? null;
    };
    const ATTR_KEYS = ["localName", "scientificName", "bagSize", "height", "plantType", "series", "potSize", "dimensions", "material", "color", "packOf", "brand", "serviceType", "materialType"];
    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; sku?: string; message: string }> = [];
    for (const [i, r] of rows.entries()) {
      const kind = (r.kind ?? r.type ?? "").trim().toUpperCase();
      const candidate = {
        sku: r.sku,
        name: r.name,
        kind: (PRODUCT_KINDS as readonly string[]).includes(kind) ? kind : "OTHER",
        categoryId: catFor(r.category),
        unit: r.unit || "pc",
        mrp: r.mrp || null,
        sellingPrice: r.sellingPrice || r.price || "0",
        costPrice: r.costPrice || r.cost || null,
        taxRate: r.taxRate || r.gst || "0",
        hsnCode: r.hsnCode || null,
        description: r.description || null,
        attributes: Object.fromEntries(ATTR_KEYS.filter((k) => r[k]).map((k) => [k, r[k]])),
        openingStock: r.openingStock || r.stock || undefined,
        priceNote: "CSV import",
      };
      const parsed = productInput.safeParse(candidate);
      if (!parsed.success) {
        errors.push({ row: i + 2, sku: r.sku, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
        continue;
      }
      try {
        const existing = await prisma.product.findUnique({ where: { sku: parsed.data.sku } });
        if (existing) {
          const { openingStock: _o, sku: _s, ...rest } = parsed.data;
          await updateProduct(existing.id, rest, req.user?.id);
          updated++;
        } else {
          await createProduct(parsed.data, req.user?.id);
          created++;
        }
      } catch (e) {
        errors.push({ row: i + 2, sku: r.sku, message: e instanceof Error ? e.message : "Failed" });
      }
    }
    ok(res, { created, updated, errors });
  }),
);

// ─── Categories ──────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

categoriesRouter.get(
  "/",
  handler(async (_req, res) => {
    const cats = await prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } });
    ok(res, serialize(cats.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }))));
  }),
);

categoriesRouter.post(
  "/",
  requirePermission("inventory:write"),
  handler(async (req, res) => {
    const data = parse(categoryInput, req.body);
    created(res, serialize(await prisma.category.create({ data: { ...data, slug: slugify(data.name) } })));
  }),
);

categoriesRouter.patch(
  "/:id",
  requirePermission("inventory:write"),
  handler(async (req, res) => {
    const data = parse(categoryInput.partial(), req.body);
    ok(res, serialize(await prisma.category.update({ where: { id: param(req, "id") }, data })));
  }),
);

categoriesRouter.delete(
  "/:id",
  requirePermission("inventory:write"),
  handler(async (req, res) => {
    const id = param(req, "id");
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count) throw ApiError.conflict(`${count} products use this category. Move them first or deactivate the category.`);
    await prisma.category.delete({ where: { id } });
    ok(res, { deleted: true });
  }),
);

