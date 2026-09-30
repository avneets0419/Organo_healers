"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { useState } from "react";
import { dec, PRODUCT_KIND_LABEL, PRODUCT_KINDS, suggestRateFromMrp, type ProductKind } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetDescription, SheetFooter, SheetHeader, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCategories } from "@/hooks/use-settings";
import { api, ApiClientError } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Product } from "@/lib/types";

const ATTRS: Record<ProductKind, Array<[string, string, string?]>> = {
  PLANT: [
    ["localName", "Local name"],
    ["scientificName", "Scientific name"],
    ["bagSize", "Bag size", "18 x 18"],
    ["height", "Height", "7-8 ft"],
    ["plantType", "Plant type", "Tree, shrub, topiary"],
  ],
  POT: [
    ["brand", "Brand", "Greenri"],
    ["series", "Series", "Lush / Flutex"],
    ["potSize", "Size", "18\""],
    ["dimensions", "Dimensions", "18 x 18 in"],
    ["material", "Material"],
    ["color", "Colours"],
    ["packOf", "Pack of"],
  ],
  MATERIAL: [["materialType", "Material type", "Fertilizer, potting mix"]],
  SERVICE: [["serviceType", "Service type", "Installation, maintenance"]],
  OTHER: [],
};

interface FormState {
  name: string;
  sku: string;
  kind: ProductKind;
  categoryId: string | null;
  unit: string;
  mrp: string;
  sellingPrice: string;
  costPrice: string;
  taxRate: string;
  hsnCode: string;
  trackStock: boolean;
  lowStockThreshold: string;
  openingStock: string;
  description: string;
  attributes: Record<string, string>;
  priceOnRequest: boolean;
  priceNote: string;
  active: boolean;
}

const blank: FormState = {
  name: "",
  sku: "",
  kind: "PLANT",
  categoryId: null,
  unit: "pc",
  mrp: "",
  sellingPrice: "",
  costPrice: "",
  taxRate: "0",
  hsnCode: "",
  trackStock: true,
  lowStockThreshold: "",
  openingStock: "",
  description: "",
  attributes: {},
  priceOnRequest: false,
  priceNote: "",
  active: true,
};

const KIND_PREFIX: Record<ProductKind, string> = { PLANT: "PL", POT: "POT", MATERIAL: "MAT", SERVICE: "SVC", OTHER: "OTH" };

function suggestSku(kind: ProductKind, name: string) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 28);
  return slug ? `${KIND_PREFIX[kind]}-${slug}` : "";
}

const money = (v: string) => v === "" || /^\d*\.?\d{0,2}$/.test(v);

function stateFrom(product?: Product | null): FormState {
  if (!product) return blank;
  const attrs = Object.fromEntries(Object.entries(product.attributes ?? {}).filter(([k, v]) => k !== "priceOnRequest" && typeof v === "string")) as Record<string, string>;
  return {
        name: product.name,
        sku: product.sku,
        kind: product.kind,
        categoryId: product.categoryId,
        unit: product.unit,
        mrp: product.mrp ? dec(product.mrp).toString() : "",
        sellingPrice: dec(product.sellingPrice).toString(),
        costPrice: product.costPrice ? dec(product.costPrice).toString() : "",
        taxRate: dec(product.taxRate).toString(),
        hsnCode: product.hsnCode ?? "",
        trackStock: product.trackStock,
        lowStockThreshold: product.lowStockThreshold ? dec(product.lowStockThreshold).toString() : "",
        openingStock: "",
        description: product.description ?? "",
        attributes: attrs,
        priceOnRequest: product.attributes?.priceOnRequest === true,
        priceNote: "",
        active: product.active,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
}

export function ProductFormSheet(props: Props) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetPopup side="right" className="w-full max-w-xl">
        {props.open && <ProductForm key={props.product?.id ?? "new"} {...props} />}
      </SheetPopup>
    </Sheet>
  );
}

