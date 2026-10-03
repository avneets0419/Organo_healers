"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarPlus, Check, ExternalLink, MessageCircle, NotebookPen, Phone, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildWhatsAppUrl, FOLLOWUP_CHANNEL_LABEL, formatINR, formatPhone } from "@organo/shared";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { ErrorState } from "@/components/common/error-state";
import { LogActivityDialog } from "@/components/customers/log-activity-dialog";
import { SendDialog } from "@/components/documents/send-dialog";
import { CustomerStatusBadge, StatusBadge } from "@/components/documents/status-badge";
import { docPath } from "@/components/documents/use-document-actions";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { Sheet, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { useDebounce } from "@/hooks/use-debounce";
import { useMediaQuery } from "@/hooks/use-media-query";
import { api } from "@/lib/api";
import { fmtDateTime, isoDay } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Activity, FollowUp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CompleteFollowUpDialog } from "./complete-dialog";
import { FollowUpDialog } from "./followup-dialog";
import { FollowUpList, isOverdue, PriorityBadge } from "./followup-list";

type Scope = "overdue" | "today" | "upcoming" | "completed";

interface Summary {
  overdue: number;
  today: number;
  upcoming: number;
  completedWeek: number;
}

export function FollowUpsView() {
  const params = useSearchParams();
  const router = useRouter();
  const [chosenScope, setScope] = useState<Scope | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 250);
  const [selectedId, setSelectedId] = useState<string | null>(params.get("id"));
  const isDesktop = useMediaQuery("lg");

  const summary = useQuery({ queryKey: ["followups", "summary"], queryFn: () => api.get<Summary>("/followups/summary") });
  // Until the user picks a tab, open on the most useful one: overdue, then today, then upcoming.
  const scope: Scope = chosenScope ?? (summary.data ? (summary.data.overdue ? "overdue" : summary.data.today ? "today" : "upcoming") : "today");

  const list = useQuery({
    queryKey: ["followups", "list", scope, dq],
    queryFn: () => api.get<FollowUp[]>("/followups", { scope, q: dq || undefined, pageSize: 100 }),
  });
  const items = useMemo(() => list.data ?? [], [list.data]);
  const deepLinked = useQuery({
    queryKey: ["followups", "one", selectedId],
    queryFn: async () => (await api.get<FollowUp[]>("/followups", { pageSize: 100, status: "OPEN" })).find((f) => f.id === selectedId) ?? null,
    enabled: !!selectedId && !items.some((f) => f.id === selectedId),
  });
  // On desktop the first item is shown until the user picks one.
  const effectiveId = selectedId ?? (isDesktop ? (items[0]?.id ?? null) : null);
  const selected = items.find((f) => f.id === effectiveId) ?? deepLinked.data ?? null;

  const counts: Record<Scope, number | undefined> = {
    overdue: summary.data?.overdue,
    today: summary.data?.today,
    upcoming: summary.data?.upcoming,
    completed: summary.data?.completedWeek,
  };

  const detail = selected ? <FollowUpDetail followUp={selected} onDone={() => setSelectedId(null)} /> : null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-0.5" role="tablist" aria-label="Follow-up queue">
            {(
              [
                ["overdue", "Overdue"],
                ["today", "Today"],
                ["upcoming", "Upcoming"],
                ["completed", "Done this week"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={scope === k}
                onClick={() => {
                  setScope(k);
                  setSelectedId(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  scope === k ? "bg-background text-foreground shadow-sm/5" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {counts[k] !== undefined && (
                  <span className={cn("rounded px-1 text-xs tabular", k === "overdue" && counts[k]! > 0 ? "bg-destructive/10 text-destructive-foreground" : "text-muted-foreground")}>
                    {counts[k]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <InputGroup className="w-full sm:ml-auto sm:w-72">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer or task" aria-label="Search follow-ups" />
          </InputGroup>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r p-2 sm:p-3" aria-label="Follow-up queue">
          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : !list.isLoading && items.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock />
                </EmptyMedia>
                <EmptyTitle>{scope === "overdue" ? "Nothing overdue" : scope === "today" ? "Nothing due today" : scope === "upcoming" ? "Nothing scheduled" : "Nothing completed this week"}</EmptyTitle>
                <EmptyDescription>Schedule follow-ups from a proforma, invoice or customer page.</EmptyDescription>
              </EmptyHeader>
              <Button size="sm" variant="outline" render={<Link href="/proformas" />}>
                Open proformas
              </Button>
            </Empty>
          ) : (
            <FollowUpList items={items} loading={list.isLoading} selectedId={effectiveId} onSelect={(f) => setSelectedId(f.id)} />
          )}
        </aside>
        {isDesktop ? (
          <section className="min-h-0 overflow-y-auto" aria-label="Follow-up details">
            {detail ?? (
              <div className="grid h-full place-items-center p-8 text-center text-sm text-muted-foreground">Select a follow-up to see the customer&apos;s history.</div>
            )}
          </section>
        ) : (
          <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
            <SheetPopup side="bottom" className="max-h-[90dvh] overflow-y-auto">
              <SheetTitle className="sr-only">Follow-up</SheetTitle>
              {detail}
            </SheetPopup>
          </Sheet>
        )}
      </div>
      {params.get("id") && <SelectedSync onClear={() => router.replace("/followups")} />}
    </div>
  );
}

/** Drop ?id= after first use so refreshing doesn't pin the selection. */
function SelectedSync({ onClear }: { onClear: () => void }) {
  useEffect(() => {
    onClear();
  }, [onClear]);
  return null;
}

interface CustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: Parameters<typeof CustomerStatusBadge>[0]["status"];
  documents: Array<{ id: string; type: "PROFORMA" | "INVOICE"; number: string; status: Parameters<typeof StatusBadge>[0]["status"]; grandTotal: string; balanceDue: string }>;
  metrics: { totalRevenue: string; outstanding: string };
}

function FollowUpDetail({ followUp: f, onDone }: { followUp: FollowUp; onDone: () => void }) {
  const qc = useQueryClient();
  const customer = useQuery({ queryKey: ["customer", f.customerId], queryFn: () => api.get<CustomerSummary>(`/customers/${f.customerId}`) });
  const timeline = useQuery({ queryKey: ["activities", "customer", f.customerId], queryFn: () => api.get<Activity[]>("/activities", { customerId: f.customerId, pageSize: 50 }) });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [waDoc, setWaDoc] = useState<string | null>(null);

  const reschedule = useMutation({
    mutationFn: (days: number) => {
      const base = new Date(Math.max(Date.now(), new Date(f.dueAt).getTime()));
      const ist = new Date(new Date(f.dueAt).getTime() + 5.5 * 3600_000).toISOString().slice(11, 16);
      return api.patch(`/followups/${f.id}`, { dueAt: new Date(`${isoDay(new Date(base.getTime() + days * 86_400_000))}T${ist}:00+05:30`), status: "SCHEDULED" });
    },
    onSuccess: () => {
      for (const k of [["followups"], ["sidebar-counts"], ["activities"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      toast.success("Rescheduled");
    },
    onError: (e) => toast.error(e),
  });
  const cancel = useMutation({
    mutationFn: () => api.patch(`/followups/${f.id}`, { status: "CANCELLED" }),
    onSuccess: () => {
      for (const k of [["followups"], ["sidebar-counts"], ["activities"]]) qc.invalidateQueries({ queryKey: k });
      toast.success("Follow-up cancelled");
      onDone();
    },
    onError: (e) => toast.error(e),
  });

  const open = f.status === "PENDING" || f.status === "SCHEDULED";
  const latestDoc = f.document ?? customer.data?.documents.find((d) => d.status !== "CANCELLED") ?? null;
  const plainWa = f.customer.phone ? buildWhatsAppUrl(f.customer.phone, `Hello ${f.customer.name},\n\n`) : null;
  const memo = useMemo(() => timeline.data ?? [], [timeline.data]);

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {FOLLOWUP_CHANNEL_LABEL[f.channel]} follow-up, {fmtDateTime(f.dueAt)}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{f.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {isOverdue(f) && (
              <span className="text-xs font-medium text-destructive-foreground">Overdue</span>
            )}
            <PriorityBadge priority={f.priority} />
            {f.assignedTo && <span className="text-xs text-muted-foreground">Assigned to {f.assignedTo.name}</span>}
          </div>
          {f.notes && <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{f.notes}</p>}
        </div>
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            <Menu>
              <MenuTrigger render={<Button size="sm" variant="outline" />}>
                <CalendarClock /> Snooze
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={() => reschedule.mutate(1)}>Tomorrow</MenuItem>
                <MenuItem onClick={() => reschedule.mutate(3)}>In 3 days</MenuItem>
                <MenuItem onClick={() => reschedule.mutate(7)}>Next week</MenuItem>
                <MenuItem onClick={() => setEditOpen(true)}>Pick a date</MenuItem>
              </MenuPopup>
            </Menu>
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate()} loading={cancel.isPending} aria-label="Cancel follow-up">
              <X />
            </Button>
            <Button size="sm" onClick={() => setCompleteOpen(true)}>
              <Check /> Complete
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/customers/${f.customerId}`} className="text-base font-semibold hover:underline">
              {f.customer.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <CustomerStatusBadge status={f.customer.status} size="sm" />
              {f.customer.phone && <span className="tabular">{formatPhone(f.customer.phone)}</span>}
              {customer.data && Number(customer.data.metrics.outstanding) > 0 && <span className="text-warning-foreground">{formatINR(customer.data.metrics.outstanding)} outstanding</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {f.customer.phone && (
              <Button size="sm" variant="outline" render={<a href={`tel:${f.customer.phone}`} />}>
                <Phone /> Call
              </Button>
            )}
            {latestDoc ? (
              <Button size="sm" variant="outline" disabled={!f.customer.phone} onClick={() => setWaDoc(latestDoc.id)}>
                <MessageCircle /> WhatsApp
              </Button>
            ) : (
              plainWa && (
                <Button size="sm" variant="outline" render={<a href={plainWa} target="_blank" rel="noreferrer" />}>
                  <MessageCircle /> WhatsApp
                </Button>
              )
            )}
            <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>
              <NotebookPen /> Log call
            </Button>
          </div>
        </div>
        {latestDoc && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{f.document ? "About" : "Latest"}</span>
              <Link href={docPath(latestDoc)} className="font-medium tabular hover:underline">
                {latestDoc.number}
              </Link>
              <StatusBadge status={latestDoc.status} size="sm" />
            </span>
            <span className="flex items-center gap-3">
              <span className="font-medium tabular">{formatINR(latestDoc.grandTotal)}</span>
              <Button size="xs" variant="ghost" render={<Link href={docPath(latestDoc)} />}>
                <ExternalLink /> Open
              </Button>
            </span>
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Customer timeline</h3>
          <Button size="xs" variant="ghost" onClick={() => setEditOpen(true)}>
            <CalendarPlus /> Edit follow-up
          </Button>
        </div>
        <ActivityTimeline items={memo} loading={timeline.isLoading} />
      </div>

      <CompleteFollowUpDialog followUp={completeOpen ? f : null} onClose={() => setCompleteOpen(false)} />
      <FollowUpDialog open={editOpen} onOpenChange={setEditOpen} customer={{ id: f.customerId, name: f.customer.name }} followUp={f} />
      <LogActivityDialog open={logOpen} onOpenChange={setLogOpen} customerId={f.customerId} />
      {waDoc && (
        <SendDialog
          documentId={waDoc}
          mode="whatsapp"
          preferWhatsAppTemplate={latestDoc?.type === "INVOICE" && latestDoc.status !== "PAID" ? "payment_reminder" : "follow_up"}
          onClose={() => setWaDoc(null)}
        />
      )}
    </div>
  );
}
