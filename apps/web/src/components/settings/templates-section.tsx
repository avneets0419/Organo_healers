"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageCircle, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  DOCUMENT_TYPE_LABEL,
  findUnknownVariables,
  renderTemplate,
  TEMPLATE_VARIABLES,
  type DocumentType,
  type MessageChannel,
  type TemplateVars,
} from "@organo/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/hooks/use-settings";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  channel: MessageChannel;
  key: string;
  name: string;
  subject: string | null;
  body: string;
  documentType: DocumentType | null;
  isDefault: boolean;
  active: boolean;
}

type Draft = Omit<Template, "id"> & { id?: string };

export function TemplatesSection() {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<MessageChannel>("WHATSAPP");
  const { data: templates, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/templates") });
  const { data: settings } = useSettings();
  const list = (templates ?? []).filter((t) => t.channel === channel);
  const [selected, setSelected] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState<Draft | null>(null);
  const [edit, setEdit] = useState<{ for: string; value: Draft } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Selection falls back to the first template. The draft is the selected template
  // until edited; edits are tied to that selection, so switching discards them.
  const key = selected ?? list[0]?.id ?? null;
  const current = key === "new" ? null : (list.find((t) => t.id === key) ?? null);
  const base: Draft | null = key === "new" ? newDraft : current ? { ...current } : null;
  const draft = edit && edit.for === key ? edit.value : base;
  const setDraft = (d: Draft) => key && setEdit({ for: key, value: d });

  const sample: TemplateVars = useMemo(
    () => ({
      customer_name: "Sunil Saroha",
      document_type: "Proforma Invoice",
      invoice_number: `${settings?.proformaPrefix ?? "PI"}-2026-0012`,
      amount: "₹98,963",
      balance_due: "₹49,482",
      invoice_link: "https://your-app/i/Xq3...",
      business_name: settings?.businessName ?? "Organo Healers",
      business_phone: settings?.phone ?? "",
      salesperson: settings?.salespersonName ?? "Organo Healers",
      due_date: "12 Oct 2026",
      upi_id: settings?.upiId ?? "",
    }),
    [settings],
  );

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const { id, ...body } = d;
      return id ? api.patch<Template>(`/templates/${id}`, body) : api.post<Template>("/templates", body);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["compose"] });
      setSelected(t.id);
      setEdit(null);
      setNewDraft(null);
      toast.success(`"${t.name}" saved`);
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      setSelected(null);
      setEdit(null);
      toast.success("Template deleted");
    },
    onError: (e) => toast.error(e),
  });

  function insertVar(key: string) {
    if (!draft) return;
    const el = bodyRef.current;
    const token = `{{${key}}}`;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const body = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function newTemplate() {
    setSelected("new");
    setEdit(null);
    setNewDraft({ channel, key: `custom_${Date.now().toString(36)}`, name: "New template", subject: channel === "EMAIL" ? "{{document_type}} {{invoice_number}}" : null, body: "Hello {{customer_name}},\n\n", documentType: null, isDefault: false, active: true });
  }

  const unknown = draft ? findUnknownVariables(`${draft.subject ?? ""} ${draft.body}`) : [];
  const dirty = draft && (!current || JSON.stringify({ ...current }) !== JSON.stringify(draft));

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">Message templates</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">Pre-filled text for WhatsApp and email. You can still edit each message before sending.</p>
        </div>
        <Tabs
          value={channel}
          onValueChange={(v) => {
            setChannel(v as MessageChannel);
            setSelected(null);
            setEdit(null);
          }}
        >
          <TabsList>
            <TabsTab value="WHATSAPP">
              <MessageCircle className="size-4" /> WhatsApp
            </TabsTab>
            <TabsTab value="EMAIL">
              <Mail className="size-4" /> Email
            </TabsTab>
          </TabsList>
        </Tabs>
      </header>
      <div className="grid min-h-[480px] md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="border-b p-2 md:border-r md:border-b-0">
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="grid gap-0.5">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelected(t.id)}
                    className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm", key === t.id ? "bg-accent font-medium" : "hover:bg-accent/50")}
                  >
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    {t.isDefault && <Star className="size-3.5 fill-current text-primary" aria-label="Default" />}
                  </button>
                </li>
              ))}
              <li>
                <Button size="sm" variant="ghost" className="mt-1 w-full justify-start" onClick={newTemplate}>
                  <Plus /> New template
                </Button>
              </li>
            </ul>
          )}
        </aside>
        <div className="grid gap-4 p-5">
          {!draft ? (
            <p className="text-sm text-muted-foreground">Choose a template to edit.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Used for
                  <Select value={draft.documentType ?? "ANY"} onValueChange={(v) => setDraft({ ...draft, documentType: v === "ANY" ? null : (v as DocumentType) })}>
                    <SelectTrigger>
                      <SelectValue>{(v: string) => (v === "ANY" ? "Any document" : `${DOCUMENT_TYPE_LABEL[v as DocumentType]}s`)}</SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="ANY">Any document</SelectItem>
                      <SelectItem value="PROFORMA">Proforma invoices</SelectItem>
                      <SelectItem value="INVOICE">Invoices</SelectItem>
                    </SelectPopup>
                  </Select>
                </label>
              </div>
              {draft.channel === "EMAIL" && (
                <label className="grid gap-1.5 text-sm font-medium">
                  Subject
                  <Input value={draft.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
                </label>
              )}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid content-start gap-2">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Message
                    <Textarea ref={bodyRef} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12} className="font-mono text-[13px]" />
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_VARIABLES.map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        title={v.description}
                        onClick={() => insertVar(v.key)}
                        className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                  {unknown.length > 0 && (
                    <Alert variant="warning">
                      <AlertDescription>Unknown variables stay as typed: {unknown.map((u) => `{{${u}}}`).join(", ")}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <div className="grid content-start gap-1.5 text-sm font-medium">
                  Preview with sample data
                  {draft.channel === "WHATSAPP" ? (
                    <div className="rounded-xl bg-[#e7f3e2] p-3 dark:bg-[#1d2a1b]">
                      <div className="ml-auto max-w-[95%] rounded-lg rounded-tr-sm bg-[#d4f0c4] px-3 py-2 text-[13px] leading-snug font-normal whitespace-pre-wrap [overflow-wrap:anywhere] text-[#1c2419] shadow-sm dark:bg-[#2b4a24] dark:text-[#e7f3e2]">
                        {renderTemplate(draft.body, sample)}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border bg-background p-4 font-normal">
                      <p className="border-b pb-2 text-sm font-semibold">{renderTemplate(draft.subject ?? "", sample)}</p>
                      <p className="pt-2 text-sm whitespace-pre-wrap">{renderTemplate(draft.body, sample)}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 border-t pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={draft.isDefault} onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })} />
                  Default for {draft.documentType ? `${DOCUMENT_TYPE_LABEL[draft.documentType].toLowerCase()}s` : "this channel"}
                </label>
                {draft.isDefault && <Badge variant="success">Default</Badge>}
                <div className="ml-auto flex gap-2">
                  {draft.id && !draft.isDefault && (
                    <Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => remove.mutate(draft.id!)}>
                      <Trash2 /> Delete
                    </Button>
                  )}
                  <Button size="sm" disabled={!dirty || !draft.name.trim() || !draft.body.trim()} loading={save.isPending} onClick={() => save.mutate(draft)}>
                    Save template
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
