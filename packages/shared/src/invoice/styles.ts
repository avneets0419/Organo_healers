/**
 * Stylesheet for the document renderer. Plain CSS (no Tailwind) so the exact
 * same rules apply in the POS preview, the public page and the server PDF.
 * Everything is scoped under .ohd and sized for A4 (210mm) paper.
 */
export const DOCUMENT_CSS = /* css */ `
.ohd {
  --ohd-ink: #1c2419;
  --ohd-muted: #5f6b5c;
  --ohd-faint: #8b9588;
  --ohd-line: #e3e8df;
  --ohd-line-strong: #cfd8ca;
  --ohd-wash: #f4f7f1;
  --ohd-brand: #4b7330;
  --ohd-brand-ink: #33521f;
  --ohd-brown: #6b4419;
  box-sizing: border-box;
  width: 210mm;
  min-height: 297mm;
  padding: 14mm 14mm 16mm;
  background: #ffffff;
  color: var(--ohd-ink);
  font-family: "Geist", var(--font-geist-sans, ui-sans-serif), system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 9.5pt;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.ohd *, .ohd *::before, .ohd *::after { box-sizing: border-box; }
.ohd p { margin: 0; }
.ohd .ohd-num { font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Header */
.ohd-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10mm; align-items: start; }
.ohd-logo { display: block; height: 15mm; width: auto; max-width: 70mm; object-fit: contain; object-position: left center; }
.ohd-bizname { font-size: 15pt; font-weight: 650; letter-spacing: -0.01em; color: var(--ohd-brand-ink); }
.ohd-tagline { font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ohd-brown); font-weight: 600; }
.ohd-bizmeta { margin-top: 3mm; color: var(--ohd-muted); font-size: 8.5pt; line-height: 1.5; }
.ohd-bizmeta strong { color: var(--ohd-ink); font-weight: 550; }
.ohd-docmeta { text-align: right; }
.ohd-doctype { font-size: 17pt; font-weight: 650; letter-spacing: -0.015em; line-height: 1.1; }
.ohd-docnum { margin-top: 1.2mm; font-size: 10pt; font-weight: 550; color: var(--ohd-brand-ink); }
.ohd-docnum.is-draft { color: var(--ohd-faint); font-weight: 500; }
.ohd-dates { margin-top: 3.5mm; display: grid; grid-template-columns: auto auto; gap: 0.8mm 5mm; justify-content: end; font-size: 8.5pt; }
.ohd-dates dt { color: var(--ohd-muted); text-align: right; }
.ohd-dates dd { margin: 0; font-weight: 550; text-align: right; }

.ohd-rule { height: 0; border: 0; border-top: 1.4pt solid var(--ohd-brand); margin: 6mm 0 5mm; }

/* Parties */
.ohd-parties { display: grid; grid-template-columns: repeat(var(--ohd-party-cols, 2), minmax(0, 1fr)); gap: 8mm; }
.ohd-label { font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ohd-faint); font-weight: 600; margin-bottom: 1.4mm; }
.ohd-party-name { font-size: 11pt; font-weight: 600; letter-spacing: -0.005em; }
.ohd-party-line { color: var(--ohd-muted); font-size: 8.8pt; white-space: pre-line; }
.ohd-title { margin-top: 5mm; font-size: 10pt; font-weight: 550; }

/* Items */
.ohd-table { width: 100%; border-collapse: collapse; margin-top: 6mm; table-layout: fixed; }
.ohd-table thead { display: table-header-group; }
.ohd-table th {
  font-size: 7.5pt; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--ohd-muted); padding: 2.2mm 2mm; border-bottom: 1pt solid var(--ohd-line-strong);
  background: var(--ohd-wash);
}
.ohd-table th:first-child { border-top-left-radius: 1.5mm; }
.ohd-table th:last-child { border-top-right-radius: 1.5mm; }
.ohd-table td { padding: 1.75mm 2mm; border-bottom: 0.6pt solid var(--ohd-line); vertical-align: top; }
.ohd-table tr { break-inside: avoid; page-break-inside: avoid; }
.ohd-al-left { text-align: left; }
.ohd-al-center { text-align: center; }
.ohd-al-right { text-align: right; }
.ohd-item-name { font-weight: 500; }
.ohd-item-sub { color: var(--ohd-faint); font-size: 8pt; margin-top: 0.4mm; }
.ohd-sr { color: var(--ohd-faint); }
.ohd-dash { color: var(--ohd-faint); }

.ohd-group td { border-bottom: 0; padding-top: 4mm; padding-bottom: 1mm; }
.ohd-group-name { font-size: 9pt; font-weight: 650; letter-spacing: 0.02em; color: var(--ohd-brand-ink); }
.ohd-group-notes { font-size: 8pt; color: var(--ohd-muted); margin-top: 0.6mm; text-transform: none; letter-spacing: 0; font-weight: 400; }
.ohd-group-first td { padding-top: 2.5mm; }
.ohd-subtotal td { border-bottom: 0; padding-top: 1.6mm; padding-bottom: 1mm; font-size: 8.5pt; color: var(--ohd-muted); }
.ohd-subtotal .ohd-num { color: var(--ohd-ink); font-weight: 600; }

/* Summary */
.ohd-summary { display: grid; grid-template-columns: minmax(0, 1fr) 72mm; gap: 10mm; margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
.ohd-words { font-size: 8.5pt; color: var(--ohd-muted); }
.ohd-words strong { display: block; color: var(--ohd-ink); font-weight: 550; margin-top: 0.8mm; }
.ohd-savings { margin-top: 3mm; display: inline-block; padding: 1.2mm 2.4mm; border-radius: 1.2mm; background: var(--ohd-wash); color: var(--ohd-brand-ink); font-size: 8.5pt; font-weight: 550; }
.ohd-totals { width: 100%; border-collapse: collapse; }
.ohd-totals td { padding: 1.1mm 0; font-size: 9pt; }
.ohd-totals td:last-child { text-align: right; }
.ohd-totals .ohd-t-muted td { color: var(--ohd-muted); }
.ohd-totals .ohd-t-grand td { border-top: 1pt solid var(--ohd-ink); padding-top: 2.4mm; font-size: 12.5pt; font-weight: 650; letter-spacing: -0.01em; }
.ohd-totals .ohd-t-balance td { font-weight: 600; color: var(--ohd-brand-ink); }

/* Footer blocks */
.ohd-blocks { display: grid; grid-template-columns: repeat(var(--ohd-block-cols, 2), minmax(0, 1fr)); gap: 8mm; margin-top: 7mm; break-inside: avoid; page-break-inside: avoid; }
.ohd-block { border-top: 0.6pt solid var(--ohd-line-strong); padding-top: 3mm; }
.ohd-block p, .ohd-block li { font-size: 8.5pt; color: var(--ohd-ink); }
.ohd-block ul { margin: 0; padding-left: 3.6mm; }
.ohd-block li + li { margin-top: 0.8mm; }
.ohd-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.6mm 3mm; font-size: 8.5pt; }
.ohd-kv dt { color: var(--ohd-muted); }
.ohd-kv dd { margin: 0; font-weight: 500; word-break: break-word; }
.ohd-pay { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4mm; align-items: start; }
.ohd-qr { width: 24mm; height: 24mm; }
.ohd-qr svg { width: 100%; height: 100%; display: block; }
.ohd-qr-cap { font-size: 7pt; color: var(--ohd-faint); text-align: center; margin-top: 0.6mm; }
.ohd-custom { margin-top: 6mm; font-size: 8.5pt; color: var(--ohd-muted); white-space: pre-line; }
.ohd-sign { margin-top: 4mm; display: flex; justify-content: flex-end; break-inside: avoid; page-break-inside: avoid; }
.ohd-sign-box { width: 60mm; text-align: center; }
.ohd-sign-line { border-top: 0.8pt solid var(--ohd-ink); margin-top: 9mm; padding-top: 1.4mm; font-size: 8pt; color: var(--ohd-muted); }
.ohd-sign-for { font-size: 8.5pt; font-weight: 550; }
.ohd-foot { margin-top: 6mm; padding-top: 3mm; border-top: 0.6pt solid var(--ohd-line); text-align: center; font-size: 8pt; color: var(--ohd-faint); }
.ohd-empty { padding: 10mm 0; text-align: center; color: var(--ohd-faint); }

@media print {
  .ohd { width: auto; min-height: 0; padding: 0; }
}
`;
