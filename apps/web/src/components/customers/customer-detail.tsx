"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Check, ChevronDown, FileCheck2, FileClock, Mail, MessageCircle, NotebookPen, PencilLine, Phone } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  buildWhatsAppUrl,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUSES,
  formatINR,
  formatPhone,
  PAYMENT_METHOD_LABEL,
  type CustomerStatus,
  type DocumentStatus,
  type DocumentType,
} from "@organo/shared";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { ErrorState } from "@/components/common/error-state";
import { SectionCard } from "@/components/common/section-card";
import { CustomerStatusBadge, StatusBadge } from "@/components/documents/status-badge";
import { docPath } from "@/components/documents/use-document-actions";
import { FollowUpDialog } from "@/components/followups/followup-dialog";
import { FollowUpList } from "@/components/followups/followup-list";
import { Button } from "@/components/ui/button";
import { Menu, MenuGroupLabel, MenuItem, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Activity, FollowUp, Payment } from "@/lib/types";
import { CustomerFormDialog, type CustomerFormValues } from "./customer-form-dialog";
import { LogActivityDialog } from "./log-activity-dialog";

interface CustomerDoc {
  id: string;
  type: DocumentType;
  number: string;
  status: DocumentStatus;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  derivedDocuments: Array<{ id: string; number: string }>;
}

interface CustomerDetailData extends CustomerFormValues {
  id: string;
  status: CustomerStatus;
  tags: string[];
  lastContactAt: string | null;
  createdAt: string;
  documents: CustomerDoc[];
  payments: Array<Payment & { document: { number: string } }>;
  metrics: {
    totalRevenue: string;
    paid: string;
    outstanding: string;
    invoiceCount: number;
    proformaCount: number;
    proformaValue: string;
    conversionRate: number | null;
    lastContactAt: string | null;
    openFollowUps: number;
  };
}

