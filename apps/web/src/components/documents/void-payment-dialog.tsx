"use client";

import { useState } from "react";
import { formatINR, PAYMENT_METHOD_LABEL } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";
import type { Payment } from "@/lib/types";

export function VoidPaymentDialog({ payment, onClose, onConfirm, pending }: { payment: Payment | null; onClose: () => void; onConfirm: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={!!payment}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setReason("");
        }
      }}
    >
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Void this payment?</DialogTitle>
          <DialogDescription>
            {payment && `${formatINR(payment.amount)} by ${PAYMENT_METHOD_LABEL[payment.method]} on ${fmtDate(payment.paidAt)}.`} The balance and status update, and the payment stays in the history marked as voided.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <label className="grid gap-1.5 text-sm font-medium">
            Reason
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque bounced, entered twice" autoFocus />
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Keep payment</DialogClose>
          <Button variant="destructive" disabled={!reason.trim()} loading={pending} onClick={() => onConfirm(reason.trim())}>
            Void payment
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
