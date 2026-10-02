"use client";

import { useQuery } from "@tanstack/react-query";
import { Columns2, ExternalLink, FilePlus2, FolderPlus, Link2, PanelRight, PencilRuler, Save, Settings2, ShoppingBasket, SquarePen, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";
import { D, dec, DOCUMENT_STATUS_LABEL, DOCUMENT_TYPE_LABEL, formatINR, type DocumentType } from "@organo/shared";
import { DocumentPreview } from "@/components/documents/document-preview";
import { SendMenu } from "@/components/documents/send-menu";
import { StatusBadge } from "@/components/documents/status-badge";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useSettings } from "@/hooks/use-settings";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { CustomerLite, DocumentDetail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CustomerPanel } from "./customer-panel";
import { CustomizeSheet } from "./customize-sheet";
import { GroupCard } from "./group-card";
import { ProductCatalog } from "./product-catalog";
import { calcDraft, itemCount, toRenderable, usePos } from "./pos-store";
import { TotalsPanel } from "./totals-panel";
import { useSaveDocument } from "./use-save-document";

type View = "edit" | "preview" | "split";
type MobileTab = "catalog" | "cart" | "preview";

export function PosScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: settings } = useSettings();
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<View>("edit");
  const [mobileTab, setMobileTab] = useState<MobileTab>("catalog");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState<DocumentType | null>(null);

  const isWide = useMediaQuery("xl");
  const isDesktop = useMediaQuery("lg");

  const draft = usePos(
    useShallow((s) => ({
      documentId: s.documentId,
      number: s.number,
      status: s.status,
      type: s.type,
      groups: s.groups,
      dirty: s.dirty,
      discountType: s.discountType,
      discountValue: s.discountValue,
      issueDate: s.issueDate,
      publicToken: s.publicToken,
    })),
  );
  const { reset, setType, addGroup, applyDefaults, loadDocument, set } = usePos(
    useShallow((s) => ({ reset: s.reset, setType: s.setType, addGroup: s.addGroup, applyDefaults: s.applyDefaults, loadDocument: s.loadDocument, set: s.set })),
  );
  const save = useSaveDocument();

  // zustand persist rehydrates the draft from localStorage after mount.
  const hydrated = useSyncExternalStore(
    (cb) => usePos.persist.onFinishHydration(cb),
    () => usePos.persist.hasHydrated(),
    () => false,
  );

  useEffect(() => {
    if (settings && hydrated) applyDefaults(settings);
  }, [settings, hydrated, applyDefaults]);

  const editId = params.get("edit");
  // A saved, unmodified draft re-syncs with the server (status or content may have changed elsewhere).
  const savedId = hydrated && !editId && draft.documentId && !draft.dirty ? draft.documentId : null;
  const fresh = useQuery({
    queryKey: ["document", savedId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${savedId}`),
    enabled: !!savedId,
    retry: false,
  });
  useEffect(() => {
    const s = usePos.getState();
    if (fresh.data && s.documentId === fresh.data.id && !s.dirty && (fresh.data.status !== s.status || fresh.data.updatedAt !== s.savedAt)) loadDocument(fresh.data);
    if (fresh.error && s.documentId === savedId && !s.dirty) reset(s.type); // deleted or no longer accessible
  }, [fresh.data, fresh.error, savedId, loadDocument, reset]);

  // Deep links: /pos?type=INVOICE, /pos?edit=<documentId>
  const typeParam = params.get("type");
  const editQuery = useQuery({
    queryKey: ["document", editId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${editId}`),
    enabled: !!editId && hydrated,
  });
  useEffect(() => {
    if (!hydrated || !editQuery.data) return;
    if (usePos.getState().documentId !== editQuery.data.id || !usePos.getState().dirty) loadDocument(editQuery.data);
    router.replace("/pos");
  }, [editQuery.data, hydrated, loadDocument, router]);

  // /pos?customer=<id>: start (or continue) a draft for this customer.
  const customerParam = params.get("customer");
  const customerQuery = useQuery({
    queryKey: ["customer-lite", customerParam],
    queryFn: () => api.get<CustomerLite>(`/customers/${customerParam}`),
    enabled: !!customerParam && hydrated,
  });
  useEffect(() => {
    if (!hydrated || !customerQuery.data) return;
    const s = usePos.getState();
    const wanted = typeParam === "PROFORMA" || typeParam === "INVOICE" ? typeParam : s.type;
    if (s.documentId && !s.dirty) reset(wanted);
    else if (!s.documentId) setType(wanted);
    if (!usePos.getState().customer.id || usePos.getState().customer.id !== customerQuery.data.id) {
      if (itemCount(usePos.getState().groups) === 0 || !usePos.getState().customer.name) usePos.getState().selectCustomer(customerQuery.data);
      else toast.warning("Finish or clear the current draft first", `It belongs to ${usePos.getState().customer.name}.`);
    }
    router.replace("/pos");
  }, [customerQuery.data, hydrated, reset, setType, router, typeParam]);

  useEffect(() => {
    if (!hydrated || customerParam || (typeParam !== "PROFORMA" && typeParam !== "INVOICE")) return;
    const s = usePos.getState();
    if (s.documentId) {
      // Responding once to a navigation (?type=) is a legitimate effect; it can't be derived during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s.dirty) setConfirmNew(typeParam);
      else reset(typeParam);
    } else if (itemCount(s.groups) > 0 && s.type !== typeParam) {
      setType(typeParam);
      toast.info(`Switched your unsaved draft to ${DOCUMENT_TYPE_LABEL[typeParam].toLowerCase()}`);
    } else if (itemCount(s.groups) === 0) {
      reset(typeParam);
    }
    router.replace("/pos");
  }, [typeParam, hydrated, reset, setType, router, customerParam]);

  // Warn before closing the tab with unsaved work (the draft is also autosaved locally).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = usePos.getState();
      if (s.dirty && itemCount(s.groups) > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useHotkeys([
    { combo: "/", handler: () => (isDesktop ? (searchRef.current?.focus(), searchRef.current?.select()) : setMobileTab("catalog")) },
    { combo: "mod+s", handler: () => !save.isPending && save.mutate() },
  ]);

  const calc = useMemo(() => calcDraft(draft, settings), [draft, settings]);
  const count = itemCount(draft.groups);
  const groupOptions = useMemo(() => draft.groups.map((g, i) => ({ key: g.key, label: g.name.trim() || `Group ${i + 1}` })), [draft.groups]);
  const savings = useMemo(() => {
    let s = new D(0);
    for (const g of draft.groups) for (const i of g.items) if (i.mrp && dec(i.mrp).gt(i.rate || "0")) s = s.plus(dec(i.mrp).minus(i.rate || "0").mul(i.quantity || "0"));
    return s.toString();
  }, [draft.groups]);

  const [dragItemKey, setDragItemKey] = useState<string | null>(null);

  function startNew(type: DocumentType) {
    const s = usePos.getState();
    if (s.dirty && itemCount(s.groups) > 0) setConfirmNew(type);
    else {
      reset(type);
      if (settings) usePos.getState().applyDefaults(settings);
    }
  }

  if (!hydrated) return <PosSkeleton />;

  const locked = draft.status === "CONVERTED" || draft.status === "CANCELLED";
  const effectiveView: View = view === "split" && !isWide ? "edit" : view;

  const editor = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 p-3 sm:p-4">
          {locked && (
            <div className="rounded-lg border border-warning/40 bg-warning/8 px-3 py-2 text-sm">
              This {DOCUMENT_TYPE_LABEL[draft.type].toLowerCase()} is {DOCUMENT_STATUS_LABEL[draft.status].toLowerCase()} and can&apos;t be edited. Start a new one or duplicate it from its page.
            </div>
          )}
          {draft.groups.map((g, i) => (
            <GroupCard
              key={g.key}
              group={g}
              index={i}
              count={g.items.length}
              subtotal={calc.groups[i]?.subtotal ?? "0"}
              groupOptions={groupOptions}
              pricesIncludeTax={!!settings?.pricesIncludeTax}
              dragItemKey={dragItemKey}
              setDragItemKey={setDragItemKey}
            />
          ))}
          <Button variant="outline" className="justify-self-start border-dashed" onClick={() => addGroup()}>
            <FolderPlus /> Add group
          </Button>
        </div>
      </div>
    </div>
  );

  const preview = (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50 p-3 sm:p-6">
      {settings ? <LivePreview settings={settings} /> : <Skeleton className="mx-auto aspect-[210/297] max-w-[820px]" />}
    </div>
  );

  const footer = (
    <div className="border-t bg-background/95 p-3 backdrop-blur sm:px-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] sm:items-end">
        <div className="order-2 flex flex-wrap items-center gap-2 sm:order-1">
          <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
            <Settings2 /> Customise
          </Button>
          {draft.publicToken && (
            <Button variant="ghost" size="sm" className="max-sm:hidden" render={<a href={`/i/${draft.publicToken}`} target="_blank" rel="noreferrer" />}>
              <ExternalLink /> Public page
            </Button>
          )}
          {draft.documentId && (
            <Button variant="ghost" size="sm" className="max-sm:hidden" render={<Link href={`/${draft.type === "INVOICE" ? "invoices" : "proformas"}/${draft.documentId}`} />}>
              <Link2 /> Open record
            </Button>
          )}
        </div>
        <div className="order-1 sm:order-2">
          <TotalsPanel calc={calc} savings={savings} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {draft.dirty ? (count ? "Unsaved changes (kept on this device)" : "") : draft.documentId ? "All changes saved" : ""}
        </span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button variant={draft.dirty || !draft.documentId ? "default" : "outline"} loading={save.isPending} disabled={locked || count === 0} onClick={() => save.mutate()} />
            }
          >
            <Save /> {draft.documentId ? "Save changes" : "Save"}
          </TooltipTrigger>
          <TooltipPopup>
            <span className="flex items-center gap-1.5">
              Save <Kbd>⌘S</Kbd>
            </span>
          </TooltipPopup>
        </Tooltip>
        <SendMenu
          disabled={count === 0 || locked}
          ensureSaved={async () => {
            const s = usePos.getState();
            if (s.documentId && !s.dirty) return s.documentId;
            const doc = await save.mutateAsync();
            return doc.id;
          }}
        />
      </div>
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 sm:px-4">
      <Tabs value={draft.type} onValueChange={(v) => setType(v as DocumentType)}>
        <TabsList aria-label="Document type">
          <TabsTab value="PROFORMA" disabled={!!draft.documentId && draft.type !== "PROFORMA"}>
            Proforma
          </TabsTab>
          <TabsTab value="INVOICE" disabled={!!draft.documentId && draft.type !== "INVOICE"}>
            Invoice
          </TabsTab>
        </TabsList>
      </Tabs>
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold tabular">{draft.number ?? `New ${DOCUMENT_TYPE_LABEL[draft.type].toLowerCase()}`}</span>
        {draft.documentId && <StatusBadge status={draft.status} />}
      </div>
      <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
        Date
        <Input type="date" size="sm" nativeInput value={draft.issueDate} onChange={(e) => e.target.value && set({ issueDate: e.target.value })} className="w-36 tabular" />
      </label>
      {isDesktop && (
        <Tabs value={effectiveView} onValueChange={(v) => setView(v as View)}>
          <TabsList aria-label="View">
            <TabsTab value="edit" aria-label="Editor">
              <PencilRuler className="size-4" />
            </TabsTab>
            <TabsTab value="preview" aria-label="Preview">
              <Eye className="size-4" />
            </TabsTab>
            {isWide && (
              <TabsTab value="split" aria-label="Side by side">
                <Columns2 className="size-4" />
              </TabsTab>
            )}
          </TabsList>
        </Tabs>
      )}
      <Button size="sm" variant="ghost" onClick={() => startNew(draft.type)} aria-label="Start a new document">
        <FilePlus2 /> <span className="hidden sm:inline">New</span>
      </Button>
    </div>
  );

  const leftPanel = (
    <div className="flex min-h-0 flex-col gap-4 p-3 sm:p-4">
      <CustomerPanel />
      <ProductCatalog searchRef={searchRef} className="min-h-0 flex-1" />
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      {isDesktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r bg-sidebar/40">{leftPanel}</aside>
          <section className="flex min-h-0 flex-col" aria-label="Invoice editor">
            {header}
            {effectiveView === "edit" && editor}
            {effectiveView === "preview" && preview}
            {effectiveView === "split" && (
              <div className="grid min-h-0 flex-1 grid-cols-2">
                <div className="flex min-h-0 flex-col border-r">{editor}</div>
                <div className="flex min-h-0 flex-col">{preview}</div>
              </div>
            )}
            {footer}
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {mobileTab === "catalog" && <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{leftPanel}</div>}
          {mobileTab === "cart" && (
            <div className="flex min-h-0 flex-1 flex-col">
              {header}
              {editor}
              {footer}
            </div>
          )}
          {mobileTab === "preview" && preview}
          <nav className="grid grid-cols-3 border-t bg-background" aria-label="POS sections">
            {(
              [
                ["catalog", "Catalog", ShoppingBasket],
                ["cart", `Cart${count ? ` (${count})` : ""}`, SquarePen],
                ["preview", formatINR(calc.totals.grandTotal), PanelRight],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setMobileTab(k)}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-xs", mobileTab === k ? "text-primary" : "text-muted-foreground")}
                aria-current={mobileTab === k}
              >
                <Icon className="size-5" />
                <span className="tabular">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      <CustomizeSheet open={customizeOpen} onOpenChange={setCustomizeOpen} settings={settings} />

      <AlertDialog open={!!confirmNew} onOpenChange={(o) => !o && setConfirmNew(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>The current {DOCUMENT_TYPE_LABEL[draft.type].toLowerCase()} has changes that haven&apos;t been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep editing</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                reset(confirmNew ?? "PROFORMA");
                if (settings) usePos.getState().applyDefaults(settings);
                setConfirmNew(null);
              }}
            >
              Discard and start new
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}

/** Subscribes to the whole draft so every keystroke (notes, layout, customer) re-renders the page. */
function LivePreview({ settings }: { settings: NonNullable<ReturnType<typeof useSettings>["data"]> }) {
  const state = usePos();
  const doc = useMemo(() => toRenderable(state, settings), [state, settings]);
  return <DocumentPreview doc={doc} className="mx-auto max-w-[820px]" />;
}

function PosSkeleton() {
  return (
    <div className="grid h-[calc(100dvh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(340px,420px)_1fr]">
      <div className="grid content-start gap-3 border-r p-4">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
      <div className="hidden gap-3 p-4 lg:grid lg:content-start">
        <Skeleton className="h-10" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}
