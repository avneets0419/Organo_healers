"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { dec, formatINR, PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { isoDay } from "@/lib/format";
import { toast } from "@/lib/toast";

export function RecordPaymentDialog({
  documentId,
  number,
  balanceDue,
  open,
  onOpenChange,
}: {
  documentId: string;
  number: string;
  balanceDue: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const full = dec(balanceDue).toString();
  const half = dec(balanceDue).div(2).toDecimalPlaces(0).toString();
  const [preset, setPreset] = useState<"full" | "half" | "custom">("full");
  const [amount, setAmount] = useState(full);
  const amountRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(isoDay());
  const [notes, setNotes] = useState("");

  const valid = !!amount && dec(amount).gt(0) && dec(amount).lte(balanceDue);
  const m = useMutation({
    mutationFn: () =>
      api.post(`/payments/documents/${documentId}`, {
        amount,
        method,
        reference: reference || null,
        notes: notes || null,
        paidAt: new Date(`${paidAt}T12:00:00+05:30`),
      }),
    onSuccess: () => {
      for (const k of [["document", documentId], ["documents"], ["customers"], ["customer"], ["dashboard"], ["activities"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(`${formatINR(amount)} recorded on ${number}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {number}, balance due {formatINR(balanceDue)}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <div className="grid gap-1.5 text-sm font-medium">
            How much was paid?
            <ToggleGroup
              value={[preset]}
              onValueChange={(v: string[]) => {
                const next = v[0] as typeof preset | undefined;
                if (!next) return;
                setPreset(next);
                if (next === "full") setAmount(full);
                if (next === "half") setAmount(half);
                if (next === "custom") {
                  setAmount("");
                  requestAnimationFrame(() => amountRef.current?.focus());
                }
              }}
              variant="outline"
              className="w-full *:flex-1"
            >
              <ToggleGroupItem value="full" className="data-pressed:border-primary/60 data-pressed:bg-brand-soft data-pressed:font-semibold data-pressed:text-primary">Full {formatINR(full)}</ToggleGroupItem>
              <ToggleGroupItem value="half" className="data-pressed:border-primary/60 data-pressed:bg-brand-soft data-pressed:font-semibold data-pressed:text-primary">50% {formatINR(half)}</ToggleGroupItem>
              <ToggleGroupItem value="custom" className="data-pressed:border-primary/60 data-pressed:bg-brand-soft data-pressed:font-semibold data-pressed:text-primary">Custom</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              {preset === "custom" ? "Custom amount (₹)" : "Amount (₹)"}
              <Input
                ref={amountRef}
                nativeInput
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => {
                  if (!/^\d*\.?\d{0,2}$/.test(e.target.value)) return;
                  setAmount(e.target.value);
                  setPreset(e.target.value === full ? "full" : e.target.value === half ? "half" : "custom");
                }}
                aria-invalid={(!!amount && !valid) || undefined}
                className="tabular"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Date
              <Input type="date" nativeInput value={paidAt} max={isoDay()} onChange={(e) => setPaidAt(e.target.value)} />
            </label>
          </div>
          {!!amount && dec(amount).gt(balanceDue) && <p className="-mt-1 text-xs text-destructive-foreground">More than the balance due ({formatINR(balanceDue)}).</p>}
          {valid && dec(amount).lt(balanceDue) && <p className="-mt-1 text-xs text-muted-foreground">{formatINR(dec(balanceDue).minus(amount))} will remain due.</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Method
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => PAYMENT_METHOD_LABEL[v as PaymentMethod]}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm} value={pm}>
                      {PAYMENT_METHOD_LABEL[pm]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Reference
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "CHEQUE" ? "Cheque no." : "UTR / txn id"} />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Notes
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>
            Record {valid ? formatINR(amount) : "payment"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
