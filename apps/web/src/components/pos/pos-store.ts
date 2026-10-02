"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  calculateDocument,
  dec,
  defaultLayout,
  formatPhone,
  joinAddress,
  type DocumentInput,
  type DocumentLayout,
  type DocumentStatus,
  type DocumentType,
  type ProductKind,
  type RenderableDocument,
} from "@organo/shared";
import type { CustomerLite, DocumentDetail, Product, Settings } from "@/lib/types";

/** Short unique keys for React lists and drag-and-drop. Never sent as database ids. */
const key = () => Math.random().toString(36).slice(2, 10);

export interface DraftItem {
  key: string;
  productId: string | null;
  name: string;
  sku: string | null;
  unit: string | null;
  kind: ProductKind | null;
  description: string | null;
  attributes: Record<string, string>;
  quantity: string;
  rate: string;
  mrp: string | null;
  discountType: "PERCENT" | "AMOUNT" | null;
  discountValue: string | null;
  taxRate: string;
  /** Catalog hints for warnings; not persisted on the document. */
  stock?: string | null;
  trackStock?: boolean;
  priceOnRequest?: boolean;
}

export interface DraftGroup {
  key: string;
  name: string;
  notes: string | null;
  collapsed: boolean;
  items: DraftItem[];
}

export interface DraftCustomer {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  companyName: string | null;
  gstin: string | null;
  billingAddress: string;
  shippingAddress: string;
  status?: string;
  /** Snapshot of the selected record, to detect edits. */
  original?: { name: string; phone: string; email: string } | null;
}

export interface Draft {
  documentId: string | null;
  number: string | null;
  status: DocumentStatus;
  publicToken: string | null;
  type: DocumentType;
  customer: DraftCustomer;
  groups: DraftGroup[];
  activeGroupKey: string;
  title: string;
  issueDate: string; // yyyy-mm-dd
  discountType: "PERCENT" | "AMOUNT" | null;
  discountValue: string;
  notes: string;
  terms: string;
  paymentTerms: string;
  footer: string;
  layout: DocumentLayout;
  defaultsApplied: boolean;
  dirty: boolean;
  savedAt: string | null;
}

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const emptyCustomer = (): DraftCustomer => ({
  id: null,
  name: "",
  phone: "",
  email: "",
  companyName: null,
  gstin: null,
  billingAddress: "",
  shippingAddress: "",
  original: null,
});

export function newGroup(name = ""): DraftGroup {
  return { key: key(), name, notes: null, collapsed: false, items: [] };
}

export function emptyDraft(type: DocumentType = "PROFORMA"): Draft {
  const g = newGroup();
  return {
    documentId: null,
    number: null,
    status: "DRAFT",
    publicToken: null,
    type,
    customer: emptyCustomer(),
    groups: [g],
    activeGroupKey: g.key,
    title: "",
    issueDate: today(),
    discountType: null,
    discountValue: "",
    notes: "",
    terms: "",
    paymentTerms: "",
    footer: "",
    layout: defaultLayout(),
    defaultsApplied: false,
    dirty: false,
    savedAt: null,
  };
}

function itemFromProduct(p: Product, quantity = "1"): DraftItem {
  const attrs: Record<string, string> = {};
  for (const k of ["bagSize", "height", "potSize", "dimensions", "color", "localName"]) {
    const v = p.attributes?.[k];
    if (typeof v === "string" && v) attrs[k] = v;
  }
  return {
    key: key(),
    productId: p.id,
    name: p.name,
    sku: p.sku,
    unit: p.unit,
    kind: p.kind,
    description: null,
    attributes: attrs,
    quantity,
    rate: dec(p.sellingPrice).toString(),
    mrp: p.mrp ? dec(p.mrp).toString() : null,
    discountType: null,
    discountValue: null,
    taxRate: dec(p.taxRate).toString(),
    stock: p.stockQuantity,
    trackStock: p.trackStock,
    priceOnRequest: p.attributes?.priceOnRequest === true,
  };
}

