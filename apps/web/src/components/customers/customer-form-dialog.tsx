"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatPhone } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiClientError } from "@/lib/api";
import { toast } from "@/lib/toast";

export interface CustomerFormValues {
  id?: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  city: string | null;
  source: string | null;
  notes: string | null;
}

const empty: CustomerFormValues = {
  name: "",
  companyName: null,
  phone: null,
  email: null,
  gstin: null,
  billingAddress: null,
  shippingAddress: null,
  city: null,
  source: null,
  notes: null,
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer?: CustomerFormValues | null;
  onSaved?: (c: { id: string; name: string }) => void;
}

export function CustomerFormDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-xl">{props.open && <CustomerForm {...props} />}</DialogPopup>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so every open starts from fresh values. */
function CustomerForm({ onOpenChange, customer, onSaved }: Props) {
  const qc = useQueryClient();
  const [v, setV] = useState<CustomerFormValues>(() =>
    customer ? { ...customer, phone: customer.phone ? formatPhone(customer.phone) : null } : empty,
  );
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const set = (k: keyof CustomerFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value || null }));

  const save = useMutation({
    mutationFn: () => {
      const { id, ...body } = v;
      return id ? api.patch<{ id: string; name: string }>(`/customers/${id}`, body) : api.post<{ id: string; name: string }>("/customers", body);
    },
    onSuccess: (c) => {
      for (const k of [["customers"], ["customer", c.id], ["activities"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(customer?.id ? "Customer updated" : `${c.name} added`);
      onOpenChange(false);
      onSaved?.(c);
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.errors) setErrors(e.errors);
      toast.error(e);
    },
  });

  const field = (k: keyof CustomerFormValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <Input value={(v[k] as string | null) ?? ""} onChange={set(k)} aria-invalid={!!errors[k] || undefined} {...props} />
      {errors[k] && <span className="text-xs font-normal text-destructive-foreground">{errors[k]![0]}</span>}
    </label>
  );

  return (
    <>
        <DialogHeader>
          <DialogTitle>{customer?.id ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Phone numbers are stored in +91 format for WhatsApp.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {field("name", "Name", { autoFocus: true })}
            {field("companyName", "Company")}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("phone", "Phone", { inputMode: "tel", placeholder: "98110 45237" })}
            {field("email", "Email", { type: "email" })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("gstin", "GSTIN")}
            {field("city", "City")}
            {field("source", "Source", { placeholder: "Referral, Instagram" })}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Billing address
            <Textarea value={v.billingAddress ?? ""} onChange={set("billingAddress")} rows={2} className="font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Site / shipping address
            <Textarea value={v.shippingAddress ?? ""} onChange={set("shippingAddress")} rows={2} className="font-normal" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Notes
            <Textarea value={v.notes ?? ""} onChange={set("notes")} rows={3} className="font-normal" />
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button loading={save.isPending} disabled={!v.name.trim()} onClick={() => save.mutate()}>
            {customer?.id ? "Save" : "Add customer"}
          </Button>
        </DialogFooter>
    </>
  );
}
