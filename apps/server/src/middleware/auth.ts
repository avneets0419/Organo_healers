import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Permission } from "@organo/shared";
import { env, isProd } from "../config/env";
import { ApiError } from "../lib/http";
import { prisma } from "../lib/prisma";

export const SESSION_COOKIE = "oh_session";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  roleName: string;
  permissions: string[];
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

interface TokenPayload {
  sub: string;
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function readToken(req: Request): string | null {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (typeof cookie === "string" && cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

// Short-lived cache so every API call doesn't pay a database round trip just to
// identify the user. Deactivation / role changes apply within USER_TTL_MS, and
// invalidateUserCache() makes them immediate when called from user management.
const USER_TTL_MS = 30_000;
const userCache = new Map<string, { user: AuthUser | null; at: number }>();

export function invalidateUserCache(userId?: string) {
  if (userId) userCache.delete(userId);
  else userCache.clear();
}

async function findAuthUser(id: string): Promise<AuthUser | null> {
  const hit = userCache.get(id);
  if (hit && Date.now() - hit.at < USER_TTL_MS) return hit.user;
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  const auth =
    user && user.active
      ? { id: user.id, name: user.name, email: user.email, roleKey: user.role.key, roleName: user.role.name, permissions: user.role.permissions }
      : null;
  userCache.set(id, { user: auth, at: Date.now() });
  return auth;
}

/**
 * Resolves the session (if any); use requireAuth to enforce. Only a bad or expired
 * token means "signed out". A database error is passed on (503, retryable) so a
 * cold or briefly unreachable database never logs people out.
 */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next();
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    return next(); // invalid / expired token: treat as signed out
  }
  try {
    req.user = (await findAuthUser(payload.sub)) ?? undefined;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  next();
}

export function can(user: AuthUser | undefined, permission: Permission): boolean {
  if (!user) return false;
  return user.permissions.includes("*") || user.permissions.includes(permission);
}

export const requirePermission =
  (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!can(req.user, permission)) return next(ApiError.forbidden());
    next();
  };
