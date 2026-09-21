import { DOCUMENT_TYPE_LABEL, documentTemplateVars, renderTemplate, type RenderableDocument, type TemplateVars } from "@organo/shared";
import type { EmailMessage } from "../../integrations/email/email.service";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function varsForDocument(
  doc: RenderableDocument,
  link: string,
  opts: { salesperson?: string | null } = {},
): TemplateVars {
  return documentTemplateVars({
    type: doc.type,
    number: doc.number ?? "",
    grandTotal: doc.totals.grandTotal,
    balanceDue: doc.totals.balanceDue,
    customerName: doc.customer.name,
    link,
    businessName: doc.business.name,
    businessPhone: doc.business.phone,
    salesperson: opts.salesperson,
    dueDate: doc.type === "INVOICE" ? doc.dueDate : doc.validUntil,
    upiId: doc.business.upiId,
  });
}

export function renderPair(tpl: { subject: string | null; body: string }, vars: TemplateVars) {
  return { subject: tpl.subject ? renderTemplate(tpl.subject, vars) : null, body: renderTemplate(tpl.body, vars) };
}

/**
 * Branded, email-client-safe HTML around the (plain-text) message the user edited.
 * Tables + inline styles only; renders in Gmail, Outlook and Apple Mail.
 */
export function buildDocumentEmail(input: {
  doc: RenderableDocument;
  to: string;
  subject: string;
  body: string;
  link: string;
  logoUrl?: string | null;
  replyTo?: string | null;
  pdf?: { name: string; base64: string } | null;
}): EmailMessage {
  const { doc } = input;
  const label = DOCUMENT_TYPE_LABEL[doc.type];
  const paragraphs = input.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f7f1;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c2419">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f1;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e3e8df;border-radius:12px">
<tr><td style="padding:24px 28px 8px">${
    input.logoUrl
      ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(doc.business.name)}" height="40" style="display:block;height:40px;width:auto;border:0">`
      : `<div style="font-size:18px;font-weight:700;color:#33521f">${escapeHtml(doc.business.name)}</div>`
  }</td></tr>
<tr><td style="padding:16px 28px 4px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:4px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f4f7f1;border-radius:10px"><tr>
    <td style="padding:14px 16px;font-size:13px;color:#5f6b5c">${escapeHtml(label)}<br><strong style="font-size:15px;color:#1c2419">${escapeHtml(doc.number ?? "")}</strong></td>
    <td align="right" style="padding:14px 16px;font-size:13px;color:#5f6b5c">Amount<br><strong style="font-size:15px;color:#1c2419">${escapeHtml(varsForDocument(doc, input.link).amount ?? "")}</strong></td>
  </tr></table>
</td></tr>
<tr><td style="padding:12px 28px 28px"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#4b7330;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">View ${escapeHtml(label.toLowerCase())}</a></td></tr>
</table>
<p style="font-size:12px;color:#8b9588;margin:14px 0 0">${escapeHtml([doc.business.name, doc.business.phone, doc.business.gstNumber ? `GSTIN ${doc.business.gstNumber}` : null].filter(Boolean).join("  |  "))}</p>
</td></tr></table></body></html>`;

  return {
    to: [{ email: input.to, name: doc.customer.name || undefined }],
    subject: input.subject,
    text: `${input.body.trim()}\n\n${label} ${doc.number}: ${input.link}`,
    html,
    ...(input.replyTo ? { replyTo: { email: input.replyTo, name: doc.business.name } } : {}),
    ...(input.pdf ? { attachments: [{ name: input.pdf.name, content: input.pdf.base64 }] } : {}),
    tags: [doc.type.toLowerCase()],
  };
}
