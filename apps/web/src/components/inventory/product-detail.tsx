"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, PackagePlus, PencilLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { dec, formatINR, formatQty, PRODUCT_KIND_LABEL } from "@organo/shared";
import { ErrorState } from "@/components/common/error-state";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { Movement, Product } from "@/lib/types";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { MovementTable } from "./inventory-view";
import { ProductFormSheet } from "./product-form-sheet";

interface ProductDetail extends Product {
  prices: Array<{ id: string; mrp: string | null; sellingPrice: string | null; costPrice: string | null; source: string; sourceRef: string | null; note: string | null; effectiveAt: string; user: { name: string } | null }>;
  movements: Movement[];
  sales: { quantity: string; revenue: string };
}

const SOURCE_LABEL: Record<string, string> = {
  SEED: "Initial catalog",
  CATALOG: "Supplier catalogue",
  HISTORICAL_DOCUMENT: "Past estimate",
  MANUAL: "Edited",
  IMPORT: "CSV import",
};

const ATTR_LABELS: Record<string, string> = {
  localName: "Local name",
  scientificName: "Scientific name",
  bagSize: "Bag size",
  height: "Height",
  plantType: "Plant type",
  brand: "Brand",
  series: "Series",
  potSize: "Size",
  dimensions: "Dimensions",
  material: "Material",
  color: "Colours",
  packOf: "Pack of",
  serviceType: "Service type",
  materialType: "Material type",
};

export function ProductDetailView({ id }: { id: string }) {
  const { data: p, isLoading, error, refetch } = useQuery({ queryKey: ["product", id], queryFn: () => api.get<ProductDetail>(`/products/${id}`) });
  usePageTitle(p?.name);
  const [editOpen, setEditOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  if (isLoading)
    return (
      <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-14 w-1/2" />
        <Skeleton className="h-28" />
        <Skeleton className="h-80" />
      </div>
    );
  if (error || !p) return <ErrorState error={error} onRetry={() => refetch()} title="Couldn't load this product" />;

  const attrs = Object.entries(p.attributes ?? {}).filter(([k, v]) => ATTR_LABELS[k] && v);
  const margin = p.costPrice && dec(p.sellingPrice).gt(0) ? dec(p.sellingPrice).minus(p.costPrice).div(p.sellingPrice).mul(100).toDecimalPlaces(0).toNumber() : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-wrap items-start gap-3">
        <Button size="icon-sm" variant="ghost" render={<Link href="/inventory" />} aria-label="Back to inventory">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{p.name}</h2>
            {!p.active && <Badge variant="secondary">Inactive</Badge>}
            {p.attributes?.priceOnRequest === true && <Badge variant="warning">Price on request</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono text-xs">{p.sku}</span>
            {"  "}
            {p.category?.name ?? PRODUCT_KIND_LABEL[p.kind]}, sold per {p.unit}
          </p>
        </div>
        <div className="flex gap-2">
          {p.trackStock && (
            <Button variant="outline" onClick={() => setAdjustOpen(true)}>
              <PackagePlus /> Adjust stock
            </Button>
          )}
          <Button onClick={() => setEditOpen(true)}>
            <PencilLine /> Edit
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Selling price" value={formatINR(p.sellingPrice)} />
        <Stat label="MRP" value={p.mrp ? formatINR(p.mrp) : "-"} hint={p.mrp && dec(p.mrp).gt(p.sellingPrice) ? `${dec(p.mrp).minus(p.sellingPrice).div(p.mrp).mul(100).toDecimalPlaces(0).toString()}% off MRP` : undefined} />
        <Stat label="Cost" value={p.costPrice ? formatINR(p.costPrice) : "-"} hint={margin !== null ? `${margin}% margin` : undefined} />
        <Stat label="GST" value={`${formatQty(p.taxRate)}%`} hint={p.hsnCode ? `HSN ${p.hsnCode}` : undefined} />
        <Stat label="In stock" value={p.trackStock ? `${formatQty(p.stockQuantity)} ${p.unit}` : "Not tracked"} hint={p.lowStockThreshold ? `Alert at ${formatQty(p.lowStockThreshold)}` : undefined} />
        <Stat label="Sold (invoiced)" value={`${formatQty(p.sales.quantity)} ${p.unit}`} hint={formatINR(p.sales.revenue)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs defaultValue={p.trackStock ? "stock" : "prices"}>
          <TabsList variant="underline" className="w-full justify-start *:data-[slot=tabs-tab]:grow-0 *:data-[slot=tabs-tab]:px-3 border-b">
            {p.trackStock && <TabsTab value="stock">Stock history</TabsTab>}
            <TabsTab value="prices">Price history</TabsTab>
          </TabsList>
          {p.trackStock && (
            <TabsPanel value="stock" className="pt-4">
              {p.movements.length ? (
                <MovementTable rows={p.movements} />
              ) : (
                <p className="rounded-xl border py-10 text-center text-sm text-muted-foreground">No stock recorded yet. Use Adjust stock to add opening or purchased quantities.</p>
              )}
            </TabsPanel>
          )}
          <TabsPanel value="prices" className="pt-4">
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">MRP</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.prices.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground tabular">{fmtDate(r.effectiveAt)}</TableCell>
                      <TableCell>
                        <div>{SOURCE_LABEL[r.source] ?? r.source}</div>
                        <div className="text-xs text-muted-foreground">{[r.sourceRef, r.note, r.user?.name].filter(Boolean).join(", ")}</div>
                      </TableCell>
                      <TableCell className="text-right tabular">{r.mrp ? formatINR(r.mrp) : "-"}</TableCell>
                      <TableCell className="text-right font-medium tabular">{r.sellingPrice ? formatINR(r.sellingPrice) : "-"}</TableCell>
                      <TableCell className="hidden text-right tabular sm:table-cell">{r.costPrice ? formatINR(r.costPrice) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsPanel>
        </Tabs>
        <SectionCard title="Details">
          {attrs.length === 0 && !p.description ? (
            <p className="text-sm text-muted-foreground">No extra details.</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {attrs.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{ATTR_LABELS[k]}</dt>
                  <dd className="text-right">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.description && <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{p.description}</p>}
        </SectionCard>
      </div>

      <ProductFormSheet open={editOpen} onOpenChange={setEditOpen} product={p} />
      <AdjustStockDialog product={adjustOpen ? p : null} onClose={() => setAdjustOpen(false)} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
