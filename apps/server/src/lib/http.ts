import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";

/** Error that is safe to show to API consumers. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Record<string, string[]>,
    public code?: string,
  ) {
    super(message);
  }
  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new ApiError(400, message, errors, "BAD_REQUEST");
  }
  static unauthorized(message = "Please sign in to continue") {
    return new ApiError(401, message, undefined, "UNAUTHORIZED");
  }
  static forbidden(message = "You don't have permission to do that") {
    return new ApiError(403, message, undefined, "FORBIDDEN");
  }
  static notFound(what = "Resource") {
    return new ApiError(404, `${what} not found`, undefined, "NOT_FOUND");
  }
  static conflict(message: string) {
    return new ApiError(409, message, undefined, "CONFLICT");
  }
  static notConfigured(message: string) {
    return new ApiError(503, message, undefined, "NOT_CONFIGURED");
  }
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export function ok<T>(res: Response, data: T, meta?: PageMeta | Record<string, unknown>, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T) {
  return ok(res, data, undefined, 201);
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

type AsyncHandler<Req extends Request = Request> = (req: Req, res: Response, next: NextFunction) => Promise<unknown>;

/** Forward async errors to the error middleware (Express 5 does this too; explicit is clearer). */
export const handler =
  (fn: AsyncHandler): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of r.error.issues) {
      const key = issue.path.join(".") || "_";
      (errors[key] ??= []).push(issue.message);
    }
    const first = r.error.issues[0];
    const message = first ? `${first.path.length ? first.path.join(".") + ": " : ""}${first.message}` : "Invalid input";
    throw ApiError.badRequest(message, errors);
  }
  return r.data;
}

export function param(req: Request, name: string): string {
  const v = req.params[name];
  if (!v || typeof v !== "string") throw ApiError.badRequest(`Missing ${name}`);
  return v;
}
