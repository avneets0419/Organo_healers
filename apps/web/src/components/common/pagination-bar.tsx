"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PageMeta } from "@/lib/api";

export function PaginationBar({ meta, onPage }: { meta?: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.pageCount <= 1) return meta ? <p className="text-xs text-muted-foreground tabular">{meta.total} total</p> : null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground tabular">
        {from}-{to} of {meta.total}
      </p>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="outline" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 text-xs tabular">
          {meta.page} / {meta.pageCount}
        </span>
        <Button size="icon-sm" variant="outline" disabled={meta.page >= meta.pageCount} onClick={() => onPage(meta.page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
