import { describe, expect, it } from "vitest";
import { formatPhone, isValidIndianMobile, normalizeIndianPhone, toWhatsAppNumber } from "../src/phone";
import { buildWhatsAppUrl, documentTemplateVars, findUnknownVariables, renderTemplate, DEFAULT_MESSAGE_TEMPLATES } from "../src/templates";
import { formatINR } from "../src/money";

describe("Indian phone normalisation", () => {
  it.each([
    ["9992223310", "+919992223310"],
    ["99922 23310", "+919992223310"],
    ["09992223310", "+919992223310"],
    ["919992223310", "+919992223310"],
    ["+91-99922-23310", "+919992223310"],
    ["+91 99922 23310", "+919992223310"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it("rejects landline-style and short numbers", () => {
    expect(normalizeIndianPhone("12345")).toBeNull();
    expect(normalizeIndianPhone("1234567890")).toBeNull(); // mobiles start 6-9
    expect(isValidIndianMobile("5992223310")).toBe(false);
  });

  it("formats for display and WhatsApp", () => {
    expect(formatPhone("9992223310")).toBe("+91 99922 23310");
    expect(toWhatsAppNumber("099922 23310")).toBe("919992223310");
  });
});

describe("currency formatting", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR("169613")).toBe("₹1,69,613");
    expect(formatINR("98963.50")).toBe("₹98,963.50");
    expect(formatINR("0")).toBe("₹0");
  });
});

describe("WhatsApp message generation", () => {
  const tpl = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.channel === "WHATSAPP" && t.key === "proforma")!;
  const vars = documentTemplateVars({
    type: "PROFORMA",
    number: "PI-2026-0012",
    grandTotal: "98963.00",
    customerName: "TDI Residential",
    link: "https://app.example/i/abc123",
    businessName: "Organo Healers",
  });

  it("renders every variable in the proforma template", () => {
    const msg = renderTemplate(tpl.body, vars);
    expect(msg).toContain("Hello TDI Residential,");
    expect(msg).toContain("Invoice No: PI-2026-0012");
    expect(msg).toContain("Amount: ₹98,963");
    expect(msg).toContain("https://app.example/i/abc123");
    expect(msg).not.toMatch(/\{\{/);
  });

  it("builds a wa.me link with the customer's number and encoded text", () => {
    const url = buildWhatsAppUrl("99922 23310", "Hi & welcome\nLine 2")!;
    expect(url).toBe("https://wa.me/919992223310?text=Hi%20%26%20welcome%0ALine%202");
    expect(buildWhatsAppUrl("123", "x")).toBeNull();
  });

  it("keeps unknown variables visible and reports them", () => {
    expect(renderTemplate("Hi {{custmer_name}}", vars)).toBe("Hi {{custmer_name}}");
    expect(findUnknownVariables("Hi {{custmer_name}} {{amount}}")).toEqual(["custmer_name"]);
  });
});