type Patch<T> = Partial<T> | ((prev: T) => Partial<T>);

interface Actions {
  set: (patch: Patch<Draft>) => void;
  reset: (type?: DocumentType) => void;
  applyDefaults: (s: Settings) => void;
  setType: (t: DocumentType) => void;
  setCustomer: (patch: Partial<DraftCustomer>) => void;
  selectCustomer: (c: CustomerLite) => void;
  clearCustomer: () => void;
  addProduct: (p: Product, groupKey?: string) => { merged: boolean };
  addCustomItem: (groupKey?: string) => string;
  updateItem: (itemKey: string, patch: Partial<DraftItem>) => void;
  removeItem: (itemKey: string) => void;
  moveItem: (itemKey: string, toGroupKey: string, toIndex?: number) => void;
  addGroup: (name?: string) => string;
  updateGroup: (groupKey: string, patch: Partial<DraftGroup>) => void;
  removeGroup: (groupKey: string) => void;
  duplicateGroup: (groupKey: string) => void;
  moveGroup: (groupKey: string, dir: -1 | 1) => void;
  setActiveGroup: (groupKey: string) => void;
  setLayout: (patch: Patch<DocumentLayout>) => void;
  loadDocument: (d: DocumentDetail) => void;
  markSaved: (d: DocumentDetail) => void;
}

export type PosState = Draft & Actions;

function mapGroups(groups: DraftGroup[], fn: (g: DraftGroup) => DraftGroup) {
  return groups.map(fn);
}

