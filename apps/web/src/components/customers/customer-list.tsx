"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Eye, FileCheck2, FileClock, MessageCircle, MoreHorizontal, Phone, PencilLine, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buildWhatsAppUrl, formatINR, formatPhone, type CustomerStatus, type DocumentStatus } from "@organo/shared";
import { ErrorState } from "@/components/common/error-state";
import { PageBody, PageHeader } from "@/components/common/page-header";
import { PaginationBar } from "@/components/common/pagination-bar";
import { CustomerStatusBadge, StatusBadge } from "@/components/documents/status-badge";
import { FollowUpDialog } from "@/components/followups/followup-dialog";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CustomerFormDialog } from "./customer-form-dialog";

export interface CustomerRow {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  lastContactAt: string | null;
  createdAt: string;
  totalBusiness: string;
  outstanding: string;
  lastInvoice: { id: string; number: string; status: DocumentStatus; grandTotal: string; issueDate: string } | null;
  lastProforma: { id: string; number: string; status: DocumentStatus; grandTotal: string; issueDate: string } | null;
  nextFollowUp: { id: string; title: string; dueAt: string; priority: string } | null;
}

const FILTERS = [
  ["all", "All"],
  ["leads", "Leads"],
  ["proforma_sent", "Proforma sent"],
  ["proforma_accepted", "Proforma accepted"],
  ["invoice_created", "Invoiced"],
  ["invoice_paid", "Paid"],
  ["overdue", "Overdue"],
  ["no_followup", "No follow-up"],
] as const;
type Filter = (typeof FILTERS)[number][0];

export function CustomerList() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [followFor, setFollowFor] = useState<CustomerRow | null>(null);
  const dq = useDebounce(q.trim(), 250);

  const query = useQuery({
    queryKey: ["customers", dq, filter, page],
    queryFn: () => api.page<CustomerRow>("/customers", { q: dq || undefined, filter, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.data ?? [];

  return (
    <PageBody>
      <PageHeader
        title="Customers"
        description={query.data ? `${query.data.meta.total} ${filter === "all" ? "customers" : "matching"}` : " "}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> New customer
          </Button>
        }
      />

      <div className="mt-5 flex flex-col gap-3">
        <InputGroup className="w-full sm:w-96">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name, phone or email"
            aria-label="Search customers"
          />
        </InputGroup>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filter customers">
          {FILTERS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => {
                setFilter(k);
                setPage(1);
              }}
              className={cn(
                "h-7 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === k ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <Empty className="rounded-xl border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>{dq || filter !== "all" ? "No customers match" : "No customers yet"}</EmptyTitle>
              <EmptyDescription>Customers are created from the POS when you save a document, or added here.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              New customer
            </Button>
          </Empty>
        ) : (
          <div className={cn("overflow-hidden rounded-xl border transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Contact</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Total business</TableHead>
                  <TableHead className="hidden xl:table-cell">Last proforma</TableHead>
                  <TableHead className="hidden xl:table-cell">Last invoice</TableHead>
                  <TableHead className="hidden lg:table-cell">Last contact</TableHead>
                  <TableHead>Next follow-up</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const wa = c.phone ? buildWhatsAppUrl(c.phone, `Hello ${c.name},\n\n`) : null;
                  const fuOverdue = c.nextFollowUp && new Date(c.nextFollowUp.dueAt) < new Date();
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/customers/${c.id}`)}>
                      <TableCell className="max-w-64">
                        <Link href={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                          {c.name}
                        </Link>
                        <div className="mt-0.5">
                          <CustomerStatusBadge status={c.status} size="sm" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-sm md:table-cell">
                        <div className="tabular">{c.phone ? formatPhone(c.phone) : <span className="text-muted-foreground">No phone</span>}</div>
                        {c.email && <div className="max-w-48 truncate text-xs text-muted-foreground">{c.email}</div>}
                      </TableCell>
                      <TableCell className="hidden text-right lg:table-cell">
                        <div className="font-medium tabular">{formatINR(c.totalBusiness)}</div>
                        {Number(c.outstanding) > 0 && <div className="text-xs text-warning-foreground tabular">{formatINR(c.outstanding)} due</div>}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {c.lastProforma ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm tabular">{c.lastProforma.number}</span>
                            <StatusBadge status={c.lastProforma.status} size="sm" />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {c.lastInvoice ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm tabular">{c.lastInvoice.number}</span>
                            <StatusBadge status={c.lastInvoice.status} size="sm" />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{c.lastContactAt ? fmtRelative(c.lastContactAt) : "Never"}</TableCell>
                      <TableCell className="text-sm">
                        {c.nextFollowUp ? (
                          <div>
                            <div className={cn("tabular", fuOverdue && "font-medium text-destructive-foreground")}>{fmtDate(c.nextFollowUp.dueAt)}</div>
                            <div className="max-w-40 truncate text-xs text-muted-foreground">{c.nextFollowUp.title}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Menu>
                          <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${c.name}`} />}>
                            <MoreHorizontal />
                          </MenuTrigger>
                          <MenuPopup align="end" className="w-56">
                            <MenuItem render={<Link href={`/customers/${c.id}`} />}>
                              <Eye /> View
                            </MenuItem>
                            <MenuItem render={<Link href={`/pos?type=PROFORMA&customer=${c.id}`} />}>
                              <FileClock /> Create proforma
                            </MenuItem>
                            <MenuItem render={<Link href={`/pos?type=INVOICE&customer=${c.id}`} />}>
                              <FileCheck2 /> Create invoice
                            </MenuItem>
                            {c.lastProforma && c.lastProforma.status !== "CONVERTED" && (
                              <MenuItem render={<Link href={`/proformas/${c.lastProforma.id}`} />}>
                                <PencilLine /> Open {c.lastProforma.number}
                              </MenuItem>
                            )}
                            <MenuItem onClick={() => setFollowFor(c)}>
                              <CalendarPlus /> Schedule follow-up
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem disabled={!c.phone} render={c.phone ? <a href={`tel:${c.phone}`} /> : undefined}>
                              <Phone /> Call
                            </MenuItem>
                            <MenuItem disabled={!wa} render={wa ? <a href={wa} target="_blank" rel="noreferrer" /> : undefined}>
                              <MessageCircle /> WhatsApp
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-3">
          <PaginationBar meta={query.data?.meta} onPage={setPage} />
        </div>
      </div>

      <CustomerFormDialog open={createOpen} onOpenChange={setCreateOpen} onSaved={(c) => router.push(`/customers/${c.id}`)} />
      {followFor && <FollowUpDialog open onOpenChange={(o) => !o && setFollowFor(null)} customer={{ id: followFor.id, name: followFor.name }} />}
    </PageBody>
  );
}