export function CustomerDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: c, isLoading, error, refetch } = useQuery({ queryKey: ["customer", id], queryFn: () => api.get<CustomerDetailData>(`/customers/${id}`) });
  const activities = useQuery({ queryKey: ["activities", "customer", id], queryFn: () => api.get<Activity[]>("/activities", { customerId: id, pageSize: 100 }) });
  const followups = useQuery({ queryKey: ["followups", "customer", id], queryFn: () => api.get<FollowUp[]>("/followups", { customerId: id, pageSize: 50 }) });
  usePageTitle(c?.name);
  const [editOpen, setEditOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);

  const setStatus = useMutation({
    mutationFn: (status: CustomerStatus) => api.patch(`/customers/${id}`, { status }),
    onSuccess: (_d, status) => {
      for (const k of [["customer", id], ["customers"], ["activities"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(`Status set to ${CUSTOMER_STATUS_LABEL[status].toLowerCase()}`);
    },
    onError: (e) => toast.error(e),
  });

  if (isLoading)
    return (
      <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  if (error || !c) return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this customer" />;

  const invoices = c.documents.filter((d) => d.type === "INVOICE");
  const proformas = c.documents.filter((d) => d.type === "PROFORMA");
  const wa = c.phone ? buildWhatsAppUrl(c.phone, `Hello ${c.name},\n\n`) : null;
  const m = c.metrics;
  const openFollowUps = (followups.data ?? []).filter((f) => f.status === "PENDING" || f.status === "SCHEDULED");

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button size="icon-sm" variant="ghost" render={<Link href="/customers" />} aria-label="Back to customers">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{c.name}</h2>
            <Menu>
              <MenuTrigger className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Change status">
                <span className="inline-flex items-center gap-0.5">
                  <CustomerStatusBadge status={c.status} />
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </span>
              </MenuTrigger>
              <MenuPopup align="start" className="w-52">
                <MenuRadioGroup value={c.status} onValueChange={(v) => setStatus.mutate(v as CustomerStatus)}>
                  <MenuGroupLabel>Pipeline stage</MenuGroupLabel>
                  {CUSTOMER_STATUSES.map((s) => (
                    <MenuRadioItem key={s} value={s}>
                      {CUSTOMER_STATUS_LABEL[s]}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
                <MenuSeparator />
                <p className="px-2 py-1 text-xs text-muted-foreground">Updates automatically from documents. Completed and Inactive stay until you change them.</p>
              </MenuPopup>
            </Menu>
          </div>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.companyName && c.companyName !== c.name && <span>{c.companyName}</span>}
            {c.phone && <span className="tabular">{formatPhone(c.phone)}</span>}
            {c.email && <span>{c.email}</span>}
            <span>Customer since {fmtDate(c.createdAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.phone && (
            <Button variant="outline" size="sm" render={<a href={`tel:${c.phone}`} />}>
              <Phone /> Call
            </Button>
          )}
          {wa && (
            <Button variant="outline" size="sm" render={<a href={wa} target="_blank" rel="noreferrer" />}>
              <MessageCircle /> WhatsApp
            </Button>
          )}
          {c.email && (
            <Button variant="outline" size="sm" render={<a href={`mailto:${c.email}`} />}>
              <Mail /> Email
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setLogOpen(true)}>
            <NotebookPen /> Log
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFollowOpen(true)}>
            <CalendarPlus /> Follow-up
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <PencilLine /> Edit
          </Button>
          <Menu>
            <MenuTrigger render={<Button size="sm" />}>
              New <ChevronDown />
            </MenuTrigger>
            <MenuPopup align="end" className="w-48">
              <MenuItem render={<Link href={`/pos?type=PROFORMA&customer=${c.id}`} />}>
                <FileClock /> Proforma
              </MenuItem>
              <MenuItem render={<Link href={`/pos?type=INVOICE&customer=${c.id}`} />}>
                <FileCheck2 /> Invoice
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Total revenue" value={formatINR(m.totalRevenue)} />
        <Metric label="Outstanding" value={formatINR(m.outstanding)} tone={Number(m.outstanding) > 0 ? "warn" : undefined} />
        <Metric label="Invoices" value={String(m.invoiceCount)} />
        <Metric label="Proformas" value={String(m.proformaCount)} hint={formatINR(m.proformaValue)} />
        <Metric label="Conversion" value={m.conversionRate === null ? "-" : `${Math.round(m.conversionRate * 100)}%`} hint="Proformas to invoices" />
        <Metric label="Last contact" value={m.lastContactAt ? fmtRelative(m.lastContactAt) : "Never"} hint={`${m.openFollowUps} open follow-up${m.openFollowUps === 1 ? "" : "s"}`} />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList variant="underline" className="w-full justify-start *:data-[slot=tabs-tab]:grow-0 *:data-[slot=tabs-tab]:px-3 overflow-x-auto border-b">
          <TabsTab value="overview">Overview</TabsTab>
          <TabsTab value="invoices">Invoices ({invoices.length})</TabsTab>
          <TabsTab value="proformas">Proformas ({proformas.length})</TabsTab>
          <TabsTab value="activity">Activity</TabsTab>
          <TabsTab value="followups">Follow-ups ({openFollowUps.length})</TabsTab>
          <TabsTab value="payments">Payments ({c.payments.length})</TabsTab>
          <TabsTab value="notes">Notes</TabsTab>
        </TabsList>

        <TabsPanel value="overview" className="pt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-4">
              <SectionCard title="Documents" description="Newest first">
                <DocTable docs={c.documents.slice(0, 8)} showType />
              </SectionCard>
              <SectionCard
                title="Open follow-ups"
                action={
                  <Button size="xs" variant="outline" onClick={() => setFollowOpen(true)}>
                    Schedule
                  </Button>
                }
              >
                <FollowUpList items={openFollowUps} loading={followups.isLoading} compact hideCustomer empty="No follow-ups planned for this customer." />
              </SectionCard>
            </div>
            <SectionCard
              title="Timeline"
              action={
                <Button size="xs" variant="outline" onClick={() => setLogOpen(true)}>
                  Log activity
                </Button>
              }
            >
              <ActivityTimeline items={activities.data?.slice(0, 15)} loading={activities.isLoading} />
            </SectionCard>
          </div>
        </TabsPanel>
        <TabsPanel value="invoices" className="pt-4">
          <SectionCard>
            <DocTable docs={invoices} empty="No invoices yet. Convert an accepted proforma or create one in the POS." />
          </SectionCard>
        </TabsPanel>
        <TabsPanel value="proformas" className="pt-4">
          <SectionCard>
            <DocTable docs={proformas} empty="No proformas yet." />
          </SectionCard>
        </TabsPanel>
        <TabsPanel value="activity" className="pt-4">
          <SectionCard>
            <ActivityTimeline items={activities.data} loading={activities.isLoading} />
          </SectionCard>
        </TabsPanel>
        <TabsPanel value="followups" className="pt-4">
          <SectionCard
            action={
              <Button size="xs" variant="outline" onClick={() => setFollowOpen(true)}>
                Schedule
              </Button>
            }
            title="All follow-ups"
          >
            <FollowUpList items={followups.data} loading={followups.isLoading} hideCustomer empty="No follow-ups yet." />
          </SectionCard>
        </TabsPanel>
        <TabsPanel value="payments" className="pt-4">
          <SectionCard>
            {c.payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="tabular">{fmtDate(p.paidAt)}</TableCell>
                      <TableCell className="tabular">
                        <Link className="hover:underline" href={`/invoices/${p.documentId}`}>
                          {p.document.number}
                        </Link>
                      </TableCell>
                      <TableCell>{PAYMENT_METHOD_LABEL[p.method]}</TableCell>
                      <TableCell className="text-muted-foreground">{p.reference ?? "-"}</TableCell>
                      <TableCell className="text-right font-medium tabular">{formatINR(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsPanel>
        <TabsPanel value="notes" className="pt-4">
          <SectionCard title="Notes" description="Saved automatically">
            <NotesEditor id={c.id} initial={c.notes ?? ""} />
          </SectionCard>
        </TabsPanel>
      </Tabs>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={c} />
      <LogActivityDialog open={logOpen} onOpenChange={setLogOpen} customerId={c.id} />
      <FollowUpDialog open={followOpen} onOpenChange={setFollowOpen} customer={{ id: c.id, name: c.name }} />
    </div>
  );
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "warn" ? "mt-1 text-lg font-semibold text-warning-foreground" : "mt-1 text-lg font-semibold"}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DocTable({ docs, showType, empty = "No documents yet." }: { docs: CustomerDoc[]; showType?: boolean; empty?: string }) {
  if (!docs.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Number</TableHead>
          {showType && <TableHead className="hidden sm:table-cell">Type</TableHead>}
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {docs.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium tabular">
              <Link href={docPath(d)} className="hover:underline">
                {d.number}
              </Link>
              {d.derivedDocuments[0] && <div className="text-xs font-normal text-muted-foreground">to {d.derivedDocuments[0].number}</div>}
            </TableCell>
            {showType && <TableCell className="hidden text-muted-foreground sm:table-cell">{d.type === "INVOICE" ? "Invoice" : "Proforma"}</TableCell>}
            <TableCell className="text-muted-foreground tabular">{fmtDate(d.issueDate)}</TableCell>
            <TableCell>
              <StatusBadge status={d.status} size="sm" />
            </TableCell>
            <TableCell className="text-right tabular">
              <div className="font-medium">{formatINR(d.grandTotal)}</div>
              {d.type === "INVOICE" && Number(d.balanceDue) > 0 && d.status !== "DRAFT" && <div className="text-xs text-muted-foreground">{formatINR(d.balanceDue)} due</div>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NotesEditor({ id, initial }: { id: string; initial: string }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const last = useRef(initial);

  useEffect(() => () => clearTimeout(timer.current), []);

  function onChange(v: string) {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v === last.current) return;
      setState("saving");
      try {
        await api.patch(`/customers/${id}`, { notes: v || null });
        last.current = v;
        setState("saved");
        qc.invalidateQueries({ queryKey: ["activities", "customer", id] });
      } catch (e) {
        setState("idle");
        toast.error("Notes not saved", e instanceof Error ? e.message : undefined);
      }
    }, 800);
  }

  return (
    <div className="grid gap-2">
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={10} placeholder="Site details, preferences, who to speak to, plants they liked" aria-label="Customer notes" />
      <p className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
        {state === "saving" && "Saving"}
        {state === "saved" && (
          <>
            <Check className="size-3.5" /> Saved
          </>
        )}
      </p>
    </div>
  );
}
