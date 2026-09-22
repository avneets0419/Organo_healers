import type { BusinessSettings, Prisma } from "@prisma/client";
import { defaultLayout, formatPhone, joinAddress, normalizeLayout, type BusinessSnapshot, type SettingsInput } from "@organo/shared";
import { settingsInput } from "@organo/shared";
import type { z } from "zod";
import { logActivity } from "../../lib/activity";
import { prisma, type Db } from "../../lib/prisma";

const SETTINGS_ID = "default";

export async function getSettings(db: Db = prisma): Promise<BusinessSettings> {
  const s = await db.businessSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (s) return s;
  // First boot without seed: create a minimal row so the app still works.
  return db.businessSettings.create({ data: { id: SETTINGS_ID, businessName: "My Business" } });
}

export async function updateSettings(data: z.output<typeof settingsInput>, userId: string | undefined) {
  const before = await getSettings();
  const updated = await prisma.businessSettings.update({
    where: { id: SETTINGS_ID },
    data: { ...data, defaultLayout: data.defaultLayout === null ? undefined : (data.defaultLayout as Prisma.InputJsonValue | undefined) },
  });
  const changed = Object.keys(data).filter(
    (k) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify((updated as Record<string, unknown>)[k]),
  );
  if (changed.length) {
    await logActivity(prisma, {
      type: "SETTINGS_UPDATED",
      description: `Settings updated: ${changed.filter((k) => k !== "logoUrl").join(", ") || "logo"}`,
      entityType: "settings",
      entityId: SETTINGS_ID,
      metadata: { fields: changed },
      userId,
    });
  }
  return updated;
}

export function businessSnapshot(s: BusinessSettings): BusinessSnapshot {
  return {
    name: s.businessName,
    legalName: s.legalName,
    tagline: s.tagline,
    logoUrl: s.logoUrl,
    gstNumber: s.gstNumber,
    address: joinAddress([s.addressLine1, s.addressLine2, s.city, s.state && s.postalCode ? `${s.state} ${s.postalCode}` : s.state ?? s.postalCode]),
    phone: s.phone ? formatPhone(s.phone) : null,
    email: s.email,
    website: s.website,
    upiId: s.upiId,
    upiPhone: s.upiPhone ? formatPhone(s.upiPhone) : null,
    bankName: s.bankName,
    accountName: s.accountName,
    accountNumber: s.accountNumber,
    ifsc: s.ifsc,
    paymentInstructions: s.paymentInstructions,
  };
}

export function settingsLayout(s: BusinessSettings) {
  return s.defaultLayout ? normalizeLayout(s.defaultLayout) : defaultLayout();
}

export type { SettingsInput };
