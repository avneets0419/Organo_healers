/** @jsxRuntime automatic */
/** @jsxImportSource react */
// Pragma pins the automatic JSX runtime for every consumer (Next, tsx, tsup, vitest).
import type { CSSProperties, ReactNode } from "react";
import { DOCUMENT_TYPE_LABEL } from "../enums";
import type { ColumnConfig } from "../layout";
import { D, dec, formatINR, formatQty } from "../money";
import { formatPhone } from "../phone";
import type { RenderableDocument, RenderableItem } from "../snapshot";
import { formatDisplayDate } from "../templates";
import { amountInWords } from "../words";
import { DOCUMENT_CSS } from "./styles";

export interface DocumentRendererProps {
  doc: RenderableDocument;
  /** Pre-rendered SVG markup for the UPI QR (caller generates it). */
  upiQrSvg?: string | null;
  /** Resolve relative asset URLs (e.g. /api/public/assets/..) for server rendering. */
  resolveUrl?: (url: string) => string;
  /** Inject the stylesheet. Disable when the page already includes DOCUMENT_CSS. */
  withStyles?: boolean;
  className?: string;
  style?: CSSProperties;
}

const money = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? null : formatINR(v));

function attr(item: RenderableItem, key: string): string | null {
  const v = item.attributes?.[key];
  return v === null || v === undefined || v === "" ? null : String(v);
}

function cell(col: ColumnConfig, item: RenderableItem, index: number): ReactNode {
  const dash = <span className="ohd-dash">-</span>;
  switch (col.key) {
    case "sr":
      return <span className="ohd-sr">{index + 1}</span>;
    case "item":
      return (
        <>
          <div className="ohd-item-name">{item.name}</div>
          {item.description && <div className="ohd-item-sub">{item.description}</div>}
        </>
      );
    case "description":
      return item.description ?? dash;
    case "bagSize":
      return attr(item, "bagSize") ?? dash;
    case "height":
      return attr(item, "height") ?? dash;
    case "size":
      return attr(item, "potSize") ?? attr(item, "dimensions") ?? attr(item, "size") ?? dash;
    case "qty":
      return <span className="ohd-num">{formatQty(item.quantity)}</span>;
    case "unit":
      return item.unit ?? dash;
    case "mrp":
      return item.mrp && dec(item.mrp).gt(0) ? <span className="ohd-num">{formatINR(item.mrp)}</span> : dash;
    case "rate":
      return <span className="ohd-num">{formatINR(item.rate)}</span>;
    case "discount":
      if (!dec(item.discountAmount).gt(0)) return dash;
      return (
        <span className="ohd-num">
          {item.discountType === "PERCENT" && item.discountValue ? `${formatQty(item.discountValue)}%` : formatINR(item.discountAmount)}
        </span>
      );
    case "tax":
      return dec(item.taxRate).gt(0) ? <span className="ohd-num">{formatQty(item.taxRate)}%</span> : dash;
    case "total":
      return <span className="ohd-num">{formatINR(item.total)}</span>;
  }
}

function mrpSavings(doc: RenderableDocument) {
  let saved = new D(0);
  for (const g of doc.groups)
    for (const it of g.items) {
      if (!it.mrp) continue;
      const diff = dec(it.mrp).minus(it.rate);
      if (diff.gt(0)) saved = saved.plus(diff.mul(it.quantity));
    }
  return saved;
}

function lines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);
}

/**
 * The single source of truth for how an Organo Healers document looks.
 * Used by the POS live preview, the public link page and the server PDF.
 */
