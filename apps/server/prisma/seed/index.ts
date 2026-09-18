/**
 * Seed: business settings, roles + admin user, categories, the real catalog from
 * the supplied PDFs, price history, message/invoice templates, and the three
 * historical estimates recreated as proformas through the normal document service.
 *
 * Idempotent: safe to run repeatedly. Re-running never duplicates products,
 * customers or documents and never overwrites prices someone changed in the app.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { DEFAULT_MESSAGE_TEMPLATES, defaultLayout, documentInput, LAYOUT_PRESETS, allColumns, DEFAULT_SECTIONS } from "@organo/shared";
import { prisma } from "../../src/lib/prisma";
import { createDocument } from "../../src/modules/documents/documents.service";
import { ALL_PRODUCTS, CATEGORIES, type HistoricalPrice } from "./catalog";
import { HISTORICAL_DOCUMENTS, SOURCE_DOCS } from "./historical";

const here = dirname(fileURLToPath(import.meta.url));

async function seedSettings() {
  const logo = readFileSync(join(here, "assets/organo-healers-logo.png"));
  const asset =
    (await prisma.asset.findFirst({ where: { purpose: "logo", filename: "organo-healers-logo.png" } })) ??
    (await prisma.asset.create({
      data: { filename: "organo-healers-logo.png", mimeType: "image/png", size: logo.length, data: logo, purpose: "logo" },
    }));

  const existing = await prisma.businessSettings.findUnique({ where: { id: "default" } });
  if (existing) return console.log("· settings exist, leaving untouched");

  await prisma.businessSettings.create({
    data: {
      id: "default",
      businessName: "Organo Healers",
      legalName: "Organo Healers",
      tagline: "Plant Studio",
      logoUrl: `/api/public/assets/${asset.id}`,
      gstNumber: "06AXDPS65721ZK",
      state: "Haryana",
      phone: "+919992223310",
      upiId: "organohealers@kotak",
      upiPhone: "+919992223310",
      bankName: "Kotak Mahindra Bank",
      accountName: "Organo Healers",
      accountNumber: "8913269453",
      ifsc: "KKBK0004366",
      paymentInstructions: "UPI accepted on GPay, Paytm and PhonePe.",
      invoicePrefix: "INV",
      proformaPrefix: "PI",
      numberPadding: 4,
      defaultTaxRate: "0",
      pricesIncludeTax: false,
      roundToRupee: true,
      invoiceDueDays: 7,
      proformaValidDays: 15,
      paymentTerms: "50% advance, 50% on the day of completion.",
      defaultTerms: "Material will be delivered within the week after order confirmation.",
      defaultNotes: null,
      invoiceFooter: "Thank you for choosing Organo Healers.",
      defaultLayout: defaultLayout("particulars"),
      emailSenderName: "Organo Healers",
    },
  });
  console.log("✓ business settings");
}

const ROLES = [
  { key: "owner", name: "Owner", permissions: ["*"] },
  {
    key: "manager",
    name: "Manager",
    permissions: [
      "documents:read", "documents:write", "documents:send", "customers:read", "customers:write",
      "inventory:read", "inventory:write", "payments:write", "reports:read", "settings:write",
    ],
  },
  {
    key: "sales",
    name: "Sales",
    permissions: ["documents:read", "documents:write", "documents:send", "customers:read", "customers:write", "inventory:read", "payments:write"],
  },
  { key: "inventory", name: "Inventory", permissions: ["inventory:read", "inventory:write", "documents:read", "customers:read"] },
];

async function seedUsers() {
  for (const r of ROLES) {
    await prisma.role.upsert({ where: { key: r.key }, update: { name: r.name, permissions: r.permissions }, create: r });
  }
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@organohealers.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (await prisma.user.findUnique({ where: { email } })) return console.log("· admin user exists");
  if (!password || password.length < 10) {
    throw new Error("Set SEED_ADMIN_PASSWORD (min 10 chars) in apps/server/.env before seeding");
  }
  const owner = await prisma.role.findUniqueOrThrow({ where: { key: "owner" } });
  await prisma.user.create({
    data: { name: "Organo Admin", email, passwordHash: await bcrypt.hash(password, 12), roleId: owner.id },
  });
  console.log(`✓ admin user ${email} (password from SEED_ADMIN_PASSWORD)`);
}

async function seedCatalog() {
  const catIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, name: c.name, kind: c.kind, sortOrder: c.sortOrder },
    });
    catIds.set(c.slug, cat.id);
  }

  let created = 0;
  for (const p of ALL_PRODUCTS) {
    if (await prisma.product.findUnique({ where: { sku: p.sku } })) continue;
    const product = await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        kind: p.kind,
        categoryId: catIds.get(p.category) ?? null,
        unit: p.unit ?? "pc",
        mrp: p.mrp ?? null,
        sellingPrice: p.sellingPrice,
        description: p.description ?? null,
        attributes: Object.fromEntries(Object.entries(p.attributes ?? {}).filter(([, v]) => v !== null && v !== undefined)),
        trackStock: p.kind !== "SERVICE",
        stockQuantity: 0,
      },
    });
    const history: Array<{ mrp?: number; rate?: number; source: "CATALOG" | "HISTORICAL_DOCUMENT" | "SEED"; ref: string; at: Date; note?: string }> = [];
    if (p.catalogue && p.mrp) {
      history.push({ mrp: p.mrp, source: "CATALOG", ref: "Greenri Lush Series catalogue (May 2026)", at: new Date("2026-05-26T00:00:00+05:30") });
    }
    for (const h of p.history ?? ([] as HistoricalPrice[])) {
      const src = SOURCE_DOCS[h.doc];
      history.push({ mrp: h.mrp, rate: h.rate, source: "HISTORICAL_DOCUMENT", ref: src.label, at: src.date });
    }
    history.push({ mrp: p.mrp, rate: p.sellingPrice, source: "SEED", ref: "Initial catalog", at: new Date(), note: p.priceNote });
    await prisma.productPrice.createMany({
      data: history.map((h) => ({
        productId: product.id,
        mrp: h.mrp ?? null,
        sellingPrice: h.rate ?? null,
        source: h.source,
        sourceRef: h.ref,
        note: h.note ?? null,
        effectiveAt: h.at,
      })),
    });
    created++;
  }
  console.log(`✓ catalog: ${CATEGORIES.length} categories, ${created} new products (${ALL_PRODUCTS.length} total defined)`);
}

async function seedTemplates() {
  for (const t of DEFAULT_MESSAGE_TEMPLATES) {
    await prisma.messageTemplate.upsert({
      where: { channel_key: { channel: t.channel, key: t.key } },
      update: {},
      create: {
        channel: t.channel,
        key: t.key,
        name: t.name,
        subject: t.subject ?? null,
        body: t.body,
        documentType: t.documentType ?? null,
        isDefault: t.isDefault ?? false,
      },
    });
  }
  await prisma.invoiceTemplate.upsert({
    where: { key: "modern" },
    update: {},
    create: {
      key: "modern",
      name: "Modern",
      isDefault: true,
      config: { presets: LAYOUT_PRESETS.map((p) => ({ key: p.key, name: p.name })), columns: allColumns(), sections: DEFAULT_SECTIONS },
    },
  });
  console.log(`✓ ${DEFAULT_MESSAGE_TEMPLATES.length} message templates, 1 invoice template`);
}

async function seedHistoricalDocuments() {
  const admin = await prisma.user.findFirst({ where: { role: { key: "owner" } } });
  for (const h of HISTORICAL_DOCUMENTS) {
    let customer = await prisma.customer.findFirst({ where: { name: h.customer.name } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { ...h.customer, source: "Historical estimate", createdAt: h.source.date },
      });
      await prisma.activity.create({
        data: {
          type: "CUSTOMER_CREATED",
          description: `Customer imported from ${h.source.label}`,
          customerId: customer.id,
          entityType: "customer",
          entityId: customer.id,
          userId: admin?.id,
          createdAt: h.source.date,
        },
      });
    }
    const already = await prisma.activity.findFirst({
      where: { customerId: customer.id, type: "PROFORMA_CREATED", description: { contains: h.source.label } },
    });
    if (already) continue;

    const skus = h.groups.flatMap((g) => g.items.map((i) => i.sku)).filter((s): s is string => !!s);
    const products = await prisma.product.findMany({ where: { sku: { in: skus } } });
    const bySku = new Map(products.map((p) => [p.sku, p]));

    const input = documentInput.parse({
      type: "PROFORMA",
      customerId: customer.id,
      issueDate: h.source.date,
      status: "SENT",
      groups: h.groups.map((g) => ({
        name: g.name,
        items: g.items.map((i) => {
          const p = i.sku ? bySku.get(i.sku) : undefined;
          if (i.sku && !p) throw new Error(`Seed references unknown SKU ${i.sku}`);
          return {
            productId: p?.id ?? null,
            name: i.name,
            sku: p?.sku ?? null,
            unit: p?.unit ?? null,
            kind: p?.kind ?? null,
            attributes: i.attributes ?? {},
            quantity: String(i.qty),
            mrp: i.mrp === undefined ? null : String(i.mrp),
            rate: String(i.rate),
            taxRate: "0",
          };
        }),
      })),
      paymentTerms: "50% advance, 50% on the day of completion.",
      terms: h.terms,
      notes: null,
      layout: h.layout,
    });
    const doc = await createDocument(input, { userId: admin?.id, importedFrom: h.source.label });
    if (doc.grandTotal.toString() !== h.expectedTotal) {
      throw new Error(`${h.source.label}: computed ${doc.grandTotal} but the PDF says ${h.expectedTotal}`);
    }
    // Backdate the import activity to the estimate date so timelines read correctly.
    await prisma.activity.updateMany({ where: { documentId: doc.id }, data: { createdAt: h.source.date } });
    console.log(`✓ ${doc.number}  ${h.customer.name.padEnd(28)} ₹${doc.grandTotal}  (matches PDF)`);
  }
}

async function main() {
  await seedSettings();
  await seedUsers();
  await seedCatalog();
  await seedTemplates();
  await seedHistoricalDocuments();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
