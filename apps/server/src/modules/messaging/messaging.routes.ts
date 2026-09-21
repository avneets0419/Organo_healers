import { Router } from "express";
import { phoneInput } from "@organo/shared";
import { z } from "zod";
import { generateDocumentPdf, pdfFilename } from "../../integrations/pdf/pdf.service";
import { ApiError, handler, ok, param, parse } from "../../lib/http";
import { logger } from "../../lib/logger";
import { requirePermission } from "../../middleware/auth";
import { sendLimiter } from "../../middleware/rateLimit";
import { getDocument, toRenderable } from "../documents/documents.service";
import { composeForDocument, confirmWhatsAppSent, logWhatsAppOpened, sendDocumentEmail } from "./messaging.service";

/** Mounted at /api/documents alongside the documents router. */
export const messagingRouter = Router();

messagingRouter.get(
  "/:id/compose",
  handler(async (req, res) => ok(res, await composeForDocument(param(req, "id"), req.user?.name))),
);

messagingRouter.post(
  "/:id/send-email",
  sendLimiter,
  requirePermission("documents:send"),
  handler(async (req, res) => {
    const input = parse(
      z.object({
        to: z.email("Enter a valid email address"),
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(10_000),
        attachPdf: z.boolean().default(true),
      }),
      req.body,
    );
    ok(res, await sendDocumentEmail(param(req, "id"), input, req.user?.id));
  }),
);

messagingRouter.post(
  "/:id/whatsapp-opened",
  sendLimiter,
  requirePermission("documents:send"),
  handler(async (req, res) => {
    const input = parse(
      z.object({ phone: phoneInput.refine((v) => !!v, "Phone is required"), message: z.string().trim().min(1).max(4000), templateKey: z.string().max(60).optional() }),
      req.body,
    );
    ok(res, await logWhatsAppOpened(param(req, "id"), { ...input, phone: input.phone! }, req.user?.id));
  }),
);

messagingRouter.post(
  "/:id/whatsapp-confirmed",
  requirePermission("documents:send"),
  handler(async (req, res) => ok(res, await confirmWhatsAppSent(param(req, "id"), req.user?.id))),
);

messagingRouter.get(
  "/:id/pdf",
  handler(async (req, res) => {
    const doc = await getDocument(param(req, "id"));
    const r = toRenderable(doc);
    let pdf: Buffer;
    try {
      pdf = await generateDocumentPdf(r);
    } catch (err) {
      logger.error({ err, documentId: doc.id }, "PDF generation failed");
      throw new ApiError(500, "Couldn't generate the PDF. Please try again.");
    }
    const disposition = req.query.download ? "attachment" : "inline";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${pdfFilename(r)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(pdf);
  }),
);
