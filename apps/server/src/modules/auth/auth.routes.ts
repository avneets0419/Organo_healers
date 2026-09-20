import { Router } from "express";
import bcrypt from "bcryptjs";
import { loginInput } from "@organo/shared";
import { ApiError, handler, ok, parse } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { loginLimiter } from "../../middleware/rateLimit";
import { SESSION_COOKIE, requireAuth, sessionCookieOptions, signSession } from "../../middleware/auth";

export const authRouter = Router();

// Equalise timing between "no such user" and "wrong password".
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

authRouter.post(
  "/login",
  loginLimiter,
  handler(async (req, res) => {
    const { email, password } = parse(loginInput, req.body);
    const user = await prisma.user.findUnique({ where: { email }, include: { role: true } });
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid || !user.active) throw ApiError.unauthorized("Email or password is incorrect");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions());
    ok(res, { id: user.id, name: user.name, email: user.email, role: user.role.name, permissions: user.role.permissions });
  }),
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(), maxAge: undefined });
  ok(res, { signedOut: true });
});

authRouter.get(
  "/me",
  requireAuth,
  handler(async (req, res) => {
    const u = req.user!;
    ok(res, { id: u.id, name: u.name, email: u.email, role: u.roleName, roleKey: u.roleKey, permissions: u.permissions });
  }),
);
