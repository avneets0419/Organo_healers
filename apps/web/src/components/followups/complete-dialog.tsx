"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { isoDay } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { FollowUp } from "@/lib/types";

/** Complete a follow-up with its outcome, optionally scheduling the next one in the same step. */
export function CompleteFollowUpDialog({ followUp, onClose }: { followUp: FollowUp | null; onClose: () => void }) {
  return (
    <Dialog open={!!followUp} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-md">{followUp && <CompleteForm key={followUp.id} followUp={followUp} onClose={onClose} />}</DialogPopup>
    </Dialog>
  );
}

function CompleteForm({ followUp, onClose }: { followUp: FollowUp; onClose: () => void }) {
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState(false);
  const [nextDate, setNextDate] = useState(() => isoDay(new Date(Date.now() + 3 * 86_400_000)));
  const [nextTitle, setNextTitle] = useState(followUp.title);

  const m = useMutation({
    mutationFn: async () => {
      const f = followUp;
      await api.patch(`/followups/${f.id}`, { status: "COMPLETED", outcome: outcome || null });
      if (next) {
        await api.post("/followups", {
          customerId: f.customerId,
          documentId: f.documentId,
          title: nextTitle || f.title,
          channel: f.channel,
          priority: f.priority,
          dueAt: new Date(`${nextDate}T11:00:00+05:30`),
          status: "SCHEDULED",
        });
      }
    },
    onSuccess: () => {
      for (const k of [["followups"], ["sidebar-counts"], ["activities"], ["customer"], ["customers"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      toast.success("Follow-up completed", next ? `Next one scheduled for ${nextDate}` : undefined);
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
        <DialogHeader>
          <DialogTitle>Complete follow-up</DialogTitle>
          <DialogDescription>
            {followUp.customer.name}: {followUp.title}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            What happened?
            <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} placeholder="e.g. Wants 2 more Areca palms, will confirm by Friday" className="font-normal" autoFocus />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={next} onCheckedChange={(v) => setNext(!!v)} /> Schedule the next follow-up
          </label>
          {next && (
            <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
              <Input value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} aria-label="Next follow-up title" />
              <Input type="date" nativeInput value={nextDate} min={isoDay()} onChange={(e) => setNextDate(e.target.value)} aria-label="Next follow-up date" />
            </div>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Mark complete
          </Button>
        </DialogFooter>
    </>
  );
}
