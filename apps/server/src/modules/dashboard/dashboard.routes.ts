import { Router } from "express";
import { handler, ok } from "../../lib/http";
import { Prisma, prisma } from "../../lib/prisma";
import { serialize } from "../../lib/serialize";
import { refreshOverdue } from "../documents/documents.service";

export const dashboardRouter = Router();

const TZ = "Asia/Kolkata";
const D = Prisma.Decimal;
const dstr = (v: Prisma.Decimal | null | undefined) => (v ?? new D(0)).toString();

/** "Issued" invoices count as sales: drafts aren't issued yet, cancelled ones never happened. */
const ISSUED = Prisma.sql`d."type" = 'INVOICE' AND d."status" NOT IN ('DRAFT', 'CANCELLED')`;

dashboardRouter.get(
  "/",
  handler(async (_req, res) => {
    await refreshOverdue();

    const periodsP = prisma.$queryRaw<
      Array<{ total: Prisma.Decimal | null; month: Prisma.Decimal | null; week: Prisma.Decimal | null; today: Prisma.Decimal | null; lastMonth: Prisma.Decimal | null }>
    >`
      WITH now_ist AS (SELECT (NOW() AT TIME ZONE ${TZ}) AS n)
      SELECT
        SUM(d."grandTotal") AS total,
        SUM(d."grandTotal") FILTER (WHERE date_trunc('month', d."issueDate" AT TIME ZONE ${TZ}) = date_trunc('month', (SELECT n FROM now_ist))) AS month,
        SUM(d."grandTotal") FILTER (WHERE date_trunc('month', d."issueDate" AT TIME ZONE ${TZ}) = date_trunc('month', (SELECT n FROM now_ist)) - INTERVAL '1 month') AS "lastMonth",
        SUM(d."grandTotal") FILTER (WHERE date_trunc('week', d."issueDate" AT TIME ZONE ${TZ}) = date_trunc('week', (SELECT n FROM now_ist))) AS week,
        SUM(d."grandTotal") FILTER (WHERE (d."issueDate" AT TIME ZONE ${TZ})::date = (SELECT n FROM now_ist)::date) AS today
      FROM "Document" d WHERE ${ISSUED}`;

    const moneyP = prisma.$queryRaw<
      Array<{ outstanding: Prisma.Decimal | null; overdue: Prisma.Decimal | null; overdueCount: bigint; draftInvoices: Prisma.Decimal | null; pipeline: Prisma.Decimal | null; pipelineCount: bigint }>
    >`
      SELECT
        SUM(d."balanceDue") FILTER (WHERE ${ISSUED}) AS outstanding,
        SUM(d."balanceDue") FILTER (WHERE d."type" = 'INVOICE' AND d."status" = 'OVERDUE') AS overdue,
        COUNT(*) FILTER (WHERE d."type" = 'INVOICE' AND d."status" = 'OVERDUE') AS "overdueCount",
        SUM(d."grandTotal") FILTER (WHERE d."type" = 'INVOICE' AND d."status" = 'DRAFT') AS "draftInvoices",
        SUM(d."grandTotal") FILTER (WHERE d."type" = 'PROFORMA' AND d."status" IN ('DRAFT','SENT','VIEWED','NEGOTIATING','ACCEPTED')) AS pipeline,
        COUNT(*) FILTER (WHERE d."type" = 'PROFORMA' AND d."status" IN ('DRAFT','SENT','VIEWED','NEGOTIATING','ACCEPTED')) AS "pipelineCount"
      FROM "Document" d`;

    const paidP = prisma.$queryRaw<Array<{ total: Prisma.Decimal | null; month: Prisma.Decimal | null }>>`
      SELECT SUM(p.amount) AS total,
        SUM(p.amount) FILTER (WHERE date_trunc('month', p."paidAt" AT TIME ZONE ${TZ}) = date_trunc('month', NOW() AT TIME ZONE ${TZ})) AS month
      FROM "Payment" p WHERE p."voidedAt" IS NULL`;

    const countsP = prisma.$queryRaw<
      Array<{ invoices: bigint; proformas: bigint; proformasSent: bigint; proformasAccepted: bigint; proformasConverted: bigint; invoicesPaid: bigint; avgInvoice: Prisma.Decimal | null; avgProforma: Prisma.Decimal | null }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE ${ISSUED}) AS invoices,
        COUNT(*) FILTER (WHERE d."type" = 'PROFORMA') AS proformas,
        COUNT(*) FILTER (WHERE d."type" = 'PROFORMA' AND d."status" <> 'DRAFT') AS "proformasSent",
        COUNT(*) FILTER (WHERE d."type" = 'PROFORMA' AND d."status" IN ('ACCEPTED','CONVERTED')) AS "proformasAccepted",
        COUNT(*) FILTER (WHERE d."type" = 'PROFORMA' AND d."status" = 'CONVERTED') AS "proformasConverted",
        COUNT(*) FILTER (WHERE d."type" = 'INVOICE' AND d."status" = 'PAID') AS "invoicesPaid",
        AVG(d."grandTotal") FILTER (WHERE ${ISSUED}) AS "avgInvoice",
        AVG(d."grandTotal") FILTER (WHERE d."type" = 'PROFORMA') AS "avgProforma"
      FROM "Document" d`;

    // Last 12 months, including empty months, in India time.
    const revenueP = prisma.$queryRaw<Array<{ month: Date; invoiced: Prisma.Decimal | null; collected: Prisma.Decimal | null; quoted: Prisma.Decimal | null }>>`
      WITH months AS (
        SELECT generate_series(date_trunc('month', NOW() AT TIME ZONE ${TZ}) - INTERVAL '11 months', date_trunc('month', NOW() AT TIME ZONE ${TZ}), INTERVAL '1 month') AS month
      )
      SELECT m.month,
        (SELECT SUM(d."grandTotal") FROM "Document" d WHERE ${ISSUED} AND date_trunc('month', d."issueDate" AT TIME ZONE ${TZ}) = m.month) AS invoiced,
        (SELECT SUM(p.amount) FROM "Payment" p WHERE p."voidedAt" IS NULL AND date_trunc('month', p."paidAt" AT TIME ZONE ${TZ}) = m.month) AS collected,
        (SELECT SUM(d."grandTotal") FROM "Document" d WHERE d."type" = 'PROFORMA' AND date_trunc('month', d."issueDate" AT TIME ZONE ${TZ}) = m.month) AS quoted
      FROM months m ORDER BY m.month`;

    const topCustomersP = prisma.$queryRaw<Array<{ id: string; name: string; invoiced: Prisma.Decimal | null; quoted: Prisma.Decimal | null; docs: bigint }>>`
      SELECT c.id, c.name,
        SUM(d."grandTotal") FILTER (WHERE ${ISSUED}) AS invoiced,
        SUM(d."grandTotal") FILTER (WHERE d."type" = 'PROFORMA') AS quoted,
        COUNT(d.id) AS docs
      FROM "Customer" c JOIN "Document" d ON d."customerId" = c.id
      WHERE d."status" <> 'CANCELLED'
      GROUP BY c.id, c.name
      ORDER BY COALESCE(SUM(d."grandTotal") FILTER (WHERE ${ISSUED}), 0) DESC, SUM(d."grandTotal") DESC
      LIMIT 5`;

    // Product insight uses invoices when there are any, otherwise what's been quoted.
    const productFilter = Prisma.sql`(CASE WHEN EXISTS (SELECT 1 FROM "Document" x WHERE x."type" = 'INVOICE' AND x."status" NOT IN ('DRAFT', 'CANCELLED'))
      THEN (${ISSUED}) ELSE d."type" = 'PROFORMA' END)`;
    const topProductsP = prisma.$queryRaw<Array<{ name: string; productId: string | null; quantity: Prisma.Decimal; revenue: Prisma.Decimal }>>`
      SELECT COALESCE(p.name, i.name) AS name, i."productId", SUM(i.quantity) AS quantity, SUM(i.total) AS revenue
      FROM "DocumentItem" i JOIN "Document" d ON d.id = i."documentId" LEFT JOIN "Product" p ON p.id = i."productId"
      WHERE ${productFilter}
      GROUP BY COALESCE(p.name, i.name), i."productId"
      ORDER BY revenue DESC LIMIT 6`;
    const topCategoriesP = prisma.$queryRaw<Array<{ name: string; revenue: Prisma.Decimal }>>`
      SELECT COALESCE(cat.name, 'Custom lines') AS name, SUM(i.total) AS revenue
      FROM "DocumentItem" i JOIN "Document" d ON d.id = i."documentId"
      LEFT JOIN "Product" p ON p.id = i."productId" LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      WHERE ${productFilter}
      GROUP BY COALESCE(cat.name, 'Custom lines') ORDER BY revenue DESC LIMIT 6`;

    const customerStatsP = prisma.$queryRaw<Array<{ total: bigint; newMonth: bigint; returning: bigint; leads: bigint }>>`
      SELECT
        (SELECT COUNT(*) FROM "Customer" WHERE "archivedAt" IS NULL) AS total,
        (SELECT COUNT(*) FROM "Customer" WHERE date_trunc('month', "createdAt" AT TIME ZONE ${TZ}) = date_trunc('month', NOW() AT TIME ZONE ${TZ})) AS "newMonth",
        (SELECT COUNT(*) FROM (SELECT d."customerId" FROM "Document" d WHERE ${ISSUED} GROUP BY d."customerId" HAVING COUNT(*) > 1) r) AS returning,
        (SELECT COUNT(*) FROM "Customer" WHERE status IN ('LEAD','QUOTED') AND "archivedAt" IS NULL) AS leads`;

    const [[periods], [money], [paid], [counts], revenue, topCustomers, topProducts, topCategories, [customerStats]] = await Promise.all([
      periodsP,
      moneyP,
      paidP,
      countsP,
      revenueP,
      topCustomersP,
      topProductsP,
      topCategoriesP,
      customerStatsP,
    ]);
    const basis = Number(counts?.invoices ?? 0) > 0 ? "invoiced" : "quoted";

    const now = new Date();
    const istStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 5.5 * 3600_000);
    const [fuPending, fuOverdue, fuToday, fuCompletedWeek, dueFollowUps, recent] = await Promise.all([
      prisma.followUp.count({ where: { status: { in: ["PENDING", "SCHEDULED"] } } }),
      prisma.followUp.count({ where: { status: { in: ["PENDING", "SCHEDULED"] }, dueAt: { lt: istStart } } }),
      prisma.followUp.count({ where: { status: { in: ["PENDING", "SCHEDULED"] }, dueAt: { gte: istStart, lt: new Date(istStart.getTime() + 86_400_000) } } }),
      prisma.followUp.count({ where: { status: "COMPLETED", completedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
      prisma.followUp.findMany({
        where: { status: { in: ["PENDING", "SCHEDULED"] } },
        orderBy: { dueAt: "asc" },
        take: 5,
        include: { customer: { select: { id: true, name: true, phone: true } }, document: { select: { id: true, number: true, type: true } } },
      }),
      prisma.activity.findMany({
        where: { customerId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } }, document: { select: { id: true, number: true, type: true } } },
      }),
    ]);

    const n = (v: bigint | number | undefined) => Number(v ?? 0);
    const proformas = n(counts?.proformas);
    ok(res, {
      sales: {
        total: dstr(periods?.total),
        month: dstr(periods?.month),
        lastMonth: dstr(periods?.lastMonth),
        week: dstr(periods?.week),
        today: dstr(periods?.today),
      },
      money: {
        outstanding: dstr(money?.outstanding),
        overdue: dstr(money?.overdue),
        overdueCount: n(money?.overdueCount),
        paid: dstr(paid?.total),
        paidMonth: dstr(paid?.month),
        draftInvoices: dstr(money?.draftInvoices),
        pipeline: dstr(money?.pipeline),
        pipelineCount: n(money?.pipelineCount),
      },
      counts: {
        invoices: n(counts?.invoices),
        proformas,
        avgInvoice: dstr(counts?.avgInvoice?.toDecimalPlaces(0)),
        avgProforma: dstr(counts?.avgProforma?.toDecimalPlaces(0)),
        conversionRate: proformas ? n(counts?.proformasConverted) / proformas : null,
      },
      funnel: [
        { stage: "Proformas", count: proformas },
        { stage: "Sent", count: n(counts?.proformasSent) },
        { stage: "Accepted", count: n(counts?.proformasAccepted) },
        { stage: "Invoiced", count: n(counts?.proformasConverted) },
        { stage: "Paid", count: n(counts?.invoicesPaid) },
      ],
      revenue: revenue.map((r) => ({ month: r.month.toISOString().slice(0, 7), invoiced: dstr(r.invoiced), collected: dstr(r.collected), quoted: dstr(r.quoted) })),
      customers: {
        total: n(customerStats?.total),
        newThisMonth: n(customerStats?.newMonth),
        returning: n(customerStats?.returning),
        leads: n(customerStats?.leads),
        top: topCustomers.map((c) => ({ id: c.id, name: c.name, invoiced: dstr(c.invoiced), quoted: dstr(c.quoted), documents: n(c.docs) })),
      },
      products: {
        basis,
        top: topProducts.map((p) => ({ name: p.name, productId: p.productId, quantity: p.quantity.toString(), revenue: p.revenue.toString() })),
        categories: topCategories.map((c) => ({ name: c.name, revenue: c.revenue.toString() })),
      },
      followups: { pending: fuPending, overdue: fuOverdue, today: fuToday, completedWeek: fuCompletedWeek, next: serialize(dueFollowUps) },
      recent: serialize(recent),
    });
  }),
);
