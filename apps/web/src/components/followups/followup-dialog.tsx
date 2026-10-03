"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  FOLLOWUP_CHANNEL_LABEL,
  FOLLOWUP_CHANNELS,
  FOLLOWUP_PRIORITIES,
  FOLLOWUP_PRIORITY_LABEL,
  type FollowUpChannel,
  type FollowUpPriority,
} from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { fmtDate, isoDay } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { FollowUp } from "@/lib/types";

const QUICK: Array<[string, number]> = [
  ["Tomorrow", 1],
  ["In 3 days", 3],
  ["Next week", 7],
];

function addDaysIso(days: number) {
  return isoDay(new Date(Date.now() + days * 86_400_000));
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer: { id: string; name: string };
  document?: { id: string; number: string } | null;
  /** Pass to edit an existing follow-up. */
  followUp?: FollowUp | null;
}

export function FollowUpDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-lg">{props.open && <FollowUpForm {...props} />}</DialogPopup>
    </Dialog>
  );
}

function initialFor(followUp: FollowUp | null | undefined) {
  if (!followUp) return null;
  const ist = new Date(new Date(followUp.dueAt).getTime() + 5.5 * 3600_000).toISOString();
  return { date: ist.slice(0, 10), time: ist.slice(11, 16) };
}

function FollowUpForm({ onOpenChange, customer, document, followUp }: Props) {
  const qc = useQueryClient();
  const existing = initialFor(followUp);
  const [title, setTitle] = useState(followUp?.title ?? (document ? `Follow up on ${document.number}` : `Check in with ${customer.name}`));
  const [channel, setChannel] = useState<FollowUpChannel>(followUp?.channel ?? "CALL");
  const [date, setDate] = useState(() => existing?.date ?? addDaysIso(document ? 2 : 1));
  const [time, setTime] = useState(existing?.time ?? "11:00");
  const [priority, setPriority] = useState<FollowUpPriority>(followUp?.priority ?? "MEDIUM");
  const [notes, setNotes] = useState(followUp?.notes ?? "");
  const [remind, setRemind] = useState("30");

  const save = useMutation({
    mutationFn: () => {
      const dueAt = new Date(`${date}T${time}:00+05:30`);
      const reminderAt = remind === "none" ? null : new Date(dueAt.getTime() - Number(remind) * 60_000);
      const body = { customerId: customer.id, documentId: document?.id ?? followUp?.documentId ?? null, title, channel, dueAt, reminderAt, priority, notes: notes || null, status: "SCHEDULED" };
      return followUp ? api.patch<FollowUp>(`/followups/${followUp.id}`, body) : api.post<FollowUp>("/followups", body);
    },
    onSuccess: () => {
      for (const k of [["followups"], ["sidebar-counts"], ["customer"], ["customers"], ["activities"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(followUp ? "Follow-up updated" : "Follow-up scheduled", `${customer.name}, ${fmtDate(`${date}T12:00:00+05:30`)} at ${time}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
        <DialogHeader>
          <DialogTitle>{followUp ? "Edit follow-up" : "Schedule follow-up"}</DialogTitle>
          <DialogDescription>
            {customer.name}
            {document && `, ${document.number}`}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">
            What needs to happen
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>
          <div className="grid gap-1.5 text-sm font-medium">
            How
            <ToggleGroup value={[channel]} onValueChange={(v: string[]) => v[0] && setChannel(v[0] as FollowUpChannel)} variant="outline" size="sm" className="flex-wrap">
              {FOLLOWUP_CHANNELS.map((c) => (
                <ToggleGroupItem key={c} value={c}>
                  {FOLLOWUP_CHANNEL_LABEL[c]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Date
              <Input type="date" nativeInput value={date} min={isoDay()} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Time
              <Input type="time" nativeInput value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(([label, days]) => (
              <Button key={label} size="xs" variant="outline" onClick={() => setDate(addDaysIso(days))}>
                {label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Priority
              <Select value={priority} onValueChange={(v) => setPriority(v as FollowUpPriority)}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => FOLLOWUP_PRIORITY_LABEL[v as FollowUpPriority]}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {FOLLOWUP_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {FOLLOWUP_PRIORITY_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Reminder
              <Select value={remind} onValueChange={(v) => setRemind(v as string)}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => ({ none: "No reminder", "15": "15 min before", "30": "30 min before", "60": "1 hour before", "1440": "1 day before" })[v] ?? v}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="none">No reminder</SelectItem>
                  <SelectItem value="15">15 min before</SelectItem>
                  <SelectItem value="30">30 min before</SelectItem>
                  <SelectItem value="60">1 hour before</SelectItem>
                  <SelectItem value="1440">1 day before</SelectItem>
                </SelectPopup>
              </Select>
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Notes
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Context for whoever makes the call" className="font-normal" />
          </label>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button loading={save.isPending} disabled={!title.trim() || !date} onClick={() => save.mutate()}>
            {followUp ? "Save" : "Schedule"}
          </Button>
        </DialogFooter>
    </>
  );
}
