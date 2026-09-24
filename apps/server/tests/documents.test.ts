import { beforeAll, describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { prisma } from "../src/lib/prisma";
import { deriveCustomerStatus } from "../src/modules/customers/customer-status";
import { login } from "./helpers";

let agent: Agent;
let customerId: string;
let flutex18: { id: string; sku: string; mrp: string; sellingPrice: string };
let areca: { id: string };

const line = (p: { id: string; sku?: string }, name: string, quantity: string, rate: string, mrp?: string) => ({
  productId: p.id,
  name,
  sku: p.sku,
  quantity,
  rate,
  mrp: mrp ?? null,
});

beforeAll(async () => {
  agent = (await login()) as unknown as Agent;
  const c = await agent.post("/api/customers").send({ name: "Meera Kapoor", phone: "98110 45237", email: "Meera.K@example.in" });
  expect(c.status).toBe(201);
  customerId = c.body.data.id;
  const f = await prisma.product.findUniqueOrThrow({ where: { sku: "POT-GR-FLUTEX-18" } });
  flutex18 = { id: f.id, sku: f.sku, mrp: f.mrp!.toString(), sellingPrice: f.sellingPrice.toString() };
  areca = await prisma.product.findUniqueOrThrow({ where: { sku: "PL-ARECA-PALM" } });
  // Give Flutex some stock so sales can be observed.
  const m = await agent.post("/api/inventory/movements").send({ productId: flutex18.id, type: "PURCHASE", quantity: "20", reason: "Test purchase" });
  expect(m.status).toBe(201);
});

describe("customers", () => {
  it("normalises phone + email and finds the customer by partial phone, email or name", async () => {
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.phone).toBe("+919811045237");
    expect(c.email).toBe("meera.k@example.in");
    for (const q of ["98110", "+91 98110 45237", "meera.k@", "kapoor"]) {
      const r = await agent.get("/api/customers/lookup").query({ q });
      expect(r.body.data.map((x: { id: string }) => x.id), q).toContain(customerId);
    }
  });

  it("rejects duplicate phone numbers with a helpful message", async () => {
    const r = await agent.post("/api/customers").send({ name: "Someone Else", phone: "+91-98110-45237" });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain("Meera Kapoor");
  });

  it("rejects invalid Indian numbers", async () => {
    const r = await agent.post("/api/customers").send({ name: "X", phone: "12345" });
    expect(r.status).toBe(400);
    expect(r.body.errors.phone[0]).toMatch(/10-digit/);
  });
});

