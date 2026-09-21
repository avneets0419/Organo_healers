import type { DocumentType, MessageChannel } from "@prisma/client";
import { DOCUMENT_TYPE_LABEL, formatPhone } from "@organo/shared";
import { env } from "../../config/env";
import { emailService } from "../../integrations/email/brevo.service";
import { EmailNotConfiguredError, EmailProviderError } from "../../integrations/email/email.service";
import { generateDocumentPdf, pdfFilename } from "../../integrations/pdf/pdf.service";
import { logActivity } from "../../lib/activity";
import { ApiError } from "../../lib/http";
import { logger } from "../../lib/logger";
import { prisma, type Tx } from "../../lib/prisma";
import { syncCustomerStatus } from "../customers/customer-status";
import { documentInclude, refreshPaymentStatus, toRenderable } from "../documents/documents.service";
import { getSettings } from "../settings/settings.service";
import { buildDocumentEmail, renderPair, varsForDocument } from "./compose";

export function publicLink(token: string) {
  return `${env.APP_URL}/i/${token}`;
}

async function loadDoc(id: string) {
  const doc = await prisma.document.findUnique({ where: { id }, include: documentInclude });
  if (!doc) throw ApiError.notFound("Document");
  return doc;
}

async function templatesFor(channel: MessageChannel, type: DocumentType) {
  const all = await prisma.messageTemplate.findMany({ where: { channel, active: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  // Templates for this document type first, then general ones; the default for this type wins.
  return all
    .filter((t) => !t.documentType || t.documentType === type)
    .sort((a, b) => Number(b.documentType === type && b.isDefault) - Number(a.documentType === type && a.isDefault))
    .map((t) => ({ ...t, isDefault: t.documentType === type && t.isDefault }));
}

export async function composeForDocument(id: string, userName?: string) {
  const [doc, settings] = await Promise.all([loadDoc(id), getSettings()]);
  const r = toRenderable(doc);
  const link = publicLink(doc.publicToken);
  const vars = varsForDocument(r, link, { salesperson: settings.salespersonName ?? userName });
  const [emailT, waT] = await Promise.all([templatesFor("EMAIL", doc.type), templatesFor("WHATSAPP", doc.type)]);
  const render = (ts: typeof emailT) => ts.map((t) => ({ key: t.key, name: t.name, isDefault: t.isDefault, ...renderPair(t, vars) }));
  return {
    number: doc.number,
    type: doc.type,
    link,
    customerName: doc.customer.name,
    email: { to: doc.customer.email, configured: emailService.configured, templates: render(emailT) },
    whatsapp: { phone: doc.customer.phone, templates: render(waT) },
  };
}

/** First outbound message moves a draft to SENT. */
async function markSent(tx: Tx, doc: { id: string; type: DocumentType; status: string; sentAt: Date | null; customerId: string }) {
  if (doc.status === "DRAFT") {
    await tx.document.update({ where: { id: doc.id }, data: { status: "SENT", sentAt: doc.sentAt ?? new Date() } });
    if (doc.type === "INVOICE") await refreshPaymentStatus(tx, doc.id);
  } else if (!doc.sentAt) {
    await tx.document.update({ where: { id: doc.id }, data: { sentAt: new Date() } });
  }
  await syncCustomerStatus(tx, doc.customerId);
}

export async function sendDocumentEmail(
  id: string,
  input: { to: string; subject: string; body: string; attachPdf: boolean },
  userId?: string,
) {
  if (!emailService.configured) throw ApiError.notConfigured(new EmailNotConfiguredError().message);
  const [doc, settings] = await Promise.all([loadDoc(id), getSettings()]);
  if (doc.status === "CANCELLED") throw ApiError.conflict("A cancelled document can't be sent");
  const r = toRenderable(doc);
  const link = publicLink(doc.publicToken);

  let pdf: { name: string; base64: string } | null = null;
  if (input.attachPdf) {
    try {
      pdf = { name: pdfFilename(r), base64: (await generateDocumentPdf(r)).toString("base64") };
    } catch (err) {
      logger.error({ err, documentId: id }, "PDF generation failed for email");
      throw new ApiError(500, "Couldn't generate the PDF attachment. Try again, or send without the PDF.");
    }
  }

  const logoUrl = r.business.logoUrl?.startsWith("/") ? `${env.APP_URL}${r.business.logoUrl}` : r.business.logoUrl;
  const message = buildDocumentEmail({ doc: r, to: input.to, subject: input.subject, body: input.body, link, logoUrl, replyTo: settings.emailReplyTo ?? settings.email, pdf });

  try {
    const result = await emailService.send(message, settings.emailSenderName ?? settings.businessName);
    await prisma.$transaction(async (tx) => {
      await tx.messageLog.create({
        data: { channel: "EMAIL", status: "SENT", to: input.to, subject: input.subject, body: input.body, providerMessageId: result.messageId, documentId: id, customerId: doc.customerId, userId },
      });
      await logActivity(tx, {
        type: doc.type === "INVOICE" ? "INVOICE_SENT" : "PROFORMA_SENT",
        description: `${doc.number} emailed to ${input.to}${pdf ? " with PDF" : ""}`,
        customerId: doc.customerId,
        documentId: id,
        entityType: "document",
        entityId: id,
        metadata: { channel: "EMAIL", to: input.to, messageId: result.messageId },
        userId,
      });
      await logActivity(tx, {
        type: "EMAIL_SENT",
        description: `Email "${input.subject}" sent to ${input.to}`,
        customerId: doc.customerId,
        documentId: id,
        entityType: "document",
        entityId: id,
        metadata: { provider: emailService.provider, messageId: result.messageId },
        userId,
      });
      await markSent(tx, doc);
    });
    return { messageId: result.messageId };
  } catch (err) {
    const msg = err instanceof EmailProviderError ? err.message : "Email provider error";
    await prisma.$transaction(async (tx) => {
      await tx.messageLog.create({
        data: { channel: "EMAIL", status: "FAILED", to: input.to, subject: input.subject, body: input.body, error: msg, documentId: id, customerId: doc.customerId, userId },
      });
      await logActivity(tx, {
        type: "EMAIL_FAILED",
        description: `Email to ${input.to} failed: ${msg}`,
        customerId: doc.customerId,
        documentId: id,
        entityType: "document",
        entityId: id,
        userId,
        touchCustomer: false,
      });
    });
    if (err instanceof EmailProviderError) throw new ApiError(502, msg, undefined, "EMAIL_FAILED");
    logger.error({ err }, "Unexpected email error");
    throw new ApiError(502, "The email provider didn't accept the message. Try again shortly.", undefined, "EMAIL_FAILED");
  }
}

/**
 * The browser opened a wa.me chat with a prefilled message. We record exactly
 * that ("opened"), never "sent": only the person in WhatsApp knows if they pressed send.
 */
export async function logWhatsAppOpened(id: string, input: { phone: string; message: string; templateKey?: string }, userId?: string) {
  const doc = await loadDoc(id);
  await prisma.$transaction(async (tx) => {
    await tx.messageLog.create({
      data: { channel: "WHATSAPP", status: "OPENED", to: input.phone, body: input.message, documentId: id, customerId: doc.customerId, userId },
    });
    await logActivity(tx, {
      type: "WHATSAPP_OPENED",
      description: `WhatsApp opened for ${formatPhone(input.phone)} with ${DOCUMENT_TYPE_LABEL[doc.type].toLowerCase()} ${doc.number}`,
      customerId: doc.customerId,
      documentId: id,
      entityType: "document",
      entityId: id,
      metadata: { phone: input.phone, templateKey: input.templateKey ?? null },
      userId,
    });
  });
  return { logged: true };
}

/** The user confirms they actually pressed send in WhatsApp. */
export async function confirmWhatsAppSent(id: string, userId?: string) {
  const doc = await loadDoc(id);
  const opened = await prisma.messageLog.findFirst({ where: { documentId: id, channel: "WHATSAPP", status: "OPENED" }, orderBy: { createdAt: "desc" } });
  await prisma.$transaction(async (tx) => {
    if (opened) await tx.messageLog.update({ where: { id: opened.id }, data: { status: "SENT" } });
    await logActivity(tx, {
      type: "WHATSAPP_SENT",
      description: `WhatsApp message for ${doc.number} confirmed as sent`,
      customerId: doc.customerId,
      documentId: id,
      entityType: "document",
      entityId: id,
      metadata: { confirmedByUser: true, phone: opened?.to ?? null },
      userId,
    });
    await logActivity(tx, {
      type: doc.type === "INVOICE" ? "INVOICE_SENT" : "PROFORMA_SENT",
      description: `${doc.number} sent on WhatsApp`,
      customerId: doc.customerId,
      documentId: id,
      entityType: "document",
      entityId: id,
      metadata: { channel: "WHATSAPP" },
      userId,
    });
    await markSent(tx, doc);
  });
  return { confirmed: true };
}
