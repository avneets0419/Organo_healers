"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, ImageUp } from "lucide-react";
import { useRef } from "react";
import { allColumns, DEFAULT_SECTIONS, defaultLayout, formatPhone, LAYOUT_PRESETS } from "@organo/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Settings } from "@/lib/types";
import { SaveBar, SettingsSection, SwitchField, TextField } from "./settings-ui";
import { useSettingsForm } from "./use-settings-form";

const BUSINESS_KEYS = [
  "businessName",
  "legalName",
  "tagline",
  "gstNumber",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "phone",
  "email",
  "website",
  "salespersonName",
] as const;

export function BusinessSection() {
  const f = useSettingsForm(BUSINESS_KEYS);
  const v = f.values;
  const e = (k: string) => f.errors[k]?.[0];
  return (
    <div className="grid gap-4">
      <LogoCard settings={f.settings} />
      <SettingsSection
        title="Business details"
        description="Used on every new invoice and proforma. Existing documents keep the details they were issued with."
        loading={f.isLoading}
        footer={<SaveBar dirty={f.dirty} saving={f.save.isPending} onSave={() => f.save.mutate()} onReset={f.reset} />}
      >
        {v && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Business name" value={v.businessName} onChange={(x) => f.set("businessName", x)} error={e("businessName")} />
              <TextField label="Legal name" value={v.legalName} onChange={(x) => f.set("legalName", x)} />
              <TextField label="Subtitle" value={v.tagline} onChange={(x) => f.set("tagline", x)} hint="Shown under the name when there's no logo" />
              <TextField label="GSTIN" value={v.gstNumber} onChange={(x) => f.set("gstNumber", x.toUpperCase())} error={e("gstNumber")} className="font-mono" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Address line 1" value={v.addressLine1} onChange={(x) => f.set("addressLine1", x)} />
              <TextField label="Address line 2" value={v.addressLine2} onChange={(x) => f.set("addressLine2", x)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="City" value={v.city} onChange={(x) => f.set("city", x)} />
              <TextField label="State" value={v.state} onChange={(x) => f.set("state", x)} />
              <TextField label="PIN code" value={v.postalCode} onChange={(x) => f.set("postalCode", x)} inputMode="numeric" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label="Phone" value={v.phone ? formatPhone(v.phone) : ""} onChange={(x) => f.set("phone", x)} inputMode="tel" />
              <TextField label="Email" value={v.email} onChange={(x) => f.set("email", x)} type="email" error={e("email")} />
              <TextField label="Website" value={v.website} onChange={(x) => f.set("website", x)} />
            </div>
            <TextField
              label="Signature on messages"
              value={v.salespersonName}
              onChange={(x) => f.set("salespersonName", x)}
              hint="Fills {{salesperson}} in templates. Leave empty to use the signed-in person's name."
            />
          </>
        )}
      </SettingsSection>
    </div>
  );
}

function LogoCard({ settings }: { settings?: Settings }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 1_000_000) throw new Error("Logo must be under 1 MB");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Couldn't read the file"));
        r.readAsDataURL(file);
      });
      return api.post<{ logoUrl: string }>("/settings/logo", { dataUrl, filename: file.name });
    },
    onSuccess: (r) => {
      qc.setQueryData(["settings"], (old: Settings | undefined) => (old ? { ...old, logoUrl: r.logoUrl } : old));
      toast.success("Logo updated", "New documents will use it.");
    },
    onError: (e) => toast.error(e),
  });
  return (
    <SettingsSection title="Logo" description="PNG with a transparent background works best on invoices.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-64 place-items-center rounded-lg border bg-white p-3">
          {settings?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.logoUrl} alt="Current logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-muted-foreground">No logo</span>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
        <Button variant="outline" loading={upload.isPending} onClick={() => input.current?.click()}>
          <ImageUp /> Upload new logo
        </Button>
      </div>
    </SettingsSection>
  );
}

