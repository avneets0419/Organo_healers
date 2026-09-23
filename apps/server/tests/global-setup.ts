import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Prepare the dedicated test database (DATABASE_URL from .env.test): apply
 * migrations, empty every table, then seed the real catalog.
 */
export default async function setup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test(\?|$)/.test(url)) throw new Error(`Refusing to run tests against non-test database: ${url}`);
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
  const db = new PrismaClient();
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
  await db.$disconnect();
  execSync("npx tsx prisma/seed/index.ts", { stdio: "inherit", env: process.env });
}
