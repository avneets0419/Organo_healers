import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { corsOrigins } from "./config/env";
import { logger } from "./lib/logger";
import { errorHandler, notFound } from "./middleware/error";
import { loadUser, requireAuth } from "./middleware/auth";
import { apiLimiter } from "./middleware/rateLimit";
import { routes } from "./routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  if (process.env.NODE_ENV !== "test") {
    app.use(
      pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === "/api/health" },
        // One concise line per request; headers (and cookies) are never logged.
        serializers: {
          req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
          res: (res: { statusCode: number }) => ({ status: res.statusCode }),
        },
        customSuccessMessage: (req, res, ms) => `${req.method} ${req.url} ${res.statusCode} ${Math.round(ms)}ms`,
        customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
        customAttributeKeys: { req: "req", res: "res", responseTime: "ms" },
        quietReqLogger: true,
      }),
    );
  }

  app.get("/api/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok", time: new Date().toISOString() } });
  });

  const api = Router();
  api.use(apiLimiter);
  api.use(loadUser);

  // Unauthenticated
  api.use("/auth", routes.auth);
  api.use("/public", routes.publicDocs);

  // Everything else requires a session
  api.use(requireAuth);
  for (const [path, router] of routes.protected) api.use(path, router);

  app.use("/api", api);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