describe("documents", () => {
  let proformaId: string;
  let proformaNumber: string;

  it("creates a grouped proforma with server-side totals (client totals are ignored)", async () => {
    const r = await agent.post("/api/documents").send({
      type: "PROFORMA",
      customerId,
      groups: [
        { name: "GROUND FLOOR", items: [line(flutex18, "Flutex 18\"", "2", "2309", "3299"), line(areca, "Areca Palm", "2", "2000", "2350")] },
        { name: "TERRACE", items: [{ name: "Custom planting", quantity: "1", rate: "1500.50" }] },
      ],
      // Attempted tampering: unknown fields like grandTotal are not accepted from clients.
      grandTotal: "1",
    });
    expect(r.status).toBe(201);
    const d = r.body.data;
    proformaId = d.id;
    proformaNumber = d.number;
    expect(d.number).toMatch(/^PI-2026-\d{4}$/);
    expect(d.groups.map((g: { subtotal: string }) => g.subtotal)).toEqual(["8618", "1500.5"]);
    expect(d.grandTotal).toBe("10119"); // 10118.50 rounded to rupee
    expect(d.roundOff).toBe("0.5");
    expect(d.publicToken).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(d.renderable.customer.phone).toBe("+91 98110 45237");
  });

  it("does not touch stock for proformas", async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: flutex18.id } });
    expect(p.stockQuantity.toString()).toBe("20");
  });

  it("hands out unique sequential numbers under concurrent creation", async () => {
    const body = { type: "PROFORMA", customerId, groups: [{ name: "", items: [{ name: "Test", quantity: "1", rate: "10" }] }] };
    const results = await Promise.all(Array.from({ length: 12 }, () => agent.post("/api/documents").send(body)));
    for (const r of results) expect(r.status).toBe(201);
    const numbers = results.map((r) => r.body.data.number as string);
    expect(new Set(numbers).size).toBe(12);
    const seq = numbers.map((n) => Number(n.split("-")[2])).sort((a, b) => a - b);
    expect(seq[11]! - seq[0]!).toBe(11); // contiguous, no gaps or duplicates
  });

  it("edits a proforma and logs the change", async () => {
    const current = (await agent.get(`/api/documents/${proformaId}`)).body.data;
    const r = await agent.put(`/api/documents/${proformaId}`).send({
      type: "PROFORMA",
      customerId,
      groups: [{ name: "GROUND FLOOR", items: [line(flutex18, "Flutex 18\"", "3", "2309", "3299")] }],
      layout: current.renderable.layout,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.number).toBe(proformaNumber);
    expect(r.body.data.grandTotal).toBe("6927");
    const acts = await prisma.activity.findMany({ where: { documentId: proformaId, type: "PROFORMA_EDITED" } });
    expect(acts[0]?.description).toContain("₹10,119 to ₹6,927");
  });

  it("converts proforma to a NEW invoice, preserves the proforma, deducts stock", async () => {
    const r = await agent.post(`/api/documents/${proformaId}/convert`);
    expect(r.status).toBe(201);
    const inv = r.body.data;
    expect(inv.type).toBe("INVOICE");
    expect(inv.number).toMatch(/^INV-2026-\d{4}$/);
    expect(inv.sourceDocument.number).toBe(proformaNumber);
    expect(inv.grandTotal).toBe("6927");
    expect(inv.dueDate).toBeTruthy();

    const pf = await prisma.document.findUniqueOrThrow({ where: { id: proformaId }, include: { items: true } });
    expect(pf.status).toBe("CONVERTED");
    expect(pf.items).toHaveLength(1);
    expect(pf.grandTotal.toString()).toBe("6927");

    const p = await prisma.product.findUniqueOrThrow({ where: { id: flutex18.id } });
    expect(p.stockQuantity.toString()).toBe("17");
    const mv = await prisma.inventoryMovement.findFirst({ where: { documentId: inv.id } });
    expect(mv?.type).toBe("SALE");
    expect(mv?.quantity.toString()).toBe("-3");

    const again = await agent.post(`/api/documents/${proformaId}/convert`);
    expect(again.status).toBe(409);
    expect(again.body.message).toContain(inv.number);
  });

  it("keeps historical invoice prices when the product price changes later", async () => {
    const inv = await prisma.document.findFirstOrThrow({ where: { sourceDocumentId: proformaId } });
    const r = await agent.patch(`/api/products/${flutex18.id}`).send({ sellingPrice: "2499", priceNote: "Supplier increase" });
    expect(r.status).toBe(200);
    const item = await prisma.documentItem.findFirstOrThrow({ where: { documentId: inv.id } });
    expect(item.rate.toString()).toBe("2309");
    const history = await prisma.productPrice.findFirst({ where: { productId: flutex18.id, note: "Supplier increase" } });
    expect(history?.sellingPrice?.toString()).toBe("2499");
    const audit = await prisma.activity.findFirst({ where: { entityId: flutex18.id, type: "PRODUCT_PRICE_CHANGED" } });
    expect(audit?.description).toContain("2309 to 2499");
  });

  it("re-syncs stock on invoice edit and reverses it on cancel", async () => {
    const inv = (await agent.get("/api/documents").query({ type: "INVOICE", customerId })).body.data[0];
    const full = (await agent.get(`/api/documents/${inv.id}`)).body.data;
    const edit = await agent.put(`/api/documents/${inv.id}`).send({
      type: "INVOICE",
      customerId,
      groups: [{ name: "GROUND FLOOR", items: [line(flutex18, "Flutex 18\"", "5", "2309", "3299")] }],
      layout: full.renderable.layout,
    });
    expect(edit.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: flutex18.id } })).stockQuantity.toString()).toBe("15");

    const cancel = await agent.post(`/api/documents/${inv.id}/status`).send({ status: "CANCELLED" });
    expect(cancel.status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: flutex18.id } })).stockQuantity.toString()).toBe("20");
    const movements = await prisma.inventoryMovement.findMany({ where: { documentId: inv.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => [m.type, m.quantity.toString()])).toEqual([
      ["SALE", "-3"],
      ["SALE", "-2"],
      ["RETURN", "5"],
    ]);

    const editCancelled = await agent.put(`/api/documents/${inv.id}`).send({ type: "INVOICE", customerId, groups: full.groups.length ? [{ name: "", items: [{ name: "x", quantity: "1", rate: "1" }] }] : [] });
    expect(editCancelled.status).toBe(409);
  });

  it("rejects payment-driven statuses set by hand", async () => {
    const r = await agent.post(`/api/documents/${proformaId}/status`).send({ status: "PAID" });
    expect(r.status).toBe(400);
  });

  it("validates line items", async () => {
    const r = await agent.post("/api/documents").send({
      type: "INVOICE",
      customerId,
      groups: [{ name: "", items: [{ name: "Bad", quantity: "-1", rate: "abc" }] }],
    });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.errors)).toEqual(expect.arrayContaining(["groups.0.items.0.quantity", "groups.0.items.0.rate"]));
  });

  it("serves the public link by token only and records the first view", async () => {
    const d = await prisma.document.findUniqueOrThrow({ where: { number: "PI-2026-0002" } });
    const { default: request } = await import("supertest");
    const { app } = await import("./helpers");
    const r = await request(app).get(`/api/public/documents/${d.publicToken}`);
    expect(r.status).toBe(200);
    expect(r.body.data.document.totals.grandTotal).toBe("98963");
    expect(JSON.stringify(r.body)).not.toContain(d.id);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("VIEWED");
    expect(await prisma.activity.count({ where: { documentId: d.id, type: "PROFORMA_VIEWED" } })).toBe(1);
    expect((await request(app).get("/api/public/documents/not-a-real-token-123456")).status).toBe(404);
  });
});

