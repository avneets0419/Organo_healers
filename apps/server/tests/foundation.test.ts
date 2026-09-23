import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { app, login } from "./helpers";

describe("auth", () => {
  it("rejects anonymous access to protected routes", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, code: "UNAUTHORIZED", message: "Please sign in to continue" });
  });

  it("rejects wrong passwords with a generic message", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@organohealers.local", password: "nope" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Email or password is incorrect");
  });

  it("logs in with an httpOnly cookie and returns the profile", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(String(res.headers["set-cookie"])).toMatch(/oh_session=.*HttpOnly/);
    const agent = await login();
    const me = await agent.get("/api/auth/me");
    expect(me.body.data.email).toBe("admin@organohealers.local");
    expect(me.body.data.permissions).toContain("*");
  });

  it("validates input and returns field errors", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email", password: "" });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors).toBeDefined();
  });
});

describe("settings & seed", () => {
  it("seeds business settings from the estimates and never leaks secrets", async () => {
    const agent = await login();
    const res = await agent.get("/api/settings");
    expect(res.status).toBe(200);
    expect(res.body.data.businessName).toBe("Organo Healers");
    expect(res.body.data.gstNumber).toBe("06AXDPS65721ZK");
    expect(res.body.data.upiId).toBe("organohealers@kotak");
    expect(JSON.stringify(res.body)).not.toMatch(/BREVO|DATABASE_URL|passwordHash/);
  });

  it("recreates the three historical estimates with the PDF totals", async () => {
    const docs = await prisma.document.findMany({ where: { number: { in: ["PI-2026-0001", "PI-2026-0002", "PI-2026-0003"] } }, orderBy: { number: "asc" }, select: { number: true, grandTotal: true } });
    expect(docs.map((d) => [d.number, d.grandTotal.toString()])).toEqual([
      ["PI-2026-0001", "169613"],
      ["PI-2026-0002", "98963"],
      ["PI-2026-0003", "42060"],
    ]);
  });

  it("keeps the original line text while linking to the catalog product", async () => {
    const item = await prisma.documentItem.findFirst({ where: { name: "Fluetx 18”" }, include: { product: true } });
    expect(item?.product?.name).toBe("Flutex 18\"");
    expect(item?.rate.toString()).toBe("2309");
  });
});

describe("dashboard", () => {
  it("computes metrics from the database (seed: 3 proformas, no invoices)", async () => {
    const agent = await login();
    const r = await agent.get("/api/dashboard");
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.revenue).toHaveLength(12);
    expect(d.funnel[0]).toEqual({ stage: "Proformas", count: expect.any(Number) });
    expect(Number(d.counts.proformas)).toBeGreaterThanOrEqual(3);
    expect(d.customers.top.length).toBeGreaterThan(0);
  });
});

describe("reports", () => {
  it.each(["sales", "invoices", "proformas", "customers", "products", "outstanding", "payments", "followups"])("%s report runs", async (type) => {
    const agent = await login();
    const r = await agent.get(`/api/reports/${type}`).query({ from: "2026-01-01", to: "2026-12-31" });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.rows)).toBe(true);
    expect(Array.isArray(r.body.data.columns)).toBe(true);
  });

  it("proforma report reproduces the seeded estimates", async () => {
    const agent = await login();
    const r = await agent.get("/api/reports/proformas").query({ from: "2026-09-01", to: "2026-09-30" });
    const seeded = r.body.data.rows.filter((x: { number: string }) => ["PI-2026-0001", "PI-2026-0002", "PI-2026-0003"].includes(x.number));
    expect(seeded.map((x: { grandTotal: string }) => x.grandTotal).sort()).toEqual(["169613", "42060", "98963"].sort());
  });
});
