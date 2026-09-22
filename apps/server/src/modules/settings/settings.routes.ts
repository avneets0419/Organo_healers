import { Router } from "express";
import { settingsInput } from "@organo/shared";
import { emailConfigured } from "../../config/env";
import { handler, ok, parse } from "../../lib/http";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";
import { getSettings, settingsLayout, updateSettings } from "./settings.service";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/http";

export const settingsRouter = Router();

settingsRouter.get(
  "/",
  handler(async (_req, res) => {
    const s = await getSettings();
    ok(res, {
      ...(serialize(s) as object),
      defaultLayout: settingsLayout(s),
      integrations: { email: { provider: "brevo", configured: emailConfigured } },
    });
  }),
);

settingsRouter.patch(
  "/",
  requirePermission("settings:write"),
  handler(async (req, res) => {
    const data = parse(settingsInput, req.body);
    const s = await updateSettings(data, req.user?.id);
    ok(res, { ...(serialize(s) as object), defaultLayout: settingsLayout(s) });
  }),
);

/** Logo upload as a data URL (PNG/JPEG/WebP/SVG, max 1 MB). Stored in Postgres, served from /api/public/assets. */
settingsRouter.post(
  "/logo",
  requirePermission("settings:write"),
  handler(async (req, res) => {
    const { dataUrl, filename } = parse(z.object({ dataUrl: z.string().max(1_500_000), filename: z.string().max(120).default("logo") }), req.body);
    const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw ApiError.badRequest("Upload a PNG, JPG, WebP or SVG image");
    const data = Buffer.from(m[2]!, "base64");
    if (data.length > 1_000_000) throw ApiError.badRequest("Logo must be under 1 MB");
    const asset = await prisma.asset.create({ data: { filename, mimeType: m[1]!, size: data.length, data, purpose: "logo" } });
    const s = await updateSettings({ logoUrl: `/api/public/assets/${asset.id}` }, req.user?.id);
    ok(res, { logoUrl: s.logoUrl });
  }),
);
