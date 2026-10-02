"use client";

import { Download, Printer } from "lucide-react";
import { DOCUMENT_TYPE_LABEL, formatINR, type RenderableDocument } from "@organo/shared";
import { DocumentPreview } from "@/components/documents/document-preview";
import { Button } from "@/components/ui/button";

export function PublicDocument({ doc, token }: { doc: RenderableDocument; token: string }) {
  const pdf = `/api/public/documents/${token}/pdf`;
  const isInvoice = doc.type === "INVOICE";
  const due = isInvoice ? doc.totals.balanceDue : doc.totals.grandTotal;
  return (
    <div className="min-h-dvh bg-muted/60">
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[880px] items-center gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {DOCUMENT_TYPE_LABEL[doc.type]} {doc.number}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {doc.business.name} for {doc.customer.name}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm font-semibold tabular sm:inline">
              {isInvoice && doc.totals.amountPaid !== "0" && doc.totals.amountPaid !== "0.00" ? `${formatINR(due)} due` : formatINR(due)}
            </span>
            <Button size="sm" variant="outline" className="hidden sm:inline-flex" render={<a href={pdf} target="_blank" rel="noreferrer" />}>
              <Printer /> Print
            </Button>
            <Button size="sm" render={<a href={`${pdf}?download=1`} />}>
              <Download /> Download PDF
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[880px] px-3 py-6 sm:px-4 sm:py-10">
        <DocumentPreview doc={doc} />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Questions about this {DOCUMENT_TYPE_LABEL[doc.type].toLowerCase()}? Contact {doc.business.name}
          {doc.business.phone ? ` on ${doc.business.phone}` : ""}.
        </p>
      </main>
    </div>
  );
}
