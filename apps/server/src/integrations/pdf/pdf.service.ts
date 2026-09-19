import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer, { type Browser } from "puppeteer";
import { DOCUMENT_TYPE_LABEL, type RenderableDocument } from "@organo/shared";
import { DOCUMENT_CSS, DocumentRenderer, upiQrSvgFor } from "@organo/shared/invoice";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";

/**
 * Server-side PDF: renders the SAME React DocumentRenderer used by the POS
 * preview and public page into HTML, then prints it with headless Chrome.
 * A4, real page breaks, repeating table headers (thead), page numbers in the
 * footer. Long documents flow onto more pages instead of shrinking.
 */

const require = createRequire(import.meta.url);

let fontCss: string | null = null;
function geistFontCss(): string {
  if (fontCss !== null) return fontCss;
  try {
    // The package only exports JS entry points; locate its root via one and read the font file.
    const root = dirname(dirname(require.resolve("geist/font/sans")));
    const file = join(root, "dist/fonts/geist-sans/Geist-Variable.woff2");
    const b64 = readFileSync(file).toString("base64");
    fontCss = `@font-face{font-family:"Geist";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:100 900;font-style:normal;font-display:block;}`;
  } catch (err) {
    logger.warn({ err }, "Geist font not found; PDFs will use the system sans-serif");
    fontCss = "";
  }
  return fontCss;
}

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: true,
        executablePath: env.PUPPETEER_EXECUTABLE_PATH,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      })
      .then((b) => {
        b.on("disconnected", () => {
          browserPromise = null;
        });
        return b;
      })
      .catch((e) => {
        browserPromise = null;
        throw e;
      });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => undefined);
}

const ASSET_RE = /\/api\/public\/assets\/([A-Za-z0-9]+)/;

/** Inline our own stored assets (logo) as data URLs so rendering never needs the network. */
async function assetResolver(doc: RenderableDocument): Promise<(url: string) => string> {
  const urls = [doc.layout.header?.logoUrl, doc.business.logoUrl].filter((u): u is string => !!u);
  const map = new Map<string, string>();
  for (const url of urls) {
    const id = url.match(ASSET_RE)?.[1];
    if (!id || map.has(url)) continue;
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (asset) map.set(url, `data:${asset.mimeType};base64,${Buffer.from(asset.data).toString("base64")}`);
  }
  return (url) => map.get(url) ?? (url.startsWith("/") ? `${env.API_URL}${url}` : url);
}

export async function renderDocumentHtml(doc: RenderableDocument): Promise<string> {
  const [qr, resolveUrl] = await Promise.all([upiQrSvgFor(doc), assetResolver(doc)]);
  const body = renderToStaticMarkup(createElement(DocumentRenderer, { doc, upiQrSvg: qr, resolveUrl, withStyles: false }));
  const title = `${DOCUMENT_TYPE_LABEL[doc.type]} ${doc.number ?? ""}`.trim();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>${geistFontCss()}
@page { size: A4; }
html, body { margin: 0; padding: 0; background: #fff; }
${DOCUMENT_CSS}
</style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function generateDocumentPdf(doc: RenderableDocument): Promise<Buffer> {
  const html = await renderDocumentHtml(doc);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
    await page.evaluateHandle("document.fonts.ready");
    const label = escapeHtml(`${doc.business.name}  ·  ${DOCUMENT_TYPE_LABEL[doc.type]} ${doc.number ?? ""}`);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "14mm", bottom: "16mm", left: "13mm", right: "13mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="width:100%;padding:0 13mm;font-family:Helvetica,Arial,sans-serif;font-size:7pt;color:#8b9588;display:flex;justify-content:space-between;">
        <span>${label}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function pdfFilename(doc: RenderableDocument): string {
  const who = (doc.customer.name || "customer").replace(/[^A-Za-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
  return `${doc.number ?? DOCUMENT_TYPE_LABEL[doc.type]}-${who}.pdf`;
}
