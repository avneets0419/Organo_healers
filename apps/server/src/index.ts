import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { closeBrowser } from "./integrations/pdf/pdf.service";

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`Organo Healers API listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([prisma.$disconnect(), closeBrowser()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
