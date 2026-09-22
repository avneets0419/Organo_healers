import { Router } from "express";
import { z } from "zod";
import { handler, ok, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { customerSearchWhere } from "../customers/customers.service";
import { productSearchWhere } from "../products/products.service";

export const searchRouter = Router();

/** Global ⌘K search across customers, documents and products. */
searchRouter.get(
  "/",
  handler(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().min(1).max(80) }), req.query);
    const [customers, documents, products] = await Promise.all([
      prisma.customer.findMany({
        where: { archivedAt: null, ...customerSearchWhere(q) },
        take: 5,
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, phone: true, email: true },
      }),
      prisma.document.findMany({
        where: {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { customer: { name: { contains: q, mode: "insensitive" } } },
          ],
        },
        take: 6,
        orderBy: { issueDate: "desc" },
        select: { id: true, number: true, type: true, grandTotal: true, customer: { select: { name: true } } },
      }),
      prisma.product.findMany({
        where: { active: true, ...productSearchWhere(q) },
        take: 6,
        orderBy: { name: "asc" },
        select: { id: true, name: true, sku: true, sellingPrice: true },
      }),
    ]);
    ok(res, {
      customers,
      documents: documents.map((d) => ({ id: d.id, number: d.number, type: d.type, grandTotal: d.grandTotal.toString(), customerName: d.customer.name })),
      products: products.map((p) => ({ ...p, sellingPrice: p.sellingPrice.toString() })),
    });
  }),
);
