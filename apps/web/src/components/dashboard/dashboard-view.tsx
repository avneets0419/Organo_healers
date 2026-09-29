"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarClock, FileClock, Plus } from "lucide-react";
import Link from "next/link";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { dec, formatINR, formatINRCompact, formatPhone, FOLLOWUP_CHANNEL_LABEL, type FollowUpChannel } from "@organo/shared";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { ErrorState } from "@/components/common/error-state";
import { PageBody, PageHeader } from "@/components/common/page-header";
import { SectionCard } from "@/components/common/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Dashboard {
  sales: { total: string; month: string; lastMonth: string; week: string; today: string };
  money: { outstanding: string; overdue: string; overdueCount: number; paid: string; paidMonth: string; draftInvoices: string; pipeline: string; pipelineCount: number };
  counts: { invoices: number; proformas: number; avgInvoice: string; avgProforma: string; conversionRate: number | null };
  funnel: Array<{ stage: string; count: number }>;
  revenue: Array<{ month: string; invoiced: string; collected: string; quoted: string }>;
  customers: { total: number; newThisMonth: number; returning: number; leads: number; top: Array<{ id: string; name: string; invoiced: string; quoted: string; documents: number }> };
  products: { basis: "invoiced" | "quoted"; top: Array<{ name: string; productId: string | null; quantity: string; revenue: string }>; categories: Array<{ name: string; revenue: string }> };
  followups: {
    pending: number;
    overdue: number;
    today: number;
    completedWeek: number;
    next: Array<{ id: string; title: string; dueAt: string; channel: FollowUpChannel; priority: string; customer: { id: string; name: string; phone: string | null }; document: { id: string; number: string; type: string } | null }>;
  };
  recent: Activity[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

const SERIES = [
  { key: "quoted", label: "Quoted", color: "var(--series-quoted)" },
  { key: "invoiced", label: "Invoiced", color: "var(--series-invoiced)" },
  { key: "collected", label: "Collected", color: "var(--series-collected)" },
] as const;

function greeting() {
  const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function DashboardView() {
  const { data: me } = useMe();
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/dashboard"),
    refetchInterval: 120_000,
  });

  return (
    <PageBody>
      <PageHeader
        title={`${greeting()}${me ? `, ${me.name.split(" ")[0]}` : ""}`}
        description="Sales, money owed and follow-ups across the studio."
        actions={
          <>
            <Button variant="outline" render={<Link href="/followups" />}>
              <CalendarClock /> Follow-ups
            </Button>
            <Button render={<Link href="/pos?type=PROFORMA" />}>
              <Plus /> New proforma
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mt-6">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className={cn("mt-6 grid gap-4 transition-opacity", isFetching && "opacity-90")}>
          <KpiRow data={data} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <SectionCard title="Revenue, last 12 months" description="Quoted in proformas, invoiced, and payments collected">
              <RevenueChart data={data.revenue} />
            </SectionCard>
            <SectionCard title="Proforma to payment" description={data.counts.conversionRate === null ? "No proformas yet" : `${Math.round(data.counts.conversionRate * 100)}% of proformas converted to invoices`}>
              <Funnel steps={data.funnel} />
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard
              title="Top customers"
              description={data.counts.invoices ? "By invoiced value" : "By quoted value until invoices exist"}
              action={
                <Button size="xs" variant="ghost" render={<Link href="/customers" />}>
                  All
                </Button>
              }
            >
              <RankList
                rows={data.customers.top.map((c) => ({ key: c.id, label: c.name, href: `/customers/${c.id}`, value: dec(c.invoiced).gt(0) ? c.invoiced : c.quoted }))}
                empty="Customers appear here once they have documents."
              />
            </SectionCard>
            <SectionCard title="Best-selling products" description={data.products.basis === "invoiced" ? "By invoiced value" : "By quoted value (no invoices yet)"}>
              <RankList
                rows={data.products.top.map((p) => ({
                  key: p.productId ?? p.name,
                  label: p.name,
                  href: p.productId ? `/inventory/${p.productId}` : undefined,
                  value: p.revenue,
                  hint: `${dec(p.quantity).toString()} sold`,
                }))}
                empty="No sales yet."
              />
            </SectionCard>
            <SectionCard title="Sales by category" description={data.products.basis === "invoiced" ? "Invoiced value" : "Quoted value"}>
              <RankList rows={data.products.categories.map((c) => ({ key: c.name, label: c.name, value: c.revenue }))} empty="No sales yet." />
            </SectionCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <SectionCard
              title="Follow-ups"
              description={`${data.followups.overdue} overdue, ${data.followups.today} today, ${data.followups.completedWeek} completed this week`}
              action={
                <Button size="xs" variant="ghost" render={<Link href="/followups" />}>
                  Open
                </Button>
              }
            >
              {data.followups.next.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Schedule follow-ups from a proforma or customer page.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {data.followups.next.map((f) => {
                    const overdue = new Date(f.dueAt) < new Date();
                    return (
                      <li key={f.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link href={`/customers/${f.customer.id}`} className="block truncate text-sm font-medium hover:underline">
                            {f.customer.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {FOLLOWUP_CHANNEL_LABEL[f.channel]}: {f.title}
                          </p>
                        </div>
                        <span className={cn("shrink-0 text-xs tabular", overdue ? "font-medium text-destructive-foreground" : "text-muted-foreground")}>
                          {overdue ? `Overdue ${fmtRelative(f.dueAt)}` : fmtRelative(f.dueAt)}
                        </span>
                        {f.customer.phone && (
                          <Button size="xs" variant="outline" render={<a href={`tel:${f.customer.phone}`} />} aria-label={`Call ${f.customer.name}`}>
                            {formatPhone(f.customer.phone).replace("+91 ", "")}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Recent activity">
              <ActivityTimeline items={data.recent} showCustomer />
            </SectionCard>
          </div>
        </div>
      )}
    </PageBody>
  );
}

function KpiRow({ data }: { data: Dashboard }) {
  const m = dec(data.sales.month);
  const lm = dec(data.sales.lastMonth);
  const delta = lm.gt(0) ? m.minus(lm).div(lm).mul(100).toDecimalPlaces(0).toNumber() : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Invoiced this month"
        value={formatINR(data.sales.month)}
        delta={delta}
        foot={`${formatINR(data.sales.week)} this week, ${formatINR(data.sales.today)} today`}
        primary
      />
      <StatTile
        label="Outstanding"
        value={formatINR(data.money.outstanding)}
        foot={data.money.overdueCount ? `${formatINR(data.money.overdue)} overdue on ${data.money.overdueCount} invoice${data.money.overdueCount > 1 ? "s" : ""}` : "Nothing overdue"}
        footTone={data.money.overdueCount ? "bad" : undefined}
        href="/invoices"
      />
      <StatTile label="Collected this month" value={formatINR(data.money.paidMonth)} foot={`${formatINR(data.money.paid)} collected all time`} />
      <StatTile
        label="Open proformas"
        value={formatINR(data.money.pipeline)}
        foot={`${data.money.pipelineCount} awaiting a decision, avg ${formatINR(data.counts.avgProforma)}`}
        href="/proformas"
        icon={<FileClock className="size-4" />}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  foot,
  delta,
  primary,
  href,
  footTone,
  icon,
}: {
  label: string;
  value: string;
  foot?: string;
  delta?: number | null;
  primary?: boolean;
  href?: string;
  footTone?: "bad";
  icon?: React.ReactNode;
}) {
  const body = (
    <div className={cn("h-full rounded-xl border bg-card p-4 transition-colors", href && "hover:border-input hover:bg-accent/30", primary && "bg-brand-soft/50")}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
        {label}
        {icon}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn("font-semibold tracking-tight", primary ? "text-3xl" : "text-2xl")}>{value}</span>
        {delta !== undefined && delta !== null && (
          <span className={cn("inline-flex items-center text-xs font-medium tabular", delta >= 0 ? "text-success-foreground" : "text-destructive-foreground")}>
            {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta)}% vs last month
          </span>
        )}
      </div>
      {foot && <p className={cn("mt-1.5 text-xs", footTone === "bad" ? "text-destructive-foreground" : "text-muted-foreground")}>{foot}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

function RevenueTooltip({ active, payload, label }: TooltipProps<number, string> & { payload?: Array<{ dataKey: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg/5">
      <p className="mb-1.5 font-medium">{label ? `${monthLabel(label)} ${label.slice(0, 4)}` : ""}</p>
      {SERIES.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={s.key} className="flex items-center gap-2 py-0.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular">{formatINR(p?.value ?? 0)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RevenueChart({ data }: { data: Dashboard["revenue"] }) {
  const rows = data.map((r) => ({ month: r.month, quoted: Number(r.quoted), invoiced: Number(r.invoiced), collected: Number(r.collected) }));
  const hasData = rows.some((r) => r.quoted || r.invoiced || r.collected);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative h-64">
        {!hasData && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No sales recorded in the last 12 months.</p>}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeWidth={1} />
            <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="linear"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">View as table</summary>
        <table className="mt-2 w-full tabular">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Month</th>
              {SERIES.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.month} className="border-t">
                <td className="py-1">
                  {monthLabel(r.month)} {r.month.slice(0, 4)}
                </td>
                <td className="py-1 text-right">{formatINR(r.quoted)}</td>
                <td className="py-1 text-right">{formatINR(r.invoiced)}</td>
                <td className="py-1 text-right">{formatINR(r.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Funnel as horizontal bars: one hue (magnitude), counts at the bar tip, step conversion beside. */
function Funnel({ steps }: { steps: Dashboard["funnel"] }) {
  const max = Math.max(1, ...steps.map((s) => s.count));
  return (
    <ol className="grid gap-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1]!.count : null;
        const rate = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.stage} className="grid grid-cols-[84px_minmax(0,1fr)_44px] items-center gap-3 text-sm" title={`${s.stage}: ${s.count}`}>
            <span className="text-muted-foreground">{s.stage}</span>
            <div className="flex items-center gap-2">
              <div className="h-3 rounded-r-[4px] bg-series-invoiced transition-[width]" style={{ width: `${Math.max(s.count ? 2 : 0, (s.count / max) * 100)}%` }} />
              <span className="text-xs font-semibold tabular">{s.count}</span>
            </div>
            <span className="text-right text-xs text-muted-foreground tabular">{rate === null ? "" : prev ? `${rate}%` : "-"}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RankList({ rows, empty }: { rows: Array<{ key: string; label: string; value: string; href?: string; hint?: string }>; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => Number(r.value)));
  return (
    <ol className="grid gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            {r.href ? (
              <Link href={r.href} className="truncate hover:underline">
                {r.label}
              </Link>
            ) : (
              <span className="truncate">{r.label}</span>
            )}
            <span className="shrink-0 font-medium tabular">{formatINR(r.value)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 rounded-r-[4px] bg-series-invoiced/80" style={{ width: `${(Number(r.value) / max) * 100}%` }} />
            {r.hint && <span className="shrink-0 text-[11px] text-muted-foreground tabular">{r.hint}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
