"use client";

import { useEffect, useRef, useState } from "react";
import type { RenderableDocument } from "@organo/shared";
import { DocumentRenderer, upiQrSvgFor } from "@organo/shared/invoice";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const A4_WIDTH_PX = 793.7; // 210mm at 96dpi

/** A4 document scaled to the container width. Paper stays white in dark mode, like real paper. */
export function DocumentPreview({ doc, className, maxScale = 1 }: { doc: RenderableDocument; className?: string; maxScale?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const [height, setHeight] = useState(1123);
  const [qr, setQr] = useState<string | null>(null);

  const qrKey = useDebounce(`${doc.business.upiId}|${doc.totals.grandTotal}|${doc.totals.balanceDue}|${doc.number}|${doc.layout.sections.showUpiQr}`, 400);
  useEffect(() => {
    let alive = true;
    upiQrSvgFor(doc).then((svg) => alive && setQr(svg)).catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrKey]);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(maxScale, entry.contentRect.width / A4_WIDTH_PX));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setHeight(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className={cn("w-full", className)}>
      <div style={{ height: height * scale }} className="relative overflow-hidden rounded-md shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-8px_rgb(0_0_0/0.12)] ring-1 ring-black/5">
        <div ref={inner} style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: A4_WIDTH_PX }} className="absolute top-0 left-0">
          <DocumentRenderer doc={doc} upiQrSvg={qr} />
        </div>
      </div>
    </div>
  );
}
