"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CUSTOMER_STATUS_LABEL,
  DOCUMENT_STATUS_LABEL,
  FOLLOWUP_STATUS_LABEL,
  FOLLOWUP_STATUSES,
  formatINR,
  formatQty,
  INVOICE_STATUSES,
  PAYMENT_METHOD_LABEL,
  PROFORMA_STATUSES,
  type CustomerStatus,
  type DocumentStatus,
  type FollowUpStatus,
  type PaymentMethod,
} from "@organo/shared";
import { ErrorState } from "@/components/common/error-state";
import { PageBody, PageHeader } from "@/components/common/page-header";
import { CustomerStatusBadge, StatusBadge } from "@/components/documents/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCategories } from "@/hooks/use-settings";
import { api } from "@/lib/api";
import { downloadCsv, toCsv } from "@/lib/csv";
import { fmtDate, isoDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const REPORTS = [
  { key: "sales", label: "Sales", description: "Issued invoices (excludes drafts and cancelled)", dated: true },
  { key: "invoices", label: "Invoices", description: "Every invoice with its status", dated: true, statuses: INVOICE_STATUSES },
  { key: "proformas", label: "Proformas", description: "Quotes sent and their outcome", dated: true, statuses: PROFORMA_STATUSES },
  { key: "customers", label: "Customers", description: "Business per customer in the period", dated: true },
  { key: "products", label: "Product sales", description: "Quantities and value by product", dated: true, category: true },
  { key: "outstanding", label: "Outstanding", description: "Unpaid invoice balances by age", dated: false },
  { key: "payments", label: "Payments", description: "Money received, by method", dated: true },
  { key: "followups", label: "Follow-ups", description: "Follow-up activity and outcomes", dated: true, statuses: FOLLOWUP_STATUSES },
] as const;
type ReportKey = (typeof REPORTS)[number]["key"];

interface Column {
  key: string;
  label: string;
  type?: "date" | "money" | "count" | "qty" | "link" | "status" | "customerStatus" | "followupStatus" | "paymentMethod" | "mono";
}
interface Report {
  columns: Column[];
  rows: Array<Record<string, string | number | null> & { id: string; href?: string }>;
  summary: Array<{ label: string; value: string; type: "money" | "count"; method?: boolean }>;
  truncated?: boolean;
  options?: { statusChoices?: Array<{ value: string; label: string }> };
}

type Preset = "7d" | "30d" | "month" | "lastMonth" | "quarter" | "year" | "all" | "custom";
const PRESETS: Array<[Preset, string]> = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["month", "This month"],
  ["lastMonth", "Last month"],
  ["quarter", "Last 90 days"],
  ["year", "This year"],
  ["all", "All time"],
  ["custom", "Custom range"],
];