describe("customer status derivation", () => {
  it("follows the pipeline", () => {
    expect(deriveCustomerStatus([])).toBe("LEAD");
    expect(deriveCustomerStatus([{ type: "PROFORMA", status: "DRAFT" }])).toBe("QUOTED");
    expect(deriveCustomerStatus([{ type: "PROFORMA", status: "SENT" }])).toBe("PROFORMA_SENT");
    expect(deriveCustomerStatus([{ type: "PROFORMA", status: "NEGOTIATING" }])).toBe("NEGOTIATING");
    expect(deriveCustomerStatus([{ type: "PROFORMA", status: "CONVERTED" }, { type: "INVOICE", status: "DRAFT" }])).toBe("CONFIRMED");
    expect(deriveCustomerStatus([{ type: "INVOICE", status: "SENT" }])).toBe("INVOICE_SENT");
    expect(deriveCustomerStatus([{ type: "INVOICE", status: "PARTIALLY_PAID" }])).toBe("PARTIALLY_PAID");
    expect(deriveCustomerStatus([{ type: "INVOICE", status: "PAID" }])).toBe("PAID");
  });
});

describe("payments", () => {
  it("records payments on a draft invoice without sending it, and voiding returns it to draft", async () => {
    const created = await agent.post("/api/documents").send({
      type: "INVOICE",
      customerId,
      groups: [{ name: "", items: [{ name: "Walk-in plants", quantity: "1", rate: "1000" }] }],
    });
    expect(created.body.data.status).toBe("DRAFT");
    const id = created.body.data.id;

    const half = await agent.post(`/api/payments/documents/${id}`).send({ amount: "500", method: "CASH" });
    expect(half.status).toBe(201);
    let d = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect([d.status, d.balanceDue.toString()]).toEqual(["PARTIALLY_PAID", "500"]);

    const rest = await agent.post(`/api/payments/documents/${id}`).send({ amount: "500", method: "UPI", reference: "UTR123" });
    expect(rest.status).toBe(201);
    d = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect([d.status, d.balanceDue.toString()]).toEqual(["PAID", "0"]);
    expect(d.paidAt).not.toBeNull();

    const over = await agent.post(`/api/payments/documents/${id}`).send({ amount: "1", method: "CASH" });
    expect(over.status).toBe(400);

    const payments = await prisma.payment.findMany({ where: { documentId: id } });
    for (const p of payments) expect((await agent.post(`/api/payments/${p.id}/void`).send({ reason: "Test" })).status).toBe(200);
    d = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect([d.status, d.balanceDue.toString(), d.paidAt]).toEqual(["DRAFT", "1000", null]);
  });
});
