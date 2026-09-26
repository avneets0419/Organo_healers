import QRCode from "qrcode";
import { buildUpiUri } from "../upi";
import type { RenderableDocument } from "../snapshot";

export { DocumentRenderer, type DocumentRendererProps } from "./DocumentRenderer";
export { DOCUMENT_CSS } from "./styles";

/** QR code (SVG markup) for paying this document via UPI, or null if no UPI ID is set. */
export async function upiQrSvgFor(doc: RenderableDocument): Promise<string | null> {
  if (!doc.business.upiId || !doc.layout.sections.showUpiQr) return null;
  const amount = doc.type === "INVOICE" ? doc.totals.balanceDue : doc.totals.grandTotal;
  const uri = buildUpiUri({ upiId: doc.business.upiId, payeeName: doc.business.name, amount, note: doc.number ?? undefined });
  return QRCode.toString(uri, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1c2419", light: "#ffffff00" } });
}
