import type { Prisma as P } from "@prisma/client";
import { customerInput, customerUpdateInput, phoneSearchDigits } from "@organo/shared";
import type { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError } from "../../lib/http";
import { prisma } from "../../lib/prisma";

type CustomerData = z.output<typeof customerInput>;
type CustomerUpdate = z.output<typeof customerUpdateInput>;

/** Matches name / company / email / phone digits. Phone matching ignores +91, spaces, dashes. */
export function customerSearchWhere(q: string | undefined): P.CustomerWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const digits = phoneSearchDigits(term);
  const or: P.CustomerWhereInput[] = [
    { name: { contains: term, mode: "insensitive" } },
    { companyName: { contains: term, mode: "insensitive" } },
    { email: { contains: term.toLowerCase(), mode: "insensitive" } },
  ];
  if (digits.length >= 3) or.push({ phone: { contains: digits } });
  return { OR: or };
}

async function assertUnique(data: { phone?: string | null; email?: string | null }, exceptId?: string) {
  const or: P.CustomerWhereInput[] = [];
  if (data.phone) or.push({ phone: data.phone });
  if (data.email) or.push({ email: data.email });
  if (!or.length) return;
  const dupe = await prisma.customer.findFirst({ where: { OR: or, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  if (dupe) {
    const field = data.phone && dupe.phone === data.phone ? "phone number" : "email";
    throw new ApiError(409, `${dupe.name} already uses this ${field}`, undefined, "DUPLICATE_CUSTOMER");
  }
}

export async function createCustomer(data: CustomerData, userId?: string) {
  await assertUnique(data);
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.create({ data: { ...data, tags: data.tags ?? [] } });
    await logActivity(tx, {
      type: "CUSTOMER_CREATED",
      description: `Customer ${c.name} created`,
      customerId: c.id,
      entityType: "customer",
      entityId: c.id,
      userId,
      touchCustomer: false,
    });
    return c;
  });
}

export async function updateCustomer(id: string, data: CustomerUpdate, userId?: string) {
  const before = await prisma.customer.findUnique({ where: { id } });
  if (!before) throw ApiError.notFound("Customer");
  await assertUnique({ phone: data.phone ?? undefined, email: data.email ?? undefined }, id);
  return prisma.$transaction(async (tx) => {
    const c = await tx.customer.update({ where: { id }, data });
    const changed = Object.keys(data).filter(
      (k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((c as Record<string, unknown>)[k]),
    );
    if (changed.length) {
      await logActivity(tx, {
        type: "CUSTOMER_UPDATED",
        description: `Updated ${changed.join(", ")}`,
        customerId: id,
        entityType: "customer",
        entityId: id,
        metadata: { fields: changed },
        userId,
        touchCustomer: false,
      });
    }
    return c;
  });
}
