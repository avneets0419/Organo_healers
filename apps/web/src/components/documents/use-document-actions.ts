"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { DOCUMENT_STATUS_LABEL, type DocumentStatus, type DocumentType } from "@organo/shared";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { DocumentDetail } from "@/lib/types";

export const docPath = (d: { id: string; type: DocumentType }) => `/${d.type === "INVOICE" ? "invoices" : "proformas"}/${d.id}`;

export function useDocumentActions() {
  const qc = useQueryClient();
  const router = useRouter();
  const refresh = (id?: string) => {
    for (const k of [["documents"], ["customers"], ["customer"], ["dashboard"], ["activities"], ["followups"]]) qc.invalidateQueries({ queryKey: k });
    if (id) qc.invalidateQueries({ queryKey: ["document", id] });
  };

  const convert = useMutation({
    mutationFn: (id: string) => api.post<DocumentDetail>(`/documents/${id}/convert`),
    onSuccess: (inv, id) => {
      refresh(id);
      toast.success(`Invoice ${inv.number} created`, `From ${inv.sourceDocument?.number}. The proforma is kept as it was.`);
      router.push(docPath(inv));
    },
    onError: (e) => toast.error(e),
  });

  const duplicate = useMutation({
    mutationFn: ({ id, type }: { id: string; type?: DocumentType }) => api.post<DocumentDetail>(`/documents/${id}/duplicate`, { type }),
    onSuccess: (d) => {
      refresh();
      toast.success(`${d.number} created as a draft copy`);
      router.push(`/pos?edit=${d.id}`);
    },
    onError: (e) => toast.error(e),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: DocumentStatus; note?: string }) => api.post<DocumentDetail>(`/documents/${id}/status`, { status, note }),
    onSuccess: (d) => {
      refresh(d.id);
      toast.success(`${d.number} marked ${DOCUMENT_STATUS_LABEL[d.status].toLowerCase()}`);
    },
    onError: (e) => toast.error(e),
  });

  const confirmWhatsApp = useMutation({
    mutationFn: (id: string) => api.post(`/documents/${id}/whatsapp-confirmed`),
    onSuccess: (_r, id) => {
      refresh(id);
      toast.success("Marked as sent on WhatsApp");
    },
    onError: (e) => toast.error(e),
  });

  return { convert, duplicate, setStatus, confirmWhatsApp, refresh };
}

export function pdfUrl(id: string, download = false) {
  return `/api/documents/${id}/pdf${download ? "?download=1" : ""}`;
}