export const usePos = create<PosState>()(
  persist(
    (set, get) => {
      const mutate = (patch: Patch<Draft>) =>
        set((s) => ({ ...(typeof patch === "function" ? patch(s) : patch), dirty: true }));

      return {
        ...emptyDraft(),

        set: mutate,

        reset: (type) => set({ ...emptyDraft(type ?? get().type) }),

        applyDefaults: (s) => {
          if (get().defaultsApplied) return;
          set({
            notes: s.defaultNotes ?? "",
            terms: s.defaultTerms ?? "",
            paymentTerms: s.paymentTerms ?? "",
            footer: s.invoiceFooter ?? "",
            layout: s.defaultLayout ?? defaultLayout(),
            defaultsApplied: true,
          });
        },

        setType: (t) => {
          if (get().documentId && get().type !== t) return; // saved documents keep their type
          mutate({ type: t });
        },

        setCustomer: (patch) => mutate((s) => ({ customer: { ...s.customer, ...patch } })),

        selectCustomer: (c) =>
          mutate({
            customer: {
              id: c.id,
              name: c.name,
              phone: c.phone ? formatPhone(c.phone) : "",
              email: c.email ?? "",
              companyName: c.companyName,
              gstin: c.gstin,
              billingAddress: c.billingAddress ?? "",
              shippingAddress: c.shippingAddress ?? "",
              status: c.status,
              original: { name: c.name, phone: c.phone ? formatPhone(c.phone) : "", email: c.email ?? "" },
            },
          }),

        clearCustomer: () => mutate({ customer: emptyCustomer() }),

        addProduct: (p, groupKey) => {
          const target = groupKey ?? get().activeGroupKey;
          let merged = false;
          mutate((s) => {
            const groups = s.groups.some((g) => g.key === target) ? s.groups : [...s.groups, { ...newGroup(), key: target }];
            return {
              activeGroupKey: target,
              groups: mapGroups(groups, (g) => {
                if (g.key !== target) return g;
                const existing = g.items.find((i) => i.productId === p.id && !i.discountType);
                if (existing) {
                  merged = true;
                  return {
                    ...g,
                    collapsed: false,
                    items: g.items.map((i) => (i === existing ? { ...i, quantity: dec(i.quantity).plus(1).toString() } : i)),
                  };
                }
                return { ...g, collapsed: false, items: [...g.items, itemFromProduct(p)] };
              }),
            };
          });
          return { merged };
        },

        addCustomItem: (groupKey) => {
          const target = groupKey ?? get().activeGroupKey;
          const item: DraftItem = {
            key: key(),
            productId: null,
            name: "",
            sku: null,
            unit: null,
            kind: null,
            description: null,
            attributes: {},
            quantity: "1",
            rate: "0",
            mrp: null,
            discountType: null,
            discountValue: null,
            taxRate: "0",
          };
          mutate((s) => ({ groups: mapGroups(s.groups, (g) => (g.key === target ? { ...g, collapsed: false, items: [...g.items, item] } : g)) }));
          return item.key;
        },

        updateItem: (itemKey, patch) =>
          mutate((s) => ({
            groups: mapGroups(s.groups, (g) =>
              g.items.some((i) => i.key === itemKey) ? { ...g, items: g.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : g,
            ),
          })),

        removeItem: (itemKey) =>
          mutate((s) => ({ groups: mapGroups(s.groups, (g) => ({ ...g, items: g.items.filter((i) => i.key !== itemKey) })) })),

        moveItem: (itemKey, toGroupKey, toIndex) =>
          mutate((s) => {
            let moving: DraftItem | undefined;
            const without = s.groups.map((g) => {
              const found = g.items.find((i) => i.key === itemKey);
              if (found) moving = found;
              return found ? { ...g, items: g.items.filter((i) => i.key !== itemKey) } : g;
            });
            if (!moving) return {};
            const item = moving;
            return {
              groups: without.map((g) => {
                if (g.key !== toGroupKey) return g;
                const items = [...g.items];
                items.splice(toIndex === undefined ? items.length : Math.max(0, Math.min(toIndex, items.length)), 0, item);
                return { ...g, collapsed: false, items };
              }),
            };
          }),

        addGroup: (name = "") => {
          const g = newGroup(name);
          mutate((s) => ({ groups: [...s.groups, g], activeGroupKey: g.key }));
          return g.key;
        },

        updateGroup: (groupKey, patch) =>
          mutate((s) => ({ groups: mapGroups(s.groups, (g) => (g.key === groupKey ? { ...g, ...patch } : g)) })),

        removeGroup: (groupKey) =>
          mutate((s) => {
            const groups = s.groups.filter((g) => g.key !== groupKey);
            const safe = groups.length ? groups : [newGroup()];
            return {
              groups: safe,
              activeGroupKey: s.activeGroupKey === groupKey ? safe[safe.length - 1]!.key : s.activeGroupKey,
            };
          }),

        duplicateGroup: (groupKey) =>
          mutate((s) => {
            const idx = s.groups.findIndex((g) => g.key === groupKey);
            const src = s.groups[idx];
            if (!src) return {};
            const copy: DraftGroup = {
              ...src,
              key: key(),
              name: src.name ? `${src.name} (copy)` : "",
              items: src.items.map((i) => ({ ...i, key: key() })),
            };
            const groups = [...s.groups];
            groups.splice(idx + 1, 0, copy);
            return { groups, activeGroupKey: copy.key };
          }),

        moveGroup: (groupKey, dir) =>
          mutate((s) => {
            const idx = s.groups.findIndex((g) => g.key === groupKey);
            const to = idx + dir;
            if (idx < 0 || to < 0 || to >= s.groups.length) return {};
            const groups = [...s.groups];
            [groups[idx], groups[to]] = [groups[to]!, groups[idx]!];
            return { groups };
          }),

        setActiveGroup: (groupKey) => set({ activeGroupKey: groupKey }),

        setLayout: (patch) => mutate((s) => ({ layout: { ...s.layout, ...(typeof patch === "function" ? patch(s.layout) : patch) } })),

        loadDocument: (d) => {
          const groups: DraftGroup[] = d.groups.map((g) => ({
            key: key(),
            name: g.name,
            notes: g.notes,
            collapsed: false,
            items: g.items.map((i) => ({
              key: key(),
              productId: i.productId,
              name: i.name,
              sku: i.sku,
              unit: i.unit,
              kind: i.kind,
              description: i.description,
              attributes: Object.fromEntries(Object.entries(i.attributes ?? {}).map(([k, v]) => [k, v === null ? "" : String(v)])),
              quantity: dec(i.quantity).toString(),
              rate: dec(i.rate).toString(),
              mrp: i.mrp ? dec(i.mrp).toString() : null,
              discountType: i.discountType,
              discountValue: i.discountValue ? dec(i.discountValue).toString() : null,
              taxRate: dec(i.taxRate).toString(),
            })),
          }));
          const safe = groups.length ? groups : [newGroup()];
          set({
            documentId: d.id,
            number: d.number,
            status: d.status,
            publicToken: d.publicToken,
            type: d.type,
            customer: {
              id: d.customer.id,
              name: d.customer.name,
              phone: d.customer.phone ? formatPhone(d.customer.phone) : "",
              email: d.customer.email ?? "",
              companyName: null,
              gstin: null,
              billingAddress: d.customerSnapshot.billingAddress ?? "",
              shippingAddress: d.customerSnapshot.shippingAddress ?? "",
              status: d.customer.status,
              original: { name: d.customer.name, phone: d.customer.phone ? formatPhone(d.customer.phone) : "", email: d.customer.email ?? "" },
            },
            groups: safe,
            activeGroupKey: safe[0]!.key,
            title: d.title ?? "",
            issueDate: d.issueDate.slice(0, 10),
            discountType: d.discountType,
            discountValue: d.discountValue ? dec(d.discountValue).toString() : "",
            notes: d.notes ?? "",
            terms: d.terms ?? "",
            paymentTerms: d.paymentTerms ?? "",
            footer: d.footer ?? "",
            layout: d.layout,
            defaultsApplied: true,
            dirty: false,
            savedAt: d.updatedAt,
          });
        },

        markSaved: (d) =>
          set((s) => ({
            documentId: d.id,
            number: d.number,
            status: d.status,
            publicToken: d.publicToken,
            customer: {
              ...s.customer,
              id: d.customer.id,
              name: d.customer.name,
              phone: d.customer.phone ? formatPhone(d.customer.phone) : "",
              email: d.customer.email ?? "",
              status: d.customer.status,
              original: { name: d.customer.name, phone: d.customer.phone ? formatPhone(d.customer.phone) : "", email: d.customer.email ?? "" },
            },
            dirty: false,
            savedAt: d.updatedAt,
          })),
      };
    },
    {
      name: "oh-pos-draft-v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // Persist data only; actions are recreated by the store.
      partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== "function")) as Partial<PosState>,
    },
  ),
);

