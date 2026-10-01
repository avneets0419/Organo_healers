"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Copy, Download, ExternalLink, FileClock, FileCheck2, MoreHorizontal, PencilLine, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOCUMENT_STATUS_LABEL, formatINR, statusesFor, type DocumentStatus, type DocumentType } from "@organo/shared";
import { ErrorState } from "@/components/common/error-state";
import { PageBody, PageHeader } from "@/components/common/page-header";
import { PaginationBar } from "@/components/common/pagination-bar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebounce } from "@/hooks/use-debounce";
import { api, type PageMeta } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { DocumentRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";
import { docPath, pdfUrl, useDocumentActions } from "./use-document-actions";

type Sort = "newest" | "oldest" | "amount" | "due";

export function DocumentList({ type }: { type: DocumentType }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<DocumentStatus | "ALL">("ALL");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const dq = useDebounce(q.trim(), 250);
  const isInvoice = type === "INVOICE";
  const label = isInvoice ? "Invoices" : "Proformas";
  const { convert, duplicate } = useDocumentActions();

  const query = useQuery({
    queryKey: ["documents", type, dq, status, sort, page],
    queryFn: () =>
      api.page<DocumentRow, PageMeta & { sums: { grandTotal: string; balanceDue: string; amountPaid: string } }>("/documents", {
        type,
        q: dq || undefined,
        status: status === "ALL" ? undefined : status,
        sort,
        page,
        pageSize: 25,
      }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <PageBody>
      <PageHeader
        title={label}
        description={
          meta ? (
            <span className="tabular">
              {meta.total} {meta.total === 1 ? (isInvoice ? "invoice" : "proforma") : label.toLowerCase()}, {formatINR(meta.sums.grandTotal)}
              {isInvoice && ` total, ${formatINR(meta.sums.balanceDue)} outstanding`}
            </span>
          ) : (
            " "
          )
        }
        actions={
          <Button render={<Link href={`/pos?type=${type}`} />}>
            <Plus /> New {isInvoice ? "invoice" : "proforma"}
          </Button>
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-80">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Number, customer or phone"
            aria-label={`Search ${label.toLowerCase()}`}
          />
        </InputGroup>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as DocumentStatus | "ALL");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Status">
            <SelectValue>{(v: string) => (v === "ALL" ? "All statuses" : DOCUMENT_STATUS_LABEL[v as DocumentStatus])}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="ALL">All statuses</SelectItem>
            {statusesFor(type).map((s) => (
              <SelectItem key={s} value={s}>
                {DOCUMENT_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue>{(v: string) => ({ newest: "Newest first", oldest: "Oldest first", amount: "Largest amount", due: isInvoice ? "Due soonest" : "Expiring soonest" })[v as Sort]}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="amount">Largest amount</SelectItem>
            {isInvoice && <SelectItem value="due">Due soonest</SelectItem>}
          </SelectPopup>
        </Select>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <Empty className="rounded-xl border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">{isInvoice ? <FileCheck2 /> : <FileClock />}</EmptyMedia>
              <EmptyTitle>{dq || status !== "ALL" ? `No ${label.toLowerCase()} match these filters` : `No ${label.toLowerCase()} yet`}</EmptyTitle>
              <EmptyDescription>
                {isInvoice ? "Create one in the POS, or convert an accepted proforma." : "Build an estimate in the POS and send it to the customer."}
              </EmptyDescription>
            </EmptyHeader>
            <Button size="sm" render={<Link href={`/pos?type=${type}`} />}>
              Open POS
            </Button>
          </Empty>
        ) : (
          <div className={cn("overflow-hidden rounded-xl border transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="hidden lg:table-cell">{isInvoice ? "Due" : "Valid until"}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {isInvoice && <TableHead className="hidden text-right sm:table-cell">Balance</TableHead>}
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(docPath(d))}>
                    <TableCell className="font-medium tabular">
                      <Link href={docPath(d)} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {d.number}
                      </Link>
                      {d.derivedDocuments[0] && <div className="text-xs font-normal text-muted-foreground">to {d.derivedDocuments[0].number}</div>}
                      {d.sourceDocument && <div className="text-xs font-normal text-muted-foreground">from {d.sourceDocument.number}</div>}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <div className="truncate">{d.customer.name}</div>
                      {d.title && <div className="truncate text-xs text-muted-foreground">{d.title}</div>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular md:table-cell">{fmtDate(d.issueDate)}</TableCell>
                    <TableCell className="hidden text-muted-foreground tabular lg:table-cell">{fmtDate(isInvoice ? d.dueDate : d.validUntil) || "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">{formatINR(d.grandTotal)}</TableCell>
                    {isInvoice && <TableCell className="hidden text-right text-muted-foreground tabular sm:table-cell">{formatINR(d.balanceDue)}</TableCell>}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Menu>
                        <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${d.number}`} />}>
                          <MoreHorizontal />
                        </MenuTrigger>
                        <MenuPopup align="end" className="w-56">
                          <MenuItem disabled={d.status === "CONVERTED" || d.status === "CANCELLED"} onClick={() => router.push(`/pos?edit=${d.id}`)}>
                            <PencilLine /> Edit in POS
                          </MenuItem>
                          {!isInvoice && (
                            <MenuItem disabled={d.status === "CONVERTED" || d.status === "REJECTED" || convert.isPending} onClick={() => convert.mutate(d.id)}>
                              <ArrowRightLeft /> Convert to invoice
                            </MenuItem>
                          )}
                          <MenuItem onClick={() => duplicate.mutate({ id: d.id })}>
                            <Copy /> Duplicate
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem render={<a href={pdfUrl(d.id, true)} />}>
                            <Download /> Download PDF
                          </MenuItem>
                          <MenuItem render={<a href={`/i/${d.publicToken}`} target="_blank" rel="noreferrer" />}>
                            <ExternalLink /> Public page
                          </MenuItem>
                        </MenuPopup>
                      </Menu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-3">
          <PaginationBar meta={meta} onPage={setPage} />
        </div>
      </div>
    </PageBody>
  );
}