function ProductForm({ onOpenChange, product }: Props) {
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const [f, setF] = useState<FormState>(() => stateFrom(product));
  const [skuTouched, setSkuTouched] = useState(!!product);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const editing = !!product;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const setAttr = (k: string, v: string) => setF((p) => ({ ...p, attributes: { ...p.attributes, [k]: v } }));

  const save = useMutation({
    mutationFn: () => {
      const attributes: Record<string, string | boolean> = Object.fromEntries(Object.entries(f.attributes).filter(([, v]) => v.trim()));
      if (f.priceOnRequest) attributes.priceOnRequest = true;
      const body = {
        name: f.name,
        sku: f.sku,
        kind: f.kind,
        categoryId: f.categoryId,
        unit: f.unit || "pc",
        mrp: f.mrp || null,
        sellingPrice: f.sellingPrice || "0",
        costPrice: f.costPrice || null,
        taxRate: f.taxRate || "0",
        hsnCode: f.hsnCode || null,
        trackStock: f.trackStock,
        lowStockThreshold: f.lowStockThreshold || null,
        description: f.description || null,
        attributes,
        active: f.active,
        priceNote: f.priceNote || null,
        ...(!editing && f.openingStock ? { openingStock: f.openingStock } : {}),
      };
      return editing ? api.patch<Product>(`/products/${product!.id}`, body) : api.post<Product>("/products", body);
    },
    onSuccess: (p) => {
      for (const k of [["products"], ["product", p.id], ["pos-products"], ["categories"], ["inventory-summary"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(editing ? `${p.name} updated` : `${p.name} added`);
      onOpenChange(false);
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.errors) setErrors(e.errors);
      toast.error(e);
    },
  });

  const cats = (categories ?? []).filter((c) => c.active);
  const err = (k: string) => errors[k]?.[0];

  return (
    <>
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${product!.name}` : "New product"}</SheetTitle>
          <SheetDescription>{editing ? "Price changes are kept in the product's price history. Past invoices don't change." : "Add a plant, pot, material or service to the catalog."}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <label className="grid gap-1.5 text-sm font-medium">
              Name
              <Input
                value={f.name}
                autoFocus
                onChange={(e) => {
                  const name = e.target.value;
                  setF((p) => ({ ...p, name, sku: skuTouched ? p.sku : suggestSku(p.kind, name) }));
                }}
                aria-invalid={!!err("name") || undefined}
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Type
              <Select
                value={f.kind}
                onValueChange={(v) => {
                  const kind = v as ProductKind;
                  setF((p) => ({ ...p, kind, trackStock: kind !== "SERVICE", sku: skuTouched ? p.sku : suggestSku(kind, p.name) }));
                }}
              >
                <SelectTrigger>
                  <SelectValue>{(v: string) => PRODUCT_KIND_LABEL[v as ProductKind]}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {PRODUCT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {PRODUCT_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium sm:col-span-1">
              SKU
              <Input
                value={f.sku}
                onChange={(e) => {
                  setSkuTouched(true);
                  set("sku", e.target.value.toUpperCase());
                }}
                aria-invalid={!!err("sku") || undefined}
                className="font-mono text-xs"
              />
              {err("sku") && <span className="text-xs font-normal text-destructive-foreground">{err("sku")}</span>}
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Category
              <Select value={f.categoryId ?? "NONE"} onValueChange={(v) => set("categoryId", v === "NONE" ? null : (v as string))}>
                <SelectTrigger>
                  <SelectValue>{(v: string) => cats.find((c) => c.id === v)?.name ?? "None"}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="NONE">None</SelectItem>
                  {cats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Unit
              <Input value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="pc, plant, bag, job" />
            </label>
          </div>

          <fieldset className="grid gap-3 rounded-xl border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Pricing</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium">
                MRP
                <Input nativeInput inputMode="decimal" value={f.mrp} onChange={(e) => money(e.target.value) && set("mrp", e.target.value)} className="tabular" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Selling price
                <Input
                  nativeInput
                  inputMode="decimal"
                  value={f.sellingPrice}
                  onChange={(e) => money(e.target.value) && set("sellingPrice", e.target.value)}
                  aria-invalid={!!err("sellingPrice") || undefined}
                  className="tabular"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Cost
                <Input nativeInput inputMode="decimal" value={f.costPrice} onChange={(e) => money(e.target.value) && set("costPrice", e.target.value)} className="tabular" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {f.mrp && dec(f.mrp).gt(0) && (
                <Button size="xs" variant="outline" onClick={() => set("sellingPrice", dec(suggestRateFromMrp(f.mrp)).toString())}>
                  <Wand2 /> MRP less 30% ({dec(suggestRateFromMrp(f.mrp)).toString()})
                </Button>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={f.priceOnRequest} onCheckedChange={(v) => set("priceOnRequest", v)} /> Price on request
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-sm font-medium">
                GST %
                <Input nativeInput inputMode="decimal" value={f.taxRate} onChange={(e) => money(e.target.value) && set("taxRate", e.target.value)} className="tabular" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                HSN / SAC
                <Input value={f.hsnCode} onChange={(e) => set("hsnCode", e.target.value)} />
              </label>
              {editing && (
                <label className="grid gap-1.5 text-sm font-medium">
                  Reason for price change
                  <Input value={f.priceNote} onChange={(e) => set("priceNote", e.target.value)} placeholder="Optional" />
                </label>
              )}
            </div>
          </fieldset>

          <fieldset className="grid gap-3 rounded-xl border p-3">
            <legend className="px-1 text-xs font-medium text-muted-foreground">Stock</legend>
            <label className="flex items-center justify-between gap-3 text-sm">
              Track stock for this item
              <Switch checked={f.trackStock} onCheckedChange={(v) => set("trackStock", v)} />
            </label>
            {f.trackStock && (
              <div className="grid gap-3 sm:grid-cols-2">
                {!editing && (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Opening stock
                    <Input nativeInput inputMode="decimal" value={f.openingStock} onChange={(e) => /^\d*\.?\d{0,3}$/.test(e.target.value) && set("openingStock", e.target.value)} className="tabular" />
                  </label>
                )}
                <label className="grid gap-1.5 text-sm font-medium">
                  Low stock alert at
                  <Input nativeInput inputMode="decimal" value={f.lowStockThreshold} onChange={(e) => /^\d*\.?\d{0,3}$/.test(e.target.value) && set("lowStockThreshold", e.target.value)} className="tabular" />
                </label>
              </div>
            )}
            {editing && f.trackStock && <p className="text-xs text-muted-foreground">Change stock with Adjust stock so every change is recorded.</p>}
          </fieldset>

          {ATTRS[f.kind].length > 0 && (
            <fieldset className="grid gap-3 rounded-xl border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">{PRODUCT_KIND_LABEL[f.kind]} details</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {ATTRS[f.kind].map(([k, label, ph]) => (
                  <label key={k} className="grid gap-1.5 text-sm font-medium">
                    {label}
                    <Input value={f.attributes[k] ?? ""} placeholder={ph} onChange={(e) => setAttr(k, e.target.value)} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <label className="grid gap-1.5 text-sm font-medium">
            Description
            <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} className="font-normal" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            Active (shown in POS)
            <Switch checked={f.active} onCheckedChange={(v) => set("active", v)} />
          </label>
        </SheetPanel>
        <SheetFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!f.name.trim() || !f.sku.trim()} onClick={() => save.mutate()}>
            {editing ? "Save product" : "Add product"}
          </Button>
        </SheetFooter>
    </>
  );
}