function presetRange(p: Preset, today: number): { from?: string; to?: string } {
  const now = new Date(today + 5.5 * 3600_000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = (d: Date) => d.toISOString().slice(0, 10);
  switch (p) {
    case "7d":
      return { from: isoDay(new Date(today - 6 * 86_400_000)), to: isoDay(new Date(today)) };
    case "30d":
      return { from: isoDay(new Date(today - 29 * 86_400_000)), to: isoDay(new Date(today)) };
    case "quarter":
      return { from: isoDay(new Date(today - 89 * 86_400_000)), to: isoDay(new Date(today)) };
    case "month":
      return { from: day(new Date(Date.UTC(y, m, 1))), to: isoDay(new Date(today)) };
    case "lastMonth":
      return { from: day(new Date(Date.UTC(y, m - 1, 1))), to: day(new Date(Date.UTC(y, m, 0))) };
    case "year":
      return { from: `${y}-01-01`, to: isoDay(new Date(today)) };
    default:
      return {};
  }
}

function formatCell(col: Column, v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "-";
  switch (col.type) {
    case "date":
      return fmtDate(String(v));
    case "money":
      return formatINR(String(v));
    case "qty":
      return formatQty(String(v));
    case "status":
      return DOCUMENT_STATUS_LABEL[v as DocumentStatus] ?? String(v);
    case "customerStatus":
      return CUSTOMER_STATUS_LABEL[v as CustomerStatus] ?? String(v);
    case "followupStatus":
      return FOLLOWUP_STATUS_LABEL[v as FollowUpStatus] ?? String(v);
    case "paymentMethod":
      return PAYMENT_METHOD_LABEL[v as PaymentMethod] ?? String(v);
    default:
      return String(v);
  }
}

export function ReportsView() {
  const [report, setReport] = useState<ReportKey>("sales");
  const [preset, setPreset] = useState<Preset>("month");
  const [today] = useState(() => Date.now());
  const [custom, setCustom] = useState(() => ({ from: isoDay(new Date(today - 29 * 86_400_000)), to: isoDay(new Date(today)) }));
  const [status, setStatus] = useState("ALL");
  const [categoryId, setCategoryId] = useState("ALL");
  const { data: categories } = useCategories();
  const def = REPORTS.find((r) => r.key === report)!;
  const dates = preset === "custom" ? custom : presetRange(preset, today);

  const query = useQuery({
    queryKey: ["report", report, dates, status, categoryId],
    queryFn: () =>
      api.get<Report>(`/reports/${report}`, {
        ...(def.dated ? dates : {}),
        status: status === "ALL" ? undefined : status,
        categoryId: "category" in def && categoryId !== "ALL" ? categoryId : undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const statusChoices = useMemo(() => {
    if (data?.options?.statusChoices) return data.options.statusChoices;
    if ("statuses" in def) return def.statuses.map((s) => ({ value: s, label: report === "followups" ? FOLLOWUP_STATUS_LABEL[s as FollowUpStatus] : DOCUMENT_STATUS_LABEL[s as DocumentStatus] }));
    return null;
  }, [data, def, report]);

  function exportCsv() {
    if (!data) return;
    const rows = data.rows.map((r) => Object.fromEntries(data.columns.map((c) => [c.label, c.type === "money" || c.type === "qty" || c.type === "count" ? (r[c.key] ?? "") : formatCell(c, r[c.key] ?? null)])));
    downloadCsv(`organo-${report}-${dates.from ?? "all"}-${dates.to ?? "time"}.csv`, toCsv(rows, data.columns.map((c) => c.label)));
  }

  return (
    <PageBody>
      <PageHeader
        title="Reports"
        description="Calculated live from the database."
        actions={
          <Button variant="outline" disabled={!data?.rows.length} onClick={exportCsv}>
            <Download /> Export CSV
          </Button>
        }
      />

      <div className="mt-5 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Reports">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            role="tab"
            aria-selected={report === r.key}
            onClick={() => {
              setReport(r.key);
              setStatus("ALL");
            }}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              report === r.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {def.dated && (
          <>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-44" aria-label="Date range">
                <SelectValue>{(v: string) => PRESETS.find(([k]) => k === v)?.[1]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {PRESETS.map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {preset === "custom" && (
              <>
                <Input type="date" nativeInput className="w-40" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" nativeInput className="w-40" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
              </>
            )}
          </>
        )}
        {statusChoices && (
          <Select value={status} onValueChange={(v) => setStatus(v as string)}>
            <SelectTrigger className="w-48" aria-label="Status">
              <SelectValue>{(v: string) => (v === "ALL" ? (report === "products" ? "Invoiced" : "All statuses") : (statusChoices.find((s) => s.value === v)?.label ?? v))}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="ALL">{report === "products" ? "Invoiced" : "All statuses"}</SelectItem>
              {statusChoices
                .filter((s) => !(report === "products" && s.value === "INVOICED"))
                .map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
            </SelectPopup>
          </Select>
        )}
        {"category" in def && (
          <Select value={categoryId} onValueChange={(v) => setCategoryId(v as string)}>
            <SelectTrigger className="w-48" aria-label="Category">
              <SelectValue>{(v: string) => (v === "ALL" ? "All categories" : (categories?.find((c) => c.id === v)?.name ?? ""))}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="ALL">All categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        )}
        <p className="text-sm text-muted-foreground sm:ml-2">{def.description}</p>
      </div>

      {query.isError ? (
        <div className="mt-6">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : !data ? (
        <div className="mt-6 grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className={cn("mt-5 transition-opacity", query.isPlaceholderData && "opacity-60")}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.summary.map((s) => (
              <div key={s.label} className="rounded-xl border bg-card p-3.5">
                <dt className="text-xs text-muted-foreground">{s.method ? (PAYMENT_METHOD_LABEL[s.label as PaymentMethod] ?? s.label) : s.label}</dt>
                <dd className="mt-1 text-lg font-semibold">{s.type === "money" ? formatINR(s.value) : s.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 overflow-hidden rounded-xl border">
            {data.rows.length === 0 ? (
              <p className="py-14 text-center text-sm text-muted-foreground">Nothing in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {data.columns.map((c) => (
                      <TableHead key={c.key} className={cn(["money", "count", "qty"].includes(c.type ?? "") && "text-right")}>
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow key={r.id}>
                      {data.columns.map((c) => {
                        const v = r[c.key] ?? null;
                        const numeric = ["money", "count", "qty"].includes(c.type ?? "");
                        return (
                          <TableCell key={c.key} className={cn(numeric && "text-right tabular", c.type === "date" && "text-muted-foreground tabular", c.type === "mono" && "font-mono text-xs")}>
                            {c.type === "link" && r.href ? (
                              <Link href={r.href} className="font-medium hover:underline">
                                {String(v)}
                              </Link>
                            ) : c.type === "status" && v ? (
                              <StatusBadge status={v as DocumentStatus} size="sm" />
                            ) : c.type === "customerStatus" && v ? (
                              <CustomerStatusBadge status={v as CustomerStatus} size="sm" />
                            ) : (
                              formatCell(c, v)
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {data.truncated && <p className="mt-2 text-xs text-muted-foreground">Showing the first 2,000 rows. Narrow the date range or export in parts.</p>}
        </div>
      )}
    </PageBody>
  );
}