export function DocumentRenderer({ doc, upiQrSvg, resolveUrl = (u) => u, withStyles = true, className, style }: DocumentRendererProps) {
  const L = doc.layout;
  const S = L.sections;
  const H = L.header ?? {};
  const b = doc.business;
  const c = doc.customer;
  const cols = L.columns.filter((col) => col.visible);
  const totalWeight = cols.reduce((s, col) => s + col.width, 0) || 1;
  const t = doc.totals;
  const isInvoice = doc.type === "INVOICE";

  const bizName = H.businessName ?? b.name;
  const tagline = H.tagline ?? b.tagline;
  const logo = H.logoUrl ?? b.logoUrl;
  const gst = H.gstNumber ?? b.gstNumber;
  const address = H.address ?? b.address;
  const phone = H.phone ?? (b.phone ? formatPhone(b.phone) : null);
  const email = H.email ?? b.email;

  const showShip = S.showShippingAddress && !!c.shippingAddress;
  const savings = S.showMrpSavings ? mrpSavings(doc) : new D(0);
  const hasPayments = dec(t.amountPaid).gt(0);
  const notes = S.showNotes ? lines(doc.notes) : [];
  const terms = [...(S.showPaymentTerms ? lines(doc.paymentTerms) : []), ...(S.showTerms ? lines(doc.terms) : [])];
  const bank = S.showBankDetails && (b.accountNumber || b.ifsc);
  const upi = S.showUpiDetails && b.upiId;
  const blockCount = [notes.length || terms.length, bank || upi].filter(Boolean).length;
  const nonEmptyGroups = doc.groups.filter((g) => g.items.length > 0 || g.name);

  return (
    <div className={["ohd", className].filter(Boolean).join(" ")} style={style}>
      {withStyles && <style dangerouslySetInnerHTML={{ __html: DOCUMENT_CSS }} />}

      <header className="ohd-head">
        <div>
          {S.showLogo && logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ohd-logo" src={resolveUrl(logo)} alt={bizName} />
          ) : (
            <>
              <div className="ohd-bizname">{bizName}</div>
              {tagline && <div className="ohd-tagline">{tagline}</div>}
            </>
          )}
          <div className="ohd-bizmeta">
            {b.legalName && b.legalName !== bizName && <p>{b.legalName}</p>}
            {S.showBusinessAddress && address && <p>{address}</p>}
            {S.showGst && gst && (
              <p>
                GSTIN <strong>{gst}</strong>
              </p>
            )}
            {S.showBusinessContact && (phone || email || b.website) && (
              <p>{[phone, email, b.website].filter(Boolean).join("  |  ")}</p>
            )}
          </div>
        </div>
        <div className="ohd-docmeta">
          <div className="ohd-doctype">{DOCUMENT_TYPE_LABEL[doc.type]}</div>
          <div className={doc.number ? "ohd-docnum" : "ohd-docnum is-draft"}>{doc.number ?? "Number assigned on save"}</div>
          <dl className="ohd-dates">
            <dt>Date</dt>
            <dd>{formatDisplayDate(doc.issueDate)}</dd>
            {isInvoice && doc.dueDate && (
              <>
                <dt>Due</dt>
                <dd>{formatDisplayDate(doc.dueDate)}</dd>
              </>
            )}
            {!isInvoice && doc.validUntil && (
              <>
                <dt>Valid until</dt>
                <dd>{formatDisplayDate(doc.validUntil)}</dd>
              </>
            )}
            {doc.sourceNumber && (
              <>
                <dt>Ref.</dt>
                <dd>{doc.sourceNumber}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <hr className="ohd-rule" />

      <section className="ohd-parties" style={{ "--ohd-party-cols": showShip ? 2 : 1 } as CSSProperties}>
        <div>
          <div className="ohd-label">Bill to</div>
          <div className="ohd-party-name">{c.name || "Customer name"}</div>
          {c.companyName && c.companyName !== c.name && <div className="ohd-party-line">{c.companyName}</div>}
          {S.showBillingAddress && c.billingAddress && <div className="ohd-party-line">{c.billingAddress}</div>}
          {S.showCustomerPhone && c.phone && <div className="ohd-party-line">{formatPhone(c.phone)}</div>}
          {S.showCustomerEmail && c.email && <div className="ohd-party-line">{c.email}</div>}
          {c.gstin && <div className="ohd-party-line">GSTIN {c.gstin}</div>}
        </div>
        {showShip && (
          <div>
            <div className="ohd-label">Ship to</div>
            <div className="ohd-party-line">{c.shippingAddress}</div>
          </div>
        )}
      </section>
      {doc.title && <p className="ohd-title">{doc.title}</p>}

      <table className="ohd-table">
        <colgroup>
          {cols.map((col) => (
            <col key={col.key} style={{ width: `${((col.width / totalWeight) * 100).toFixed(2)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((col) => (
              <th key={col.key} className={`ohd-al-${col.align}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nonEmptyGroups.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="ohd-empty">
                Add products to see them here
              </td>
            </tr>
          )}
          {nonEmptyGroups.map((g, gi) => (
            <GroupRows key={gi} group={g} cols={cols} first={gi === 0} showSubtotal={S.showGroupSubtotals && nonEmptyGroups.length > 1} />
          ))}
        </tbody>
      </table>

      <section className="ohd-summary">
        <div>
          <div className="ohd-words">
            Amount in words
            <strong>{amountInWords(isInvoice && hasPayments ? t.balanceDue : t.grandTotal)}</strong>
          </div>
          {savings.gt(0) && <div className="ohd-savings">You save {formatINR(savings)} on MRP</div>}
        </div>
        <table className="ohd-totals">
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td className="ohd-num">{formatINR(t.subtotal)}</td>
            </tr>
            {dec(t.itemDiscountTotal).gt(0) && (
              <tr className="ohd-t-muted">
                <td>Item discounts</td>
                <td className="ohd-num">-{formatINR(t.itemDiscountTotal)}</td>
              </tr>
            )}
            {dec(t.discountTotal).gt(0) && (
              <tr className="ohd-t-muted">
                <td>Discount{t.discountType === "PERCENT" && t.discountValue ? ` (${formatQty(t.discountValue)}%)` : ""}</td>
                <td className="ohd-num">-{formatINR(t.discountTotal)}</td>
              </tr>
            )}
            {dec(t.taxTotal).gt(0) && (
              <tr className="ohd-t-muted">
                <td>GST</td>
                <td className="ohd-num">{formatINR(t.taxTotal)}</td>
              </tr>
            )}
            {!dec(t.roundOff).isZero() && (
              <tr className="ohd-t-muted">
                <td>Round off</td>
                <td className="ohd-num">
                  {dec(t.roundOff).gt(0) ? "+" : "-"}
                  {formatINR(dec(t.roundOff).abs(), { alwaysPaise: true })}
                </td>
              </tr>
            )}
            <tr className="ohd-t-grand">
              <td>{isInvoice ? "Total" : "Estimated total"}</td>
              <td className="ohd-num">{formatINR(t.grandTotal)}</td>
            </tr>
            {isInvoice && hasPayments && (
              <>
                <tr className="ohd-t-muted">
                  <td>Paid</td>
                  <td className="ohd-num">-{formatINR(t.amountPaid)}</td>
                </tr>
                <tr className="ohd-t-balance">
                  <td>Balance due</td>
                  <td className="ohd-num">{formatINR(t.balanceDue)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </section>

      {blockCount > 0 && (
        <section className="ohd-blocks" style={{ "--ohd-block-cols": blockCount } as CSSProperties}>
          {(notes.length > 0 || terms.length > 0) && (
            <div className="ohd-block">
              {terms.length > 0 && (
                <>
                  <div className="ohd-label">Terms</div>
                  <ul>
                    {terms.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </>
              )}
              {notes.length > 0 && (
                <div style={{ marginTop: terms.length ? "3mm" : 0 }}>
                  <div className="ohd-label">Notes</div>
                  {notes.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {(bank || upi) && (
            <div className="ohd-block">
              <div className="ohd-label">Payment details</div>
              <div className="ohd-pay">
                <dl className="ohd-kv">
                  {bank && b.accountName && (
                    <>
                      <dt>Account name</dt>
                      <dd>{b.accountName}</dd>
                    </>
                  )}
                  {bank && b.bankName && (
                    <>
                      <dt>Bank</dt>
                      <dd>{b.bankName}</dd>
                    </>
                  )}
                  {bank && b.accountNumber && (
                    <>
                      <dt>Account no.</dt>
                      <dd>{b.accountNumber}</dd>
                    </>
                  )}
                  {bank && b.ifsc && (
                    <>
                      <dt>IFSC</dt>
                      <dd>{b.ifsc}</dd>
                    </>
                  )}
                  {upi && (
                    <>
                      <dt>UPI</dt>
                      <dd>{b.upiId}</dd>
                    </>
                  )}
                  {upi && b.upiPhone && (
                    <>
                      <dt>UPI number</dt>
                      <dd>{formatPhone(b.upiPhone)}</dd>
                    </>
                  )}
                </dl>
                {upi && S.showUpiQr && upiQrSvg && (
                  <div>
                    <div className="ohd-qr" dangerouslySetInnerHTML={{ __html: upiQrSvg }} />
                    <div className="ohd-qr-cap">Scan to pay</div>
                  </div>
                )}
              </div>
              {b.paymentInstructions && <p style={{ marginTop: "2mm", color: "var(--ohd-muted)" }}>{b.paymentInstructions}</p>}
            </div>
          )}
        </section>
      )}

      {L.customText && <div className="ohd-custom">{L.customText}</div>}

      {S.showSignature && (
        <div className="ohd-sign">
          <div className="ohd-sign-box">
            <div className="ohd-sign-for">For {bizName}</div>
            <div className="ohd-sign-line">{L.signatureLabel || "Authorised signatory"}</div>
          </div>
        </div>
      )}

      {S.showFooter && doc.footer && <div className="ohd-foot">{doc.footer}</div>}
    </div>
  );
}

function GroupRows({
  group,
  cols,
  first,
  showSubtotal,
}: {
  group: RenderableDocument["groups"][number];
  cols: ColumnConfig[];
  first: boolean;
  showSubtotal: boolean;
}) {
  const totalIdx = cols.findIndex((c) => c.key === "total");
  return (
    <>
      {(group.name || group.notes) && (
        <tr className={first ? "ohd-group ohd-group-first" : "ohd-group"}>
          <td colSpan={cols.length}>
            {group.name && <div className="ohd-group-name">{group.name}</div>}
            {group.notes && <div className="ohd-group-notes">{group.notes}</div>}
          </td>
        </tr>
      )}
      {group.items.map((it, i) => (
        <tr key={i}>
          {cols.map((col) => (
            <td key={col.key} className={`ohd-al-${col.align}`}>
              {cell(col, it, i)}
            </td>
          ))}
        </tr>
      ))}
      {showSubtotal && group.items.length > 0 && (
        <tr className="ohd-subtotal">
          {totalIdx > 0 ? (
            <>
              <td colSpan={totalIdx} className="ohd-al-right">
                {group.name ? `${group.name} subtotal` : "Subtotal"}
              </td>
              <td className="ohd-al-right">
                <span className="ohd-num">{money(group.subtotal)}</span>
              </td>
              {cols.length - totalIdx - 1 > 0 && <td colSpan={cols.length - totalIdx - 1} />}
            </>
          ) : (
            <td colSpan={cols.length} className="ohd-al-right">
              Subtotal <span className="ohd-num">{money(group.subtotal)}</span>
            </td>
          )}
        </tr>
      )}
    </>
  );
}
