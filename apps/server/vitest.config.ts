import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Integration tests run against a dedicated database (apps/server/.env.test).
function loadEnv(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const testEnv = loadEnv(".env.test");
// Applied before global setup so migrations/seed also target the test database.
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    env: testEnv,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
