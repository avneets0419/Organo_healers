import { rateLimit } from "express-rate-limit";

const json = (message: string) => ({ success: false, code: "RATE_LIMITED", message });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Too many requests. Slow down a little."),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Too many sign-in attempts. Try again in 15 minutes."),
});

export const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Too many requests."),
});

export const sendLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: json("Too many messages sent in a short time."),
});
