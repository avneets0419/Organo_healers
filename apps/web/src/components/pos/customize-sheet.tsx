"use client";

import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { allColumns, LAYOUT_PRESETS, type Alignment, type ColumnConfig, type SectionsConfig } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetDescription, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-store";

const SECTION_LABELS: Array<[keyof SectionsConfig, string, string]> = [
  ["showLogo", "Logo", "Header"],
  ["showGst", "GSTIN", "Header"],
  ["showBusinessAddress", "Business address", "Header"],
  ["showBusinessContact", "Business phone & email", "Header"],
  ["showCustomerPhone", "Customer phone", "Customer"],
  ["showCustomerEmail", "Customer email", "Customer"],
  ["showBillingAddress", "Billing address", "Customer"],
  ["showShippingAddress", "Shipping address", "Customer"],
  ["showGroupSubtotals", "Group subtotals", "Table"],
  ["showMrpSavings", "Savings on MRP", "Table"],
  ["showPaymentTerms", "Payment terms", "Footer"],
  ["showTerms", "Terms & conditions", "Footer"],
  ["showNotes", "Notes", "Footer"],
  ["showBankDetails", "Bank details", "Footer"],
  ["showUpiDetails", "UPI details", "Footer"],
  ["showUpiQr", "UPI QR code", "Footer"],
  ["showSignature", "Signature", "Footer"],
  ["showFooter", "Footer line", "Footer"],
];

