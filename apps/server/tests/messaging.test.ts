import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { BrevoEmailService, toBrevoPayload } from "../src/integrations/email/brevo.service";
import { closeBrowser, generateDocumentPdf, renderDocumentHtml } from "../src/integrations/pdf/pdf.service";
import { prisma } from "../src/lib/prisma";
import { documentInclude, toRenderable } from "../src/modules/documents/documents.service";
import { buildDocumentEmail } from "../src/modules/messaging/compose";
import { login } from "./helpers";

afterAll(() => closeBrowser());

async function omax() {
  const d = await prisma.document.findUniqueOrThrow({ where: { number: "PI-2026-0001" }, include: documentInclude });
  return { doc: d, r: toRenderable(d) };
}

describe("email payload", () => {
  it("builds a branded email with link, escaped content and PDF attachment", async () => {
    const { r } = await omax();
    const msg = buildDocumentEmail({
      doc: r,
      to: "sunil@example.in",
      subject: "Proforma PI-2026-0001",
      body: "Hello Sunil,\n\nPlease find <attached> the estimate.",
      link: "https://app.example/i/tok",
      pdf: { name: "PI-2026-0001.pdf", base64: "JVBERi0=" },
    });
    expect(msg.to).toEqual([{ email: "sunil@example.in", name: "Sunil Saroha (OMAX)" }]);
    expect(msg.html).toContain("Please find &lt;attached&gt; the estimate.");
    expect(msg.html).toContain('href="https://app.example/i/tok"');
    expect(msg.html).toContain("₹1,69,613");
    expect(msg.text).toContain("https://app.example/i/tok");
    expect(msg.attachments).toEqual([{ name: "PI-2026-0001.pdf", content: "JVBERi0=" }]);
  });

  it("maps to Brevo's /v3/smtp/email schema", () => {
    const payload = toBrevoPayload(
      { to: [{ email: "a@b.in" }], subject: "S", text: "T", html: "<p>H</p>", attachments: [{ name: "x.pdf", content: "AA==" }] },
      { email: "studio@organohealers.in", name: "Organo Healers" },
    );
    expect(payload).toEqual({
      sender: { email: "studio@organohealers.in", name: "Organo Healers" },
      to: [{ email: "a@b.in" }],
      subject: "S",
      htmlContent: "<p>H</p>",
      textContent: "T",
      attachment: [{ name: "x.pdf", content: "AA==" }],
    });
  });

  it("sends with the api-key header and surfaces Brevo errors", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const okFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messageId: "<abc@smtp-relay.brevo.com>" }), { status: 201 });
    }) as unknown as typeof fetch;
    const svc = new BrevoEmailService("xkeysib-test", "studio@organohealers.in", "Organo Healers", okFetch);
    const r = await svc.send({ to: [{ email: "a@b.in" }], subject: "S", text: "T", html: "H" });
    expect(r.messageId).toBe("<abc@smtp-relay.brevo.com>");
    expect(calls[0]!.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((calls[0]!.init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");

    const badFetch = (async () => new Response(JSON.stringify({ code: "unauthorized", message: "Key not found" }), { status: 401 })) as unknown as typeof fetch;
    await expect(new BrevoEmailService("bad", "s@x.in", "X", badFetch).send({ to: [{ email: "a@b.in" }], subject: "S", text: "T", html: "H" })).rejects.toThrow(
      "Brevo: Key not found",
    );
    expect(new BrevoEmailService(undefined, undefined).configured).toBe(false);
  });
});

describe("send endpoints", () => {
  it("reports email as not configured instead of pretending to send", async () => {
    const agent = await login();
    const { doc } = await omax();
    const r = await agent.post(`/api/documents/${doc.id}/send-email`).send({ to: "a@b.in", subject: "S", body: "B" });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("NOT_CONFIGURED");
  });

  it("composes messages with the customer's details and the public link", async () => {
    const agent = await login();
    const { doc } = await omax();
    const r = await agent.get(`/api/documents/${doc.id}/compose`);
    expect(r.status).toBe(200);
    const wa = r.body.data.whatsapp.templates.find((t: { isDefault: boolean }) => t.isDefault);
    expect(wa.key).toBe("proforma");
    expect(wa.body).toContain("Invoice No: PI-2026-0001");
    expect(wa.body).toContain("Amount: ₹1,69,613");
    expect(wa.body).toContain(`/i/${doc.publicToken}`);
    expect(r.body.data.email.configured).toBe(false);
  });

  it("logs WhatsApp as OPENED (not sent) and keeps the document status", async () => {
    const agent = await login();
    const { doc } = await omax();
    const before = doc.status;
    const r = await agent.post(`/api/documents/${doc.id}/whatsapp-opened`).send({ phone: "99922 23310", message: "Hello" });
    expect(r.status).toBe(200);
    const log = await prisma.messageLog.findFirstOrThrow({ where: { documentId: doc.id, channel: "WHATSAPP" }, orderBy: { createdAt: "desc" } });
    expect(log.status).toBe("OPENED");
    expect(log.to).toBe("+919992223310");
    const act = await prisma.activity.findFirstOrThrow({ where: { documentId: doc.id, type: "WHATSAPP_OPENED" } });
    expect(act.description).toContain("WhatsApp opened");
    expect(await prisma.activity.count({ where: { documentId: doc.id, type: "WHATSAPP_SENT" } })).toBe(0);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe(before);

    const c = await agent.post(`/api/documents/${doc.id}/whatsapp-confirmed`);
    expect(c.status).toBe(200);
    expect((await prisma.messageLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe("SENT");
    expect(await prisma.activity.count({ where: { documentId: doc.id, type: "WHATSAPP_SENT" } })).toBe(1);
  });
});

describe("PDF", () => {
  it("renders the 33-line OMAX estimate onto multiple A4 pages with groups and totals", async () => {
    const { r } = await omax();
    const html = await renderDocumentHtml(r);
    expect(html).toContain("GROUND FLOOR, POTS IN WHITE");
    expect(html).toContain("FIRST FLOOR (terrace garden)");
    expect(html).toContain("₹1,69,613");
    expect(html).toContain("Rupees One Lakh Sixty-Nine Thousand Six Hundred Thirteen Only");
    expect(html).toContain("data:image/png;base64"); // logo inlined from the Asset table
    const pdf = await generateDocumentPdf(r);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(2);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
  }, 60_000);
});
