"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarPlus,
  CircleDollarSign,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Printer,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  dec,
  DOCUMENT_STATUS_LABEL,
  DOCUMENT_TYPE_LABEL,
  formatINR,
  formatPhone,
  manualStatusesFor,
  PAYMENT_METHOD_LABEL,
  type DocumentStatus,
} from "@organo/shared";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { ErrorState } from "@/components/common/error-state";
import { FollowUpDialog } from "@/components/followups/followup-dialog";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/common/section-card";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { Meter, MeterIndicator, MeterTrack } from "@/components/ui/meter";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative } from "@/lib/format";
import { copyText } from "@/lib/clipboard";
import { toast } from "@/lib/toast";
import type { Activity, DocumentDetail as Doc } from "@/lib/types";
import { DocumentPreview } from "./document-preview";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { SendMenu } from "./send-menu";
import { StatusBadge } from "./status-badge";
import { VoidPaymentDialog } from "./void-payment-dialog";
import { usePageTitle } from "@/hooks/use-page-title";
import { docPath, pdfUrl, useDocumentActions } from "./use-document-actions";

export function DocumentDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: doc, isLoading, error, refetch } = useQuery({ queryKey: ["document", id], queryFn: () => api.get<Doc>(`/documents/${id}`) });
  const activities = useQuery({ queryKey: ["activities", "document", id], queryFn: () => api.get<Activity[]>(`/documents/${id}/activities`) });
  const { convert, duplicate, setStatus, confirmWhatsApp } = useDocumentActions();
  usePageTitle(doc ? `${doc.number} ${doc.customer.name}` : null);
  const [payOpen, setPayOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [voiding, setVoiding] = useState<Doc["payments"][number] | null>(null);

  const voidPayment = useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) => api.post(`/payments/${paymentId}/void`, { reason }),
    onSuccess: () => {
      for (const k of [["document", id], ["documents"], ["activities"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      toast.success("Payment voided");
      setVoiding(null);
    },
    onError: (e) => toast.error(e),
  });

  if (isLoading)
    return (
      <div className="mx-auto grid w-full max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="aspect-[210/297] w-full" />
        <div className="grid content-start gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-60" />
        </div>
      </div>
    );
  if (error || !doc) return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this document" />;

  const isInvoice = doc.type === "INVOICE";
  const locked = doc.status === "CONVERTED" || doc.status === "CANCELLED";
  const listHref = isInvoice ? "/invoices" : "/proformas";
  const derivedInvoice = doc.derivedDocuments.find((d) => d.type === "INVOICE");
  const paidPct = dec(doc.grandTotal).gt(0) ? dec(doc.amountPaid).div(doc.grandTotal).mul(100).toNumber() : 0;

  // WhatsApp opened after the last confirmed send: ask the user what happened.
  const acts = activities.data ?? [];
  const lastOpened = acts.find((a) => a.type === "WHATSAPP_OPENED");
  const lastSent = acts.find((a) => a.type === "WHATSAPP_SENT");
  const pendingWhatsApp = lastOpened && (!lastSent || new Date(lastOpened.createdAt) > new Date(lastSent.createdAt));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="icon-sm" variant="ghost" render={<Link href={listHref} />} aria-label={`Back to ${isInvoice ? "invoices" : "proformas"}`}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight tabular">{doc.number}</h2>
            <StatusBadge status={doc.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {DOCUMENT_TYPE_LABEL[doc.type]} for{" "}
            <Link href={`/customers/${doc.customer.id}`} className="font-medium text-foreground hover:underline">
              {doc.customer.name}
            </Link>
            , {fmtDate(doc.issueDate)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!locked && (
            <Button variant="outline" render={<Link href={`/pos?edit=${doc.id}`} />}>
              <PencilLine /> Edit
            </Button>
          )}
          {!isInvoice && !derivedInvoice && doc.status !== "REJECTED" && doc.status !== "CANCELLED" && (
            <Button variant="outline" loading={convert.isPending} onClick={() => convert.mutate(doc.id)}>
              <ArrowRightLeft /> Convert to invoice
            </Button>
          )}
          {isInvoice && !["PAID", "CANCELLED"].includes(doc.status) && (
            <Button variant="outline" onClick={() => setPayOpen(true)}>
              <CircleDollarSign /> Record payment
            </Button>
          )}
          {doc.status !== "CANCELLED" && <SendMenu ensureSaved={async () => doc.id} />}
          <Menu>
            <MenuTrigger render={<Button size="icon" variant="outline" aria-label="More actions" />}>
              <MoreHorizontal />
            </MenuTrigger>
            <MenuPopup align="end" className="w-60">
              <MenuItem render={<a href={pdfUrl(doc.id, true)} />}>
                <Download /> Download PDF
              </MenuItem>
              <MenuItem render={<a href={pdfUrl(doc.id)} target="_blank" rel="noreferrer" />}>
                <Printer /> Open PDF to print
              </MenuItem>
              <MenuItem render={<a href={`/i/${doc.publicToken}`} target="_blank" rel="noreferrer" />}>
                <ExternalLink /> Open public page
              </MenuItem>
              <MenuItem
                onClick={() => copyText(doc.publicUrl, "Public link copied")}
              >
                <Copy /> Copy public link
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => setFollowOpen(true)}>
                <CalendarPlus /> Schedule follow-up
              </MenuItem>
              <MenuItem onClick={() => duplicate.mutate({ id: doc.id })}>
                <Copy /> Duplicate
              </MenuItem>
              <MenuItem onClick={() => duplicate.mutate({ id: doc.id, type: isInvoice ? "PROFORMA" : "INVOICE" })}>
                <Copy /> Duplicate as {isInvoice ? "proforma" : "invoice"}
              </MenuItem>
              {doc.status !== "CONVERTED" && (
                <>
                  <MenuSeparator />
                  <MenuSub>
                    <MenuSubTrigger>Change status</MenuSubTrigger>
                    <MenuSubPopup>
                      <MenuGroup>
                      <MenuGroupLabel>Set status</MenuGroupLabel>
                      {manualStatusesFor(doc.type)
                        .filter((s) => s !== doc.status)
                        .map((s) => (
                          <MenuItem key={s} variant={s === "CANCELLED" || s === "REJECTED" ? "destructive" : "default"} onClick={() => setStatus.mutate({ id: doc.id, status: s as DocumentStatus })}>
                            {DOCUMENT_STATUS_LABEL[s]}
                          </MenuItem>
                        ))}
                      </MenuGroup>
                    </MenuSubPopup>
                  </MenuSub>
                </>
              )}
            </MenuPopup>
          </Menu>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <div className="rounded-xl bg-muted/50 p-3 sm:p-6">
            <DocumentPreview doc={doc.renderable} className="mx-auto max-w-[820px]" />
          </div>
        </div>

        <aside className="grid content-start gap-4">
          {pendingWhatsApp && (
            <Alert variant="info">
              <MessageCircle />
              <AlertTitle>Did the WhatsApp message go out?</AlertTitle>
              <AlertDescription>WhatsApp was opened {fmtRelative(lastOpened!.createdAt)}. We can&apos;t see whether you pressed send.</AlertDescription>
              <AlertAction>
                <Button size="xs" loading={confirmWhatsApp.isPending} onClick={() => confirmWhatsApp.mutate(doc.id)}>
                  Yes, sent
                </Button>
              </AlertAction>
            </Alert>
          )}

          <SectionCard title="Summary" bodyClassName="grid gap-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-2xl font-semibold tracking-tight tabular">{formatINR(doc.grandTotal)}</span>
              </div>
              {isInvoice && (
                <div className="grid gap-1.5">
                  <Meter value={Math.min(100, paidPct)}>
                    <MeterTrack>
                      <MeterIndicator />
                    </MeterTrack>
                  </Meter>
                  <div className="flex justify-between text-xs text-muted-foreground tabular">
                    <span>Paid {formatINR(doc.amountPaid)}</span>
                    <span>Due {formatINR(doc.balanceDue)}</span>
                  </div>
                </div>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t pt-3 text-sm">
                <dt className="text-muted-foreground">Customer</dt>
                <dd className="truncate text-right">
                  <Link href={`/customers/${doc.customer.id}`} className="hover:underline">
                    {doc.customer.name}
                  </Link>
                </dd>
                {doc.customer.phone && (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-right tabular">{formatPhone(doc.customer.phone)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Issued</dt>
                <dd className="text-right tabular">{fmtDate(doc.issueDate)}</dd>
                {isInvoice ? (
                  <>
                    <dt className="text-muted-foreground">Due</dt>
                    <dd className="text-right tabular">{fmtDate(doc.dueDate) || "-"}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Valid until</dt>
                    <dd className="text-right tabular">{fmtDate(doc.validUntil) || "-"}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Sent</dt>
                <dd className="text-right">{doc.sentAt ? fmtDate(doc.sentAt) : "Not yet"}</dd>
                <dt className="text-muted-foreground">Viewed</dt>
                <dd className="text-right">{doc.viewedAt ? fmtRelative(doc.viewedAt) : "Not yet"}</dd>
                {doc.sourceDocument && (
                  <>
                    <dt className="text-muted-foreground">From</dt>
                    <dd className="text-right tabular">
                      <Link href={docPath(doc.sourceDocument)} className="hover:underline">
                        {doc.sourceDocument.number}
                      </Link>
                    </dd>
                  </>
                )}
                {doc.derivedDocuments.map((d) => (
                  <div key={d.id} className="contents">
                    <dt className="text-muted-foreground">{d.type === "INVOICE" ? "Invoice" : "Copy"}</dt>
                    <dd className="text-right tabular">
                      <Link href={docPath(d)} className="hover:underline">
                        {d.number}
                      </Link>
                    </dd>
                  </div>
                ))}
                {doc.createdBy && (
                  <>
                    <dt className="text-muted-foreground">Created by</dt>
                    <dd className="text-right">{doc.createdBy.name}</dd>
                  </>
                )}
              </dl>
          </SectionCard>

          {isInvoice && (
            <SectionCard
              title="Payments"
              action={
                !["PAID", "CANCELLED"].includes(doc.status) && (
                  <Button size="xs" variant="outline" onClick={() => setPayOpen(true)}>
                    Record
                  </Button>
                )
              }
            >
                {doc.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payments recorded yet.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {doc.payments.map((p) => (
                      <li key={p.id} className="group flex items-start justify-between gap-3 text-sm">
                        <div>
                          <div className="font-medium tabular">{formatINR(p.amount)}</div>
                          <div className="text-xs text-muted-foreground">
                            {PAYMENT_METHOD_LABEL[p.method]}, {fmtDate(p.paidAt)}
                            {p.reference && `, ref ${p.reference}`}
                          </div>
                        </div>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Void payment"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setVoiding(p)}
                        >
                          <Undo2 />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
            </SectionCard>
          )}

          <SectionCard title="Activity">
            <ActivityTimeline items={acts} loading={activities.isLoading} showDocument={false} />
          </SectionCard>
        </aside>
      </div>

      {isInvoice && <RecordPaymentDialog key={doc.balanceDue} documentId={doc.id} number={doc.number} balanceDue={doc.balanceDue} open={payOpen} onOpenChange={setPayOpen} />}
      <VoidPaymentDialog payment={voiding} onClose={() => setVoiding(null)} pending={voidPayment.isPending} onConfirm={(reason) => voiding && voidPayment.mutate({ paymentId: voiding.id, reason })} />
      <FollowUpDialog
        open={followOpen}
        onOpenChange={setFollowOpen}
        customer={{ id: doc.customer.id, name: doc.customer.name }}
        document={{ id: doc.id, number: doc.number }}
      />
    </div>
  );
}
