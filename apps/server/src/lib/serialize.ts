import { Prisma } from "@prisma/client";

/**
 * Convert Prisma Decimals to fixed strings (never floats) and Dates to ISO so
 * every response is JSON-safe and money stays exact end to end.
 */
export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "passwordHash") continue;
      out[k] = serialize(v);
    }
    return out;
  }
  return value;
}
