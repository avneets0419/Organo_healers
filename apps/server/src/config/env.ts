import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url().default("http://localhost:3000"),
  API_URL: z.url().default("http://localhost:4000"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BREVO_API_KEY: z.string().optional().transform((v) => v || undefined),
  BREVO_SENDER_EMAIL: z.string().optional().transform((v) => v || undefined),
  BREVO_SENDER_NAME: z.string().optional().transform((v) => v || undefined),
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message; never print secret values.
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
export const emailConfigured = Boolean(env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL);
