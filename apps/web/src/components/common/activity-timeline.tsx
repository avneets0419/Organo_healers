"use client";

import {
  ArrowRightLeft,
  Ban,
  CalendarCheck2,
  CalendarPlus,
  CircleDollarSign,
  Eye,
  FilePen,
  FilePlus2,
  Mail,
  MailWarning,
  MessageCircle,
  NotebookPen,
  Package,
  PhoneCall,
  Send,
  Settings,
  UserPlus,
  UserPen,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { ACTIVITY_TYPE_LABEL, type ActivityType } from "@organo/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Partial<Record<ActivityType, LucideIcon>> = {
  CUSTOMER_CREATED: UserPlus,
  CUSTOMER_UPDATED: UserPen,
  PROFORMA_CREATED: FilePlus2,
  INVOICE_CREATED: FilePlus2,
  PROFORMA_EDITED: FilePen,
  INVOICE_EDITED: FilePen,
  PROFORMA_SENT: Send,
  INVOICE_SENT: Send,
  PROFORMA_VIEWED: Eye,
  INVOICE_VIEWED: Eye,
  PROFORMA_CONVERTED: ArrowRightLeft,
  INVOICE_CANCELLED: Ban,
  WHATSAPP_OPENED: MessageCircle,
  WHATSAPP_SENT: MessageCircle,
  EMAIL_SENT: Mail,
  EMAIL_FAILED: MailWarning,
  FOLLOWUP_CREATED: CalendarPlus,
  FOLLOWUP_UPDATED: CalendarPlus,
  FOLLOWUP_COMPLETED: CalendarCheck2,
  CALL: PhoneCall,
  MEETING: Users,
  NOTE: NotebookPen,
  PAYMENT_RECEIVED: CircleDollarSign,
  PAYMENT_VOIDED: CircleDollarSign,
  PAYMENT_REMINDER: CircleDollarSign,
  PRODUCT_CREATED: Package,
  PRODUCT_UPDATED: Package,
  PRODUCT_PRICE_CHANGED: Package,
  STOCK_CHANGED: Package,
  SETTINGS_UPDATED: Settings,
};

const TONE: Partial<Record<ActivityType, string>> = {
  PAYMENT_RECEIVED: "bg-success/12 text-success-foreground",
  PROFORMA_CONVERTED: "bg-success/12 text-success-foreground",
  FOLLOWUP_COMPLETED: "bg-success/12 text-success-foreground",
  EMAIL_FAILED: "bg-destructive/10 text-destructive-foreground",
  INVOICE_CANCELLED: "bg-destructive/10 text-destructive-foreground",
  PAYMENT_VOIDED: "bg-destructive/10 text-destructive-foreground",
  PROFORMA_VIEWED: "bg-info/10 text-info-foreground",
  INVOICE_VIEWED: "bg-info/10 text-info-foreground",
};

export function ActivityTimeline({
  items,
  loading,
  showCustomer,
  showDocument = true,
  empty = "No activity yet",
}: {
  items?: Activity[];
  loading?: boolean;
  showCustomer?: boolean;
  showDocument?: boolean;
  empty?: string;
}) {
  if (loading)
    return (
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  if (!items?.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = ICONS[a.type] ?? NotebookPen;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground", TONE[a.type])}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm">
                <span className="font-medium">{ACTIVITY_TYPE_LABEL[a.type]}</span>
                {a.type === "WHATSAPP_OPENED" && <span className="text-muted-foreground"> (not confirmed as sent)</span>}
              </p>
              <p className="text-sm break-words text-muted-foreground">{a.description}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground/80">
                <time dateTime={a.createdAt} title={fmtDateTime(a.createdAt)}>
                  {fmtRelative(a.createdAt)}
                </time>
                {a.user && <span>by {a.user.name}</span>}
                {showCustomer && a.customer && (
                  <Link className="hover:underline" href={`/customers/${a.customer.id}`}>
                    {a.customer.name}
                  </Link>
                )}
                {showDocument && a.document && (
                  <Link className="tabular hover:underline" href={`/${a.document.type === "INVOICE" ? "invoices" : "proformas"}/${a.document.id}`}>
                    {a.document.number}
                  </Link>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
