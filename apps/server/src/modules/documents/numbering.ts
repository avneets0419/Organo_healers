import type { DocumentType } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import type { Tx } from "../../lib/prisma";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar year in India for a timestamp (numbers reset each year). */
export function istYear(date: Date): number {
  return new Date(date.getTime() + IST_OFFSET_MS).getUTCFullYear();
}

export interface NumberingSettings {
  invoicePrefix: string;
  proformaPrefix: string;
  numberPadding: number;
  invoiceStartNumber: number;
  proformaStartNumber: number;
}

export function prefixFor(type: DocumentType, s: NumberingSettings): string {
  switch (type) {
    case "INVOICE":
      return s.invoicePrefix;
    case "PROFORMA":
      return s.proformaPrefix;
    case "QUOTATION":
      return "QT";
    case "CREDIT_NOTE":
      return "CN";
  }
}

export function formatDocumentNumber(prefix: string, year: number, value: number, padding: number): string {
  return `${prefix.toUpperCase()}-${year}-${String(value).padStart(padding, "0")}`;
}

/**
 * Atomically reserve the next number for (type, year). A single
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING takes a row lock, so concurrent
 * transactions serialize on the counter and can never receive the same value.
 * Must run inside the transaction that creates the document so a rollback
 * also releases the number.
 */
export async function reserveDocumentNumber(tx: Tx, type: DocumentType, date: Date, s: NumberingSettings): Promise<string> {
  const year = istYear(date);
  const start = type === "INVOICE" ? s.invoiceStartNumber : type === "PROFORMA" ? s.proformaStartNumber : 1;
  const rows = await tx.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO "DocumentSequence" ("id", "type", "year", "lastValue", "updatedAt")
    VALUES (${randomUUID()}, ${type}::"DocumentType", ${year}, ${start}, NOW())
    ON CONFLICT ("type", "year")
    DO UPDATE SET "lastValue" = GREATEST("DocumentSequence"."lastValue" + 1, ${start}), "updatedAt" = NOW()
    RETURNING "lastValue"`;
  const value = rows[0]?.lastValue;
  if (typeof value !== "number") throw new Error("Failed to reserve document number");
  return formatDocumentNumber(prefixFor(type, s), year, value, s.numberPadding);
}

/** 144 bits of randomness, URL-safe. Used for public links; never sequential. */
export function newPublicToken(): string {
  return randomBytes(18).toString("base64url");
}
