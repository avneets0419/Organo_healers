import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "./logger";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });
  client.$on("error", (e) => {
    // Neon suspends an idle database and closes our pooled connections (E57P01).
    // Prisma reconnects on the next query, so this is expected, not an error.
    if (/E57P01|terminating connection due to administrator command|closed the connection/i.test(e.message)) {
      logger.debug("database connection closed by Neon (idle suspend); will reconnect");
      return;
    }
    logger.error({ target: e.target }, e.message);
  });
  client.$on("warn", (e) => {
    if (process.env.NODE_ENV === "development") logger.warn(e.message);
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;
export { Prisma };