// ─── Derived data ────────────────────────────────────────────────────────────

export function itemCount(groups: DraftGroup[]) {
  return groups.reduce((n, g) => n + g.items.length, 0);
}

export function calcDraft(d: Pick<Draft, "groups" | "discountType" | "discountValue">, s?: Settings | null) {
  return calculateDocument(
    d.groups.map((g) => ({
      items: g.items.map((i) => ({
        quantity: i.quantity || "0",
        rate: i.rate || "0",
        discountType: i.discountType,
        discountValue: i.discountValue,
        taxRate: i.taxRate || "0",
      })),
    })),
    {
      discountType: d.discountType,
      discountValue: d.discountValue || null,
      pricesIncludeTax: s?.pricesIncludeTax,
      roundToRupee: s?.roundToRupee ?? true,
    },
  );
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00+05:30`);
  return new Date(d.getTime() + days * 86_400_000).toISOString();
}

/** Same shape the server returns, built locally so the preview updates on every keystroke. */
export function toRenderable(d: Draft, s: Settings | null | undefined): RenderableDocument {
  const calc = calcDraft(d, s);
  return {
    type: d.type,
    number: d.number,
    status: d.status,
    title: d.title || null,
    issueDate: `${d.issueDate}T12:00:00+05:30`,
    dueDate: d.type === "INVOICE" ? addDays(d.issueDate, s?.invoiceDueDays ?? 7) : null,
    validUntil: d.type === "PROFORMA" ? addDays(d.issueDate, s?.proformaValidDays ?? 15) : null,
    business: {
      name: s?.businessName ?? "",
      legalName: s?.legalName,
      tagline: s?.tagline,
      logoUrl: s?.logoUrl,
      gstNumber: s?.gstNumber,
      address: joinAddress([s?.addressLine1, s?.addressLine2, s?.city, s?.state && s?.postalCode ? `${s.state} ${s.postalCode}` : (s?.state ?? s?.postalCode)]),
      phone: s?.phone ? formatPhone(s.phone) : null,
      email: s?.email,
      website: s?.website,
      upiId: s?.upiId,
      upiPhone: s?.upiPhone ? formatPhone(s.upiPhone) : null,
      bankName: s?.bankName,
      accountName: s?.accountName,
      accountNumber: s?.accountNumber,
      ifsc: s?.ifsc,
      paymentInstructions: s?.paymentInstructions,
    },
    customer: {
      name: d.customer.name,
      companyName: d.customer.companyName,
      phone: d.customer.phone || null,
      email: d.customer.email || null,
      gstin: d.customer.gstin,
      billingAddress: d.customer.billingAddress || null,
      shippingAddress: d.customer.shippingAddress || null,
    },
    groups: d.groups.map((g, gi) => ({
      name: g.name,
      notes: g.notes,
      subtotal: calc.groups[gi]!.subtotal,
      items: g.items.map((i, ii) => {
        const r = calc.groups[gi]!.items[ii]!;
        return {
          name: i.name || "Untitled item",
          sku: i.sku,
          description: i.description,
          unit: i.unit,
          kind: i.kind,
          attributes: i.attributes,
          quantity: i.quantity || "0",
          mrp: i.mrp,
          rate: i.rate || "0",
          discountType: i.discountType,
          discountValue: i.discountValue,
          discountAmount: r.discountAmount,
          taxRate: i.taxRate || "0",
          taxAmount: r.taxAmount,
          total: r.total,
        };
      }),
    })),
    totals: { ...calc.totals, discountType: d.discountType, discountValue: d.discountValue || null },
    notes: d.notes,
    terms: d.terms,
    paymentTerms: d.paymentTerms,
    footer: d.footer,
    layout: d.layout,
  };
}

export function toDocumentInput(d: Draft, customerId: string): DocumentInput {
  const clean = (v: string) => (v.trim() ? v.trim() : null);
  return {
    type: d.type,
    customerId,
    title: clean(d.title),
    issueDate: new Date(`${d.issueDate}T12:00:00+05:30`),
    groups: d.groups
      .filter((g) => g.items.length || g.name.trim())
      .map((g) => ({
        name: g.name.trim(),
        notes: g.notes,
        items: g.items.map((i) => ({
          productId: i.productId,
          name: i.name.trim() || "Untitled item",
          sku: i.sku,
          description: i.description,
          unit: i.unit,
          kind: i.kind,
          attributes: Object.fromEntries(Object.entries(i.attributes).filter(([, v]) => v !== "")),
          quantity: i.quantity || "0",
          mrp: i.mrp || null,
          rate: i.rate || "0",
          discountType: i.discountType,
          discountValue: i.discountType ? i.discountValue || "0" : null,
          taxRate: i.taxRate || "0",
        })),
      })),
    discountType: d.discountType && d.discountValue ? d.discountType : null,
    discountValue: d.discountType && d.discountValue ? d.discountValue : null,
    notes: clean(d.notes),
    terms: clean(d.terms),
    paymentTerms: clean(d.paymentTerms),
    footer: clean(d.footer),
    layout: d.layout,
    customerOverrides: {
      billingAddress: clean(d.customer.billingAddress),
      shippingAddress: clean(d.customer.shippingAddress),
    },
  };
}
