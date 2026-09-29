"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ACTIVITY_TYPE_LABEL, MANUAL_ACTIVITY_TYPES, type ActivityType } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

const PROMPTS: Partial<Record<ActivityType, string>> = {
  CALL: "What was discussed? Next step?",
  MEETING: "Who met, where, and what was agreed?",
  NOTE: "Anything the team should know",
  WHATSAPP_SENT: "What did you send on WhatsApp?",
  PAYMENT_REMINDER: "Which invoice, and what did they say?",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  defaultType?: ActivityType;
}

export function LogActivityDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-lg">{props.open && <LogActivityForm {...props} />}</DialogPopup>
    </Dialog>
  );
}

function LogActivityForm({ onOpenChange, customerId, defaultType = "CALL" }: Props) {
  const qc = useQueryClient();
  const [type, setType] = useState<ActivityType>(defaultType);
  const [text, setText] = useState("");

  const save = useMutation({
    mutationFn: () => api.post("/activities", { customerId, type, description: text }),
    onSuccess: () => {
      for (const k of [["activities"], ["customer", customerId], ["customers"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(`${ACTIVITY_TYPE_LABEL[type]} logged`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <ToggleGroup value={[type]} onValueChange={(v: string[]) => v[0] && setType(v[0] as ActivityType)} variant="outline" size="sm" className="flex-wrap">
            {MANUAL_ACTIVITY_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t}>
                {ACTIVITY_TYPE_LABEL[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={PROMPTS[type]} autoFocus aria-label="Details" />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button loading={save.isPending} disabled={!text.trim()} onClick={() => save.mutate()}>
            Log {ACTIVITY_TYPE_LABEL[type].toLowerCase()}
          </Button>
        </DialogFooter>
    </>
  );
}
