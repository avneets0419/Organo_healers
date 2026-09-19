import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../lib/http";
import { logger } from "../lib/logger";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `No route for ${req.method} ${req.path}`, undefined, "NOT_FOUND"));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.errors ? { errors: err.errors } : {}),
    });
  }

  // Neon suspends idle databases; the first queries after a pause can hit closed or
  // still-connecting sockets. These are transient: tell the client to retry.
  if (isTransientDbError(err)) {
    logger.warn({ code: (err as { code?: string }).code, path: req.path }, "Transient database error");
    res.setHeader("Retry-After", "2");
    return res.status(503).json({ success: false, code: "DB_UNAVAILABLE", message: "The database is waking up. Please try again in a moment." });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "field";
      const field = Array.isArray(target) ? target.join(", ") : target;
      return res.status(409).json({ success: false, code: "CONFLICT", message: `A record with this ${field} already exists` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Record not found" });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ success: false, code: "CONFLICT", message: "This record is linked to other records" });
    }
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ success: false, code: "BAD_REQUEST", message: "Malformed JSON body" });
  }

  // Unknown: log everything, reveal nothing.
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  return res.status(500).json({ success: false, code: "INTERNAL", message: "Something went wrong. Please try again." });
}

const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

export function isTransientDbError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_CODES.has(err.code)) return true;
  if (err instanceof Prisma.PrismaClientUnknownRequestError && /connection|closed|timed out/i.test(err.message)) return true;
  return false;
}