const DOC_KEYS = [
  "invoicePrefix",
  "proformaPrefix",
  "numberPadding",
  "invoiceStartNumber",
  "proformaStartNumber",
  "invoiceDueDays",
  "proformaValidDays",
  "defaultTaxRate",
  "pricesIncludeTax",
  "roundToRupee",
  "paymentTerms",
  "defaultTerms",
  "defaultNotes",
  "invoiceFooter",
  "defaultLayout",
] as const;

export function DocumentsSection() {
  const f = useSettingsForm(DOC_KEYS);
  const v = f.values;
  const year = new Date().getFullYear();
  const num = (k: "numberPadding" | "invoiceStartNumber" | "proformaStartNumber" | "invoiceDueDays" | "proformaValidDays", x: string) => {
    const n = Number(x.replace(/\D/g, ""));
    if (x === "" || Number.isFinite(n)) f.set(k, x === "" ? 0 : n);
  };
  const sample = (prefix: string, start: number) => `${prefix || "?"}-${year}-${String(start || 1).padStart(v?.numberPadding || 4, "0")}`;
  return (
    <SettingsSection
      title="Invoices & proformas"
      description="Numbering, defaults and the standard layout for new documents."
      loading={f.isLoading}
      footer={<SaveBar dirty={f.dirty} saving={f.save.isPending} onSave={() => f.save.mutate()} onReset={f.reset} />}
    >
      {v && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Invoice prefix" value={v.invoicePrefix} onChange={(x) => f.set("invoicePrefix", x.toUpperCase())} hint={`Looks like ${sample(v.invoicePrefix, v.invoiceStartNumber)}`} error={f.errors.invoicePrefix?.[0]} />
            <TextField label="Proforma prefix" value={v.proformaPrefix} onChange={(x) => f.set("proformaPrefix", x.toUpperCase())} hint={`Looks like ${sample(v.proformaPrefix, v.proformaStartNumber)}`} error={f.errors.proformaPrefix?.[0]} />
            <TextField label="Digits" value={String(v.numberPadding)} onChange={(x) => num("numberPadding", x)} inputMode="numeric" hint="3 to 8" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Invoice starting number"
              value={String(v.invoiceStartNumber)}
              onChange={(x) => num("invoiceStartNumber", x)}
              inputMode="numeric"
              hint="Applies when a new year starts, or if no invoice has been numbered yet this year"
            />
            <TextField label="Proforma starting number" value={String(v.proformaStartNumber)} onChange={(x) => num("proformaStartNumber", x)} inputMode="numeric" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Invoice due in (days)" value={String(v.invoiceDueDays)} onChange={(x) => num("invoiceDueDays", x)} inputMode="numeric" />
            <TextField label="Proforma valid for (days)" value={String(v.proformaValidDays)} onChange={(x) => num("proformaValidDays", x)} inputMode="numeric" />
            <TextField label="Default GST %" value={String(Number(v.defaultTaxRate))} onChange={(x) => /^\d*\.?\d{0,2}$/.test(x) && f.set("defaultTaxRate", x)} inputMode="decimal" />
          </div>
          <div className="grid gap-3 rounded-lg border p-3">
            <SwitchField label="Prices include GST" hint="When on, GST is extracted from the rate instead of added on top." checked={v.pricesIncludeTax} onChange={(x) => f.set("pricesIncludeTax", x)} />
            <SwitchField label="Round totals to the nearest rupee" hint="The difference is shown as round off." checked={v.roundToRupee} onChange={(x) => f.set("roundToRupee", x)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Payment terms" value={v.paymentTerms} onChange={(x) => f.set("paymentTerms", x)} multiline hint="One point per line" />
            <TextField label="Terms & conditions" value={v.defaultTerms} onChange={(x) => f.set("defaultTerms", x)} multiline hint="One point per line" />
            <TextField label="Default notes" value={v.defaultNotes} onChange={(x) => f.set("defaultNotes", x)} multiline />
            <TextField label="Footer" value={v.invoiceFooter} onChange={(x) => f.set("invoiceFooter", x)} multiline rows={2} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium">
            Default column layout
            <Select
              value={v.defaultLayout?.preset ?? "custom"}
              onValueChange={(k) => {
                const p = LAYOUT_PRESETS.find((x) => x.key === k);
                if (p) f.set("defaultLayout", { ...(v.defaultLayout ?? defaultLayout()), preset: p.key, columns: p.apply(allColumns()), sections: v.defaultLayout?.sections ?? DEFAULT_SECTIONS });
              }}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue>{(k: string) => LAYOUT_PRESETS.find((p) => p.key === k)?.name ?? "Custom"}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {LAYOUT_PRESETS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <span className="text-xs font-normal text-muted-foreground">Fine-tune columns per document with Customise in the POS.</span>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

const PAY_KEYS = ["upiId", "upiPhone", "bankName", "accountName", "accountNumber", "ifsc", "paymentInstructions"] as const;

export function PaymentSection() {
  const f = useSettingsForm(PAY_KEYS);
  const v = f.values;
  return (
    <SettingsSection
      title="Payment details"
      description="Printed on documents with a scannable UPI QR for the amount due."
      loading={f.isLoading}
      footer={<SaveBar dirty={f.dirty} saving={f.save.isPending} onSave={() => f.save.mutate()} onReset={f.reset} />}
    >
      {v && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="UPI ID" value={v.upiId} onChange={(x) => f.set("upiId", x)} placeholder="name@bank" />
            <TextField label="UPI phone number" value={v.upiPhone ? formatPhone(v.upiPhone) : ""} onChange={(x) => f.set("upiPhone", x)} inputMode="tel" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Account name" value={v.accountName} onChange={(x) => f.set("accountName", x)} />
            <TextField label="Bank" value={v.bankName} onChange={(x) => f.set("bankName", x)} />
            <TextField label="Account number" value={v.accountNumber} onChange={(x) => f.set("accountNumber", x.replace(/\s/g, ""))} inputMode="numeric" className="font-mono" />
            <TextField label="IFSC" value={v.ifsc} onChange={(x) => f.set("ifsc", x.toUpperCase())} error={f.errors.ifsc?.[0]} className="font-mono" />
          </div>
          <TextField label="Payment instructions" value={v.paymentInstructions} onChange={(x) => f.set("paymentInstructions", x)} multiline rows={2} />
        </>
      )}
    </SettingsSection>
  );
}

const EMAIL_KEYS = ["emailSenderName", "emailReplyTo"] as const;

export function EmailSection() {
  const f = useSettingsForm(EMAIL_KEYS);
  const v = f.values;
  const configured = f.settings?.integrations.email.configured;
  return (
    <div className="grid gap-4">
      {f.settings &&
        (configured ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Brevo is connected</AlertTitle>
            <AlertDescription>Invoices and proformas can be emailed with the PDF attached.</AlertDescription>
          </Alert>
        ) : (
          <Alert variant="warning">
            <CircleAlert />
            <AlertTitle>Email isn&apos;t connected yet</AlertTitle>
            <AlertDescription>
              Add BREVO_API_KEY and BREVO_SENDER_EMAIL (a sender verified in Brevo) to apps/server/.env and restart the server. Keys stay on the server and are never sent to the browser.
            </AlertDescription>
          </Alert>
        ))}
      <SettingsSection
        title="Email sender"
        description="How emails appear in the customer's inbox."
        loading={f.isLoading}
        footer={<SaveBar dirty={f.dirty} saving={f.save.isPending} onSave={() => f.save.mutate()} onReset={f.reset} />}
      >
        {v && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Sender name" value={v.emailSenderName} onChange={(x) => f.set("emailSenderName", x)} placeholder="Organo Healers" />
            <TextField label="Reply-to email" value={v.emailReplyTo} onChange={(x) => f.set("emailReplyTo", x)} type="email" hint="Customer replies go here" error={f.errors.emailReplyTo?.[0]} />
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
