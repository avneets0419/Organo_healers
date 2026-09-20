import { Router } from "express";
import bcrypt from "bcryptjs";
import { userInput } from "@organo/shared";
import { z } from "zod";
import { logActivity } from "../../lib/activity";
import { ApiError, created, handler, ok, param, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { invalidateUserCache, requirePermission } from "../../middleware/auth";

export const usersRouter = Router();

const select = {
  id: true,
  name: true,
  email: true,
  phone: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, key: true, name: true } },
} as const;

/** Everyone can list users (for assigning follow-ups); only managers change them. */
usersRouter.get(
  "/",
  handler(async (_req, res) => ok(res, serialize(await prisma.user.findMany({ select, orderBy: { name: "asc" } })))),
);

usersRouter.get(
  "/roles",
  handler(async (_req, res) => ok(res, await prisma.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } }))),
);

usersRouter.post(
  "/",
  requirePermission("users:manage"),
  handler(async (req, res) => {
    const data = parse(userInput.extend({ password: z.string().min(10, "At least 10 characters").max(200) }), req.body);
    const { password, ...rest } = data;
    const u = await prisma.user.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 12) }, select });
    await logActivity(prisma, { type: "SETTINGS_UPDATED", description: `User ${u.name} (${u.role.name}) added`, entityType: "user", entityId: u.id, userId: req.user?.id });
    created(res, serialize(u));
  }),
);

usersRouter.patch(
  "/:id",
  requirePermission("users:manage"),
  handler(async (req, res) => {
    const id = param(req, "id");
    const data = parse(userInput.partial(), req.body);
    if (id === req.user?.id && (data.active === false || data.roleId)) {
      throw ApiError.badRequest("You can't deactivate yourself or change your own role");
    }
    const { password, ...rest } = data;
    const u = await prisma.user.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
      select,
    });
    invalidateUserCache(id);
    await logActivity(prisma, {
      type: "SETTINGS_UPDATED",
      description: `User ${u.name} updated: ${Object.keys(data).map((k) => (k === "password" ? "password reset" : k)).join(", ")}`,
      entityType: "user",
      entityId: u.id,
      userId: req.user?.id,
    });
    ok(res, serialize(u));
  }),
);
