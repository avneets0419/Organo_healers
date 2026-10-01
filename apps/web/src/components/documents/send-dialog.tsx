"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Mail, MessageCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { buildWhatsAppUrl, formatPhone, isValidIndianMobile } from "@organo/shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api, errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";

export type SendMode = "email" | "whatsapp" | "both";

interface RenderedTemplate {
  key: string;
  name: string;
  subject: string | null;
  body: string;
  isDefault: boolean;
}

interface Compose {
  number: string;
  type: "PROFORMA" | "INVOICE";
  link: string;
  customerName: string;
  email: { to: string | null; configured: boolean; templates: RenderedTemplate[] };
  whatsapp: { phone: string | null; templates: RenderedTemplate[] };
}

interface Props {
  documentId: string;
  mode: SendMode;
  onClose: () => void;
  /** e.g. "follow_up" or "payment_reminder" instead of the document default. */
  preferWhatsAppTemplate?: string;
}

export function SendDialog(props: Props) {
  const { documentId, mode, onClose } = props;
  const { data, isLoading, error } = useQuery({
    queryKey: ["compose", documentId],
    queryFn: () => api.get<Compose>(`/documents/${documentId}/compose`),
    staleTime: 0,
  });
  const title = mode === "email" ? "Send by email" : mode === "whatsapp" ? "Share on WhatsApp" : "Send by email and WhatsApp";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-2xl">
        {data ? (
          <SendForm {...props} data={data} title={title} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Preparing message</DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-3">
              {isLoading && (
                <>
                  <Skeleton className="h-9" />
                  <Skeleton className="h-32" />
                </>
              )}
              {error && (
                <Alert variant="error">
                  <AlertDescription>{errorMessage(error)}</AlertDescription>
                </Alert>
              )}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}

function SendForm({ documentId, mode, onClose, preferWhatsAppTemplate, data, title }: Props & { data: Compose; title: string }) {
  const qc = useQueryClient();
  const wantEmail = mode !== "whatsapp";
  const wantWhatsApp = mode !== "email";
  const firstEmail = data.email.templates.find((t) => t.isDefault) ?? data.email.templates[0];
  const firstWa =
    data.whatsapp.templates.find((t) => t.key === preferWhatsAppTemplate) ?? data.whatsapp.templates.find((t) => t.isDefault) ?? data.whatsapp.templates[0];

  const [emailTpl, setEmailTpl] = useState(firstEmail?.key ?? "");
  const [waTpl, setWaTpl] = useState(firstWa?.key ?? "");
  const [to, setTo] = useState(data.email.to ?? "");
  const [subject, setSubject] = useState(firstEmail?.subject ?? "");
  const [emailBody, setEmailBody] = useState(firstEmail?.body ?? "");
  const [attachPdf, setAttachPdf] = useState(true);
  const [phone, setPhone] = useState(data.whatsapp.phone ? formatPhone(data.whatsapp.phone) : "");
  const [waBody, setWaBody] = useState(firstWa?.body ?? "");

  const waUrl = useMemo(() => buildWhatsAppUrl(phone, waBody), [phone, waBody]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const phoneValid = isValidIndianMobile(phone);
  const emailBlocked = wantEmail && (!data.email.configured || !emailValid || !subject.trim() || !emailBody.trim());
  const waBlocked = wantWhatsApp && (!phoneValid || !waBody.trim());

  const logWhatsApp = useMutation({
    mutationFn: () => api.post(`/documents/${documentId}/whatsapp-opened`, { phone, message: waBody, templateKey: waTpl }),
  });
  const sendEmail = useMutation({
    mutationFn: () => api.post<{ messageId: string | null }>(`/documents/${documentId}/send-email`, { to: to.trim(), subject, body: emailBody, attachPdf }),
  });

  async function submit() {
    // Open WhatsApp synchronously inside the click so popup blockers allow it.
    if (wantWhatsApp && waUrl) {
      window.open(waUrl, "_blank", "noopener,noreferrer");
      logWhatsApp.mutate(undefined, {
        onError: (e) => toast.error("WhatsApp opened, but the activity log failed", errorMessage(e)),
      });
    }
    if (wantEmail) {
      try {
        await sendEmail.mutateAsync();
        toast.success(`Email sent to ${to.trim()}`, wantWhatsApp ? "WhatsApp opened in a new tab. Press send there to deliver it." : undefined);
      } catch (e) {
        toast.error("Email not sent", errorMessage(e));
        return;
      }
    } else if (wantWhatsApp) {
      toast.info("WhatsApp opened", "The message is ready in WhatsApp. Press send there to deliver it.");
    }
    for (const k of [["documents"], ["document", documentId], ["customers"], ["activities"], ["dashboard"]]) qc.invalidateQueries({ queryKey: k });
    onClose();
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {data.number} for {data.customerName}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-5">

          {data && wantEmail && (
            <section className="grid gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Mail className="size-4 text-muted-foreground" /> Email
              </h3>
              {!data.email.configured && (
                <Alert variant="warning">
                  <AlertTriangle />
                  <AlertTitle>Email isn&apos;t configured</AlertTitle>
                  <AlertDescription>Add BREVO_API_KEY and BREVO_SENDER_EMAIL to the server environment to send email.</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <label className="grid gap-1.5 text-sm font-medium">
                  To
                  <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={(!!to && !emailValid) || undefined} placeholder="customer@example.com" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Template
                  <TemplateSelect
                    templates={data.email.templates}
                    value={emailTpl}
                    onChange={(t) => {
                      setEmailTpl(t.key);
                      setSubject(t.subject ?? "");
                      setEmailBody(t.body);
                    }}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Subject
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Message
                <Textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={7} className="font-normal" />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={attachPdf} onCheckedChange={(v) => setAttachPdf(!!v)} /> Attach PDF
              </label>
            </section>
          )}

          {data && wantWhatsApp && (
            <section className="grid gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircle className="size-4 text-muted-foreground" /> WhatsApp
              </h3>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <label className="grid gap-1.5 text-sm font-medium">
                  Phone
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" aria-invalid={(!!phone && !phoneValid) || undefined} placeholder="+91 98110 45237" />
                  {!phone && <span className="text-xs font-normal text-warning-foreground">This customer has no phone number. Add one to share on WhatsApp.</span>}
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Template
                  <TemplateSelect
                    templates={data.whatsapp.templates}
                    value={waTpl}
                    onChange={(t) => {
                      setWaTpl(t.key);
                      setWaBody(t.body);
                    }}
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">
                  Message
                  <Textarea value={waBody} onChange={(e) => setWaBody(e.target.value)} rows={11} className="font-normal" />
                </label>
                <div className="grid gap-1.5 text-sm font-medium">
                  Preview
                  <div className="rounded-xl bg-[#e7f3e2] p-3 dark:bg-[#1d2a1b]">
                    <div className="ml-auto max-w-[95%] rounded-lg rounded-tr-sm bg-[#d4f0c4] px-3 py-2 text-[13px] leading-snug font-normal whitespace-pre-wrap [overflow-wrap:anywhere] text-[#1c2419] shadow-sm dark:bg-[#2b4a24] dark:text-[#e7f3e2]">
                      {waBody || " "}
                    </div>
                  </div>
                  <span className="text-xs font-normal text-muted-foreground">
                    WhatsApp opens with this message filled in. It is only delivered when you press send in WhatsApp.
                  </span>
                </div>
              </div>
            </section>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button onClick={submit} disabled={emailBlocked || waBlocked} loading={sendEmail.isPending}>
            {mode === "email" ? (
              <>
                <Mail /> Send email
              </>
            ) : mode === "whatsapp" ? (
              <>
                <MessageCircle /> Open WhatsApp
              </>
            ) : (
              "Send email and open WhatsApp"
            )}
          </Button>
        </DialogFooter>
    </>
  );
}

function TemplateSelect({ templates, value, onChange }: { templates: RenderedTemplate[]; value: string; onChange: (t: RenderedTemplate) => void }) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const t = templates.find((x) => x.key === v);
        if (t) onChange(t);
      }}
    >
      <SelectTrigger className="font-normal">
        <SelectValue>{(v: string) => templates.find((t) => t.key === v)?.name ?? "Choose"}</SelectValue>
      </SelectTrigger>
      <SelectPopup>
        {templates.map((t) => (
          <SelectItem key={t.key} value={t.key}>
            {t.name}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
