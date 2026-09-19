import type { ActivityType, Prisma } from "@prisma/client";
import type { Db } from "./prisma";

export interface LogActivityInput {
  type: ActivityType;
  description: string;
  customerId?: string | null;
  documentId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
  userId?: string | null;
  /** Bump customer.lastContactAt (calls, messages, meetings). */
  touchCustomer?: boolean;
}

const CONTACT_TYPES: ActivityType[] = [
  "CALL",
  "MEETING",
  "WHATSAPP_OPENED",
  "WHATSAPP_SENT",
  "EMAIL_SENT",
  "PROFORMA_SENT",
  "INVOICE_SENT",
  "PAYMENT_REMINDER",
  "FOLLOWUP_COMPLETED",
];

/** Append-only timeline / audit entry. Pass the transaction client when inside one. */
export async function logActivity(db: Db, input: LogActivityInput) {
  const activity = await db.activity.create({
    data: {
      type: input.type,
      description: input.description,
      customerId: input.customerId ?? null,
      documentId: input.documentId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
      userId: input.userId ?? null,
    },
  });
  if (input.customerId && (input.touchCustomer ?? CONTACT_TYPES.includes(input.type))) {
    await db.customer.update({ where: { id: input.customerId }, data: { lastContactAt: activity.createdAt } });
  }
  return activity;
}
