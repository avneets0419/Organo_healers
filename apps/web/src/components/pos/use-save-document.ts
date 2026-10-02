"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dec, DOCUMENT_TYPE_LABEL, formatINR, isValidIndianMobile } from "@organo/shared";
import { api, ApiClientError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { DocumentDetail } from "@/lib/types";
import { itemCount, toDocumentInput, usePos } from "./pos-store";

export class DraftValidationError extends Error {}

/** Client-side checks for fast feedback. The server validates everything again. */
export function validateDraft(): string | null {
  const d = usePos.getState();
  if (!d.customer.name.trim()) return "Add the customer's name";
  if (d.customer.phone.trim() && !isValidIndianMobile(d.customer.phone)) return "Customer phone isn't a valid Indian mobile number";
  if (d.customer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.customer.email.trim())) return "Customer email looks wrong";
  if (!itemCount(d.groups)) return "Add at least one item";
  for (const g of d.groups)
    for (const i of g.items) {
      if (!i.name.trim()) return "Every line needs a name";
      if (!i.quantity || dec(i.quantity).lte(0)) return `Quantity for "${i.name}" must be more than 0`;
    }
  return null;
}

async function ensureCustomer(): Promise<string> {
  const { customer } = usePos.getState();
  const payload = {
    name: customer.name.trim(),
    phone: customer.phone.trim() || null,
    email: customer.email.trim() || null,
  };
  if (!customer.id) {
    try {
      const c = await api.post<{ id: string }>("/customers", {
        ...payload,
        billingAddress: customer.billingAddress.trim() || null,
        shippingAddress: customer.shippingAddress.trim() || null,
      });
      usePos.getState().setCustomer({ id: c.id, original: { name: payload.name, phone: customer.phone, email: customer.email } });
      return c.id;
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "DUPLICATE_CUSTOMER") {
        throw new ApiClientError(`${e.message}. Pick them from the suggestions instead of creating a new customer.`, 409, e.code);
      }
      throw e;
    }
  }
  const o = customer.original;
  if (o && (o.name !== customer.name || o.phone !== customer.phone || o.email !== customer.email)) {
    await api.patch(`/customers/${customer.id}`, payload);
  }
  return customer.id;
}

export function useSaveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<DocumentDetail> => {
      const problem = validateDraft();
      if (problem) throw new DraftValidationError(problem);
      const customerId = await ensureCustomer();
      const d = usePos.getState();
      const input = toDocumentInput(d, customerId);
      return d.documentId ? api.put<DocumentDetail>(`/documents/${d.documentId}`, input) : api.post<DocumentDetail>("/documents", input);
    },
    onSuccess: (doc) => {
      const wasNew = !usePos.getState().documentId;
      usePos.getState().markSaved(doc);
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.setQueryData(["document", doc.id], doc);
      toast.success(`${DOCUMENT_TYPE_LABEL[doc.type]} ${doc.number} ${wasNew ? "saved" : "updated"}`, `Total ${formatINR(doc.grandTotal)}`);
    },
    onError: (e) => toast.error(e),
  });
}
