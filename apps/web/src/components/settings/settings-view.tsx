"use client";

import { Bell, Building2, CreditCard, FileText, Mail, MessageSquareText, Shapes, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBody, PageHeader } from "@/components/common/page-header";
import { cn } from "@/lib/utils";
import { BusinessSection, DocumentsSection, EmailSection, PaymentSection } from "./sections";
import { SettingsSection } from "./settings-ui";
import { TemplatesSection } from "./templates-section";
import { UsersSection } from "./users-section";

const SECTIONS = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "documents", label: "Invoices & proformas", icon: FileText },
  { key: "payment", label: "Payment", icon: CreditCard },
  { key: "templates", label: "Message templates", icon: MessageSquareText },
  { key: "email", label: "Email", icon: Mail },
  { key: "users", label: "Users & roles", icon: Users },
  { key: "categories", label: "Product categories", icon: Shapes },
  { key: "notifications", label: "Notifications", icon: Bell },
] as const;
type Key = (typeof SECTIONS)[number]["key"];

export function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const active = (SECTIONS.find((s) => s.key === params.get("section"))?.key ?? "business") as Key;

  return (
    <PageBody>
      <PageHeader title="Settings" description="Business details, documents, payments, messages and team." />
      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => router.replace(`/settings?section=${s.key}`, { scroll: false })}
              aria-current={active === s.key ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active === s.key ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <s.icon className="size-4" />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {active === "business" && <BusinessSection />}
          {active === "documents" && <DocumentsSection />}
          {active === "payment" && <PaymentSection />}
          {active === "templates" && <TemplatesSection />}
          {active === "email" && <EmailSection />}
          {active === "users" && <UsersSection />}
          {active === "categories" && (
            <SettingsSection title="Product categories" description="Categories group the catalog and power the POS filters.">
              <p className="text-sm">
                Manage them under{" "}
                <Link href="/inventory" className="font-medium underline underline-offset-4">
                  Inventory, Categories
                </Link>
                .
              </p>
            </SettingsSection>
          )}
          {active === "notifications" && (
            <SettingsSection title="Notifications" description="How the app tells you what needs attention today.">
              <ul className="grid gap-3 text-sm">
                <li>
                  <span className="font-medium">Follow-up badge.</span> The Follow-ups item in the sidebar shows how many are due today or overdue, refreshed every minute.
                </li>
                <li>
                  <span className="font-medium">Dashboard.</span> Overdue invoices and the next follow-ups are listed on the Overview.
                </li>
                <li>
                  <span className="font-medium">Viewed links.</span> When a customer opens a proforma or invoice link, it&apos;s marked Viewed and added to their timeline.
                </li>
                <li className="text-muted-foreground">Email or push reminders for follow-ups aren&apos;t set up. Reminder times are saved on each follow-up so they can be added later.</li>
              </ul>
            </SettingsSection>
          )}
        </div>
      </div>
    </PageBody>
  );
}
