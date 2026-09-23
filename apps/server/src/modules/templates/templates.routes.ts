import { Router } from "express";
import { MESSAGE_CHANNELS, messageTemplateInput } from "@organo/shared";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError, created, handler, ok, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { requirePermission } from "../../middleware/auth";

export const templatesRouter = Router();

templatesRouter.get(
  "/",
  handler(async (req, res) => {
    const { channel } = parse(z.object({ channel: z.enum(MESSAGE_CHANNELS).optional() }), req.query);
    const rows = await prisma.messageTemplate.findMany({ where: channel ? { channel } : {}, orderBy: [{ channel: "asc" }, { isDefault: "desc" }, { name: "asc" }] });
    ok(res, serialize(rows));
  }),
);

templatesRouter.get(
  "/invoice",
  handler(async (_req, res) => ok(res, serialize(await prisma.invoiceTemplate.findMany({ orderBy: { name: "asc" } })))),
);

templatesRouter.post(
  "/",
  requirePermission("settings:write"),
  handler(async (req, res) => {
    const data = parse(messageTemplateInput, req.body);
    const t = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.messageTemplate.updateMany({ where: { channel: data.channel, documentType: data.documentType ?? null }, data: { isDefault: false } });
      return tx.messageTemplate.create({ data });
    });
    await logActivity(prisma, { type: "SETTINGS_UPDATED", description: `Template "${t.name}" created`, entityType: "template", entityId: t.id, userId: req.user?.id });
    created(res, serialize(t));
  }),
);

templatesRouter.patch(
  "/:id",
  requirePermission("settings:write"),
  handler(async (req, res) => {
    const id = param(req, "id");
    const data = parse(messageTemplateInput.partial(), req.body);
    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Template");
    const t = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.messageTemplate.updateMany({
          where: { channel: data.channel ?? existing.channel, documentType: (data.documentType === undefined ? existing.documentType : data.documentType) ?? null, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.messageTemplate.update({ where: { id }, data });
    });
    await logActivity(prisma, { type: "SETTINGS_UPDATED", description: `Template "${t.name}" updated`, entityType: "template", entityId: t.id, userId: req.user?.id });
    ok(res, serialize(t));
  }),
);

templatesRouter.delete(
  "/:id",
  requirePermission("settings:write"),
  handler(async (req, res) => {
    const id = param(req, "id");
    const t = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!t) throw ApiError.notFound("Template");
    if (t.isDefault) throw ApiError.conflict("Make another template the default before deleting this one");
    await prisma.followUp.updateMany({ where: { templateId: id }, data: { templateId: null } });
    await prisma.messageTemplate.delete({ where: { id } });
    await logActivity(prisma, { type: "SETTINGS_UPDATED", description: `Template "${t.name}" deleted`, entityType: "template", entityId: id, userId: req.user?.id });
    ok(res, { deleted: true });
  }),
);
