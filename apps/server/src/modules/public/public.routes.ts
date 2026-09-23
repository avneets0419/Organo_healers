import { createHash } from "node:crypto";
import { Router } from "express";
import { ApiError, handler, ok, param } from "../../lib/http";
import { logActivity } from "../../lib/activity";
import { prisma } from "../../lib/prisma";
import { publicLimiter } from "../../middleware/rateLimit";
import { syncCustomerStatus } from "../customers/customer-status";
import { documentInclude, toRenderable } from "../documents/documents.service";
import { generateDocumentPdf, pdfFilename } from "../../integrations/pdf/pdf.service";
import { logger } from "../../lib/logger";

export const publicRouter = Router();
publicRouter.use(publicLimiter);

/** Logo / product images stored in Postgres. Content-addressed by id, cache forever. */
publicRouter.get(
  "/assets/:id",
  handler(async (req, res) => {
    const asset = await prisma.asset.findUnique({ where: { id: param(req, "id") } });
    if (!asset) throw ApiError.notFound("Asset");
    res.setHeader("Content-Type", asset.mimeType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(Buffer.from(asset.data));
  }),
);

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

async function findByToken(token: string) {
  if (!TOKEN_RE.test(token)) throw ApiError.notFound("Document");
  const doc = await prisma.document.findUnique({ where: { publicToken: token }, include: documentInclude });
  if (!doc) throw ApiError.notFound("Document");
  return doc;
}

/**
 * Public document by unguessable token. Records a view (and flips SENT -> VIEWED
 * for proformas) unless the viewer is signed-in staff previewing the link.
 */
publicRouter.get(
  "/documents/:token",
  handler(async (req, res) => {
    const doc = await findByToken(param(req, "token"));
    if (!req.user && doc.status !== "DRAFT") {
      const ipHash = createHash("sha256").update(`${req.ip}|${doc.id}`).digest("hex").slice(0, 32);
      const recent = await prisma.documentView.findFirst({
        where: { documentId: doc.id, ipHash, viewedAt: { gt: new Date(Date.now() - 30 * 60_000) } },
      });
      if (!recent) {
        await prisma.$transaction(async (tx) => {
          await tx.documentView.create({ data: { documentId: doc.id, ipHash, userAgent: req.get("user-agent")?.slice(0, 300) } });
          const first = !doc.viewedAt;
          await tx.document.update({
            where: { id: doc.id },
            data: {
              viewedAt: doc.viewedAt ?? new Date(),
              ...(doc.type === "PROFORMA" && doc.status === "SENT" ? { status: "VIEWED" } : {}),
            },
          });
          if (first) {
            await logActivity(tx, {
              type: doc.type === "INVOICE" ? "INVOICE_VIEWED" : "PROFORMA_VIEWED",
              description: `${doc.customer.name} opened ${doc.number}`,
              customerId: doc.customerId,
              documentId: doc.id,
              entityType: "document",
              entityId: doc.id,
              touchCustomer: false,
            });
          }
          await syncCustomerStatus(tx, doc.customerId);
        });
      }
    }
    res.setHeader("Cache-Control", "no-store");
    ok(res, { document: toRenderable(doc), token: doc.publicToken });
  }),
);

publicRouter.get(
  "/documents/:token/pdf",
  handler(async (req, res) => {
    const doc = await findByToken(param(req, "token"));
    const r = toRenderable(doc);
    let pdf: Buffer;
    try {
      pdf = await generateDocumentPdf(r);
    } catch (err) {
      logger.error({ err }, "Public PDF generation failed");
      throw new ApiError(500, "Couldn't generate the PDF. Please try again.");
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${pdfFilename(r)}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  }),
);
