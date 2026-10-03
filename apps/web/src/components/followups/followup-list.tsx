"use client";

import { Mail, MapPin, MessageCircle, MoreHorizontal, Phone, Users } from "lucide-react";
import Link from "next/link";
import { FOLLOWUP_PRIORITY_LABEL, FOLLOWUP_STATUS_LABEL, type FollowUpChannel } from "@organo/shared";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import type { FollowUp } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CHANNEL_ICON: Record<FollowUpChannel, typeof Phone> = {
  CALL: Phone,
  WHATSAPP: MessageCircle,
  EMAIL: Mail,
  MEETING: Users,
  VISIT: MapPin,
  OTHER: MoreHorizontal,
};

export function isOverdue(f: Pick<FollowUp, "dueAt" | "status">) {
  return (f.status === "PENDING" || f.status === "SCHEDULED") && new Date(f.dueAt) < new Date();
}

export function PriorityBadge({ priority }: { priority: FollowUp["priority"] }) {
  if (priority === "MEDIUM" || priority === "LOW") return null;
  return (
    <Badge variant={priority === "URGENT" ? "error" : "warning"} size="sm">
      {FOLLOWUP_PRIORITY_LABEL[priority]}
    </Badge>
  );
}

export function FollowUpList({
  items,
  loading,
  compact,
  hideCustomer,
  selectedId,
  onSelect,
  empty = "Nothing here.",
}: {
  items?: FollowUp[];
  loading?: boolean;
  compact?: boolean;
  hideCustomer?: boolean;
  selectedId?: string | null;
  onSelect?: (f: FollowUp) => void;
  empty?: string;
}) {
  if (loading)
    return (
      <div className="grid gap-2">
        {Array.from({ length: compact ? 2 : 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  if (!items?.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid gap-1">
      {items.map((f) => {
        const Icon = CHANNEL_ICON[f.channel];
        const overdue = isOverdue(f);
        const done = f.status === "COMPLETED" || f.status === "CANCELLED";
        const content = (
          <>
            <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border bg-card", overdue ? "text-destructive-foreground" : "text-muted-foreground")}>
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              {!hideCustomer && <span className="block truncate text-sm font-medium">{f.customer.name}</span>}
              <span className={cn("block truncate text-sm", hideCustomer ? "font-medium" : "text-muted-foreground", done && "line-through opacity-70")}>{f.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span className={cn("tabular", overdue && "font-medium text-destructive-foreground")} title={fmtDateTime(f.dueAt)}>
                  {done ? `${FOLLOWUP_STATUS_LABEL[f.status]} ${f.completedAt ? fmtRelative(f.completedAt) : ""}` : overdue ? `Overdue, ${fmtRelative(f.dueAt)}` : fmtDateTime(f.dueAt)}
                </span>
                {f.document && <span className="tabular">{f.document.number}</span>}
                {!done && <PriorityBadge priority={f.priority} />}
              </span>
              {f.outcome && <span className="mt-0.5 block text-xs text-muted-foreground">Outcome: {f.outcome}</span>}
            </span>
          </>
        );
        return (
          <li key={f.id}>
            {onSelect ? (
              <button
                onClick={() => onSelect(f)}
                aria-current={selectedId === f.id}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selectedId === f.id ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                {content}
              </button>
            ) : (
              <Link href={`/followups?id=${f.id}`} className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-accent/40">
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