export function CustomizeSheet({ open, onOpenChange, settings }: { open: boolean; onOpenChange: (v: boolean) => void; settings?: Settings | null }) {
  const layout = usePos((s) => s.layout);
  const setLayout = usePos((s) => s.setLayout);
  const set = usePos((s) => s.set);
  const customer = usePos((s) => s.customer);
  const setCustomer = usePos((s) => s.setCustomer);
  const text = usePos(useShallow((s) => ({ title: s.title, notes: s.notes, terms: s.terms, paymentTerms: s.paymentTerms, footer: s.footer })));

  const cols = layout.columns;
  const setCols = (next: ColumnConfig[]) => setLayout({ columns: next, preset: undefined });
  const patchCol = (k: string, patch: Partial<ColumnConfig>) => setCols(cols.map((c) => (c.key === k ? { ...c, ...patch } : c)));
  const moveCol = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setCols(next);
  };
  const header = layout.header ?? {};
  const setHeader = (k: keyof typeof header, v: string) => setLayout({ header: { ...header, [k]: v.trim() ? v : null } });
  const settingsAddress = [settings?.addressLine1, settings?.addressLine2, settings?.city, settings?.state].filter(Boolean).join(", ");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup side="right" className="w-full max-w-lg">
        <SheetHeader>
          <SheetTitle>Customise document</SheetTitle>
          <SheetDescription>Changes apply to this document only. Defaults live in Settings.</SheetDescription>
        </SheetHeader>
        <SheetPanel>
          <Tabs defaultValue="columns">
            <TabsList className="w-full">
              <TabsTab value="columns">Columns</TabsTab>
              <TabsTab value="sections">Sections</TabsTab>
              <TabsTab value="header">Header</TabsTab>
              <TabsTab value="text">Text</TabsTab>
            </TabsList>

            <TabsPanel value="columns" className="grid gap-4 pt-3">
              <div className="grid gap-2">
                <Label>Start from a preset</Label>
                <div className="grid grid-cols-2 gap-2">
                  {LAYOUT_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setLayout({ columns: p.apply(allColumns()), preset: p.key })}
                      className={cn(
                        "rounded-lg border p-2.5 text-left transition-colors hover:bg-accent/50",
                        layout.preset === p.key && "border-primary bg-brand-soft/60",
                      )}
                    >
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Columns</Label>
                  <span className="text-xs text-muted-foreground">Width is relative</span>
                </div>
                <ul className="grid gap-1.5">
                  {cols.map((c, i) => (
                    <li key={c.key} className={cn("flex items-center gap-1.5 rounded-lg border p-1.5", !c.visible && "bg-muted/50")}>
                      <Checkbox checked={c.visible} onCheckedChange={(v) => patchCol(c.key, { visible: !!v })} aria-label={`Show ${c.label}`} />
                      <Input size="sm" value={c.label} onChange={(e) => patchCol(c.key, { label: e.target.value })} aria-label="Column label" className="min-w-0 flex-1" />
                      <Input
                        size="sm"
                        nativeInput
                        type="number"
                        min={0.3}
                        max={8}
                        step={0.1}
                        value={c.width}
                        onChange={(e) => {
                          const w = Number(e.target.value);
                          if (w >= 0.3 && w <= 8) patchCol(c.key, { width: w });
                        }}
                        aria-label="Column width"
                        className="w-16 tabular"
                      />
                      <ToggleGroup
                        value={[c.align]}
                        onValueChange={(v: string[]) => v[0] && patchCol(c.key, { align: v[0] as Alignment })}
                        size="sm"
                        variant="outline"
                      >
                        <ToggleGroupItem value="left" aria-label="Align left">
                          <AlignLeft />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="center" aria-label="Align center">
                          <AlignCenter />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="right" aria-label="Align right">
                          <AlignRight />
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <div className="flex flex-col">
                        <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === 0} onClick={() => moveCol(i, -1)} aria-label="Move up">
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={i === cols.length - 1} onClick={() => moveCol(i, 1)} aria-label="Move down">
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsPanel>

            <TabsPanel value="sections" className="pt-3">
              {["Header", "Customer", "Table", "Footer"].map((area) => (
                <div key={area} className="mb-4">
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">{area}</div>
                  <div className="divide-y rounded-lg border">
                    {SECTION_LABELS.filter(([, , a]) => a === area).map(([k, label]) => (
                      <label key={k} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        {label}
                        <Switch checked={layout.sections[k]} onCheckedChange={(v) => setLayout({ sections: { ...layout.sections, [k]: v } })} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </TabsPanel>

            <TabsPanel value="header" className="grid gap-3 pt-3">
              <p className="text-xs text-muted-foreground">Leave blank to use the values from Settings.</p>
              <Field label="Business name" value={header.businessName} placeholder={settings?.businessName} onChange={(v) => setHeader("businessName", v)} />
              <Field label="Subtitle" value={header.tagline} placeholder={settings?.tagline ?? ""} onChange={(v) => setHeader("tagline", v)} />
              <Field label="GSTIN" value={header.gstNumber} placeholder={settings?.gstNumber ?? ""} onChange={(v) => setHeader("gstNumber", v)} />
              <Field label="Address" value={header.address} placeholder={settingsAddress} onChange={(v) => setHeader("address", v)} multiline />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone" value={header.phone} placeholder={settings?.phone ?? ""} onChange={(v) => setHeader("phone", v)} />
                <Field label="Email" value={header.email} placeholder={settings?.email ?? ""} onChange={(v) => setHeader("email", v)} />
              </div>
              <div className="mt-2 border-t pt-3 text-xs font-medium text-muted-foreground">Customer block</div>
              <Field label="Billing address" value={customer.billingAddress} onChange={(v) => setCustomer({ billingAddress: v })} multiline />
              <Field label="Shipping address" value={customer.shippingAddress} onChange={(v) => setCustomer({ shippingAddress: v })} multiline />
              <Field label="Document title" value={text.title} placeholder="e.g. Terrace garden makeover" onChange={(v) => set({ title: v })} />
            </TabsPanel>

            <TabsPanel value="text" className="grid gap-3 pt-3">
              <Field label="Payment terms" value={text.paymentTerms} onChange={(v) => set({ paymentTerms: v })} multiline hint="One point per line" />
              <Field label="Terms & conditions" value={text.terms} onChange={(v) => set({ terms: v })} multiline hint="One point per line" />
              <Field label="Notes" value={text.notes} onChange={(v) => set({ notes: v })} multiline />
              <Field label="Custom text" value={layout.customText ?? ""} onChange={(v) => setLayout({ customText: v || null })} multiline />
              <Field label="Signature label" value={layout.signatureLabel ?? ""} onChange={(v) => setLayout({ signatureLabel: v || null })} />
              <Field label="Footer" value={text.footer} onChange={(v) => set({ footer: v })} />
              {settings && (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={() =>
                    set({
                      paymentTerms: settings.paymentTerms ?? "",
                      terms: settings.defaultTerms ?? "",
                      notes: settings.defaultNotes ?? "",
                      footer: settings.invoiceFooter ?? "",
                    })
                  }
                >
                  <RotateCcw /> Reset text to defaults
                </Button>
              )}
            </TabsPanel>
          </Tabs>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {multiline ? (
        <Textarea value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} className="font-normal" />
      ) : (
        <Input value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="font-normal" />
      )}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}
