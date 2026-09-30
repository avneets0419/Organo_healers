"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Eye, History, MoreHorizontal, PackagePlus, PencilLine, Plus, Power, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { dec, formatINR, formatQty, MOVEMENT_TYPE_LABEL, PRODUCT_KIND_LABEL, PRODUCT_KINDS, type ProductKind } from "@organo/shared";
import { ErrorState } from "@/components/common/error-state";
import { PageBody, PageHeader } from "@/components/common/page-header";
import { PaginationBar } from "@/components/common/pagination-bar";
import { SectionCard } from "@/components/common/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories } from "@/hooks/use-settings";
import { api, type PageMeta } from "@/lib/api";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { Category, Movement, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { ProductFormSheet } from "./product-form-sheet";

interface Summary {
  total: number;
  active: number;
  outOfStock: number;
  lowStock: number;
  stockValueRetail: string;
  stockValueCost: string;
}

type StockFilter = "all" | "low" | "out";

export function InventoryView() {
  const [tab, setTab] = useState("products");
  const summary = useQuery({ queryKey: ["inventory-summary"], queryFn: () => api.get<Summary>("/products/summary") });
  const s = summary.data;

  return (
    <PageBody>
      <PageHeader title="Inventory" description="Catalog, stock levels and every stock movement." />
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Active products" value={s ? String(s.active) : null} hint={s ? `${s.total - s.active} inactive` : undefined} />
        <Tile label="Out of stock" value={s ? String(s.outOfStock) : null} hint="Tracked items at 0 or below" tone={s && s.outOfStock ? "warn" : undefined} />
        <Tile label="Low stock" value={s ? String(s.lowStock) : null} hint="At or under their alert level" tone={s && s.lowStock ? "warn" : undefined} />
        <Tile label="Stock value" value={s ? formatINR(s.stockValueRetail) : null} hint={s ? `${formatINR(s.stockValueCost)} at cost` : undefined} />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="mt-6">
        <TabsList variant="underline" className="w-full justify-start *:data-[slot=tabs-tab]:grow-0 *:data-[slot=tabs-tab]:px-3 border-b">
          <TabsTab value="products">Products</TabsTab>
          <TabsTab value="movements">Stock movements</TabsTab>
          <TabsTab value="categories">Categories</TabsTab>
        </TabsList>
        <TabsPanel value="products" className="pt-4">
          <ProductsTab />
        </TabsPanel>
        <TabsPanel value="movements" className="pt-4">
          <MovementsTab />
        </TabsPanel>
        <TabsPanel value="categories" className="pt-4">
          <CategoriesTab />
        </TabsPanel>
      </Tabs>
    </PageBody>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string | null; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {value === null ? <Skeleton className="mt-2 h-7 w-20" /> : <div className={cn("mt-1.5 text-2xl font-semibold tracking-tight", tone === "warn" && "text-warning-foreground")}>{value}</div>}
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ProductsTab() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [kind, setKind] = useState<ProductKind | "ALL">("ALL");
  const [stock, setStock] = useState<StockFilter>("all");
  const [active, setActive] = useState<"true" | "false" | "all">("true");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dq = useDebounce(q.trim(), 250);

  const filters = { q: dq || undefined, categoryId: categoryId === "ALL" ? undefined : categoryId, kind: kind === "ALL" ? undefined : kind, stock, active };
  const query = useQuery({
    queryKey: ["products", filters, page],
    queryFn: () => api.page<Product>("/products", { ...filters, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.data ?? [];

  const toggleActive = useMutation({
    mutationFn: (p: Product) => api.patch(`/products/${p.id}`, { active: !p.active }),
    onSuccess: (_d, p) => {
      for (const k of [["products"], ["inventory-summary"], ["pos-products"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(`${p.name} ${p.active ? "deactivated" : "activated"}`);
    },
    onError: (e) => toast.error(e),
  });
  const duplicate = useMutation({
    mutationFn: (p: Product) => api.post<Product>(`/products/${p.id}/duplicate`),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Created ${p.sku}`);
      setEditing(p);
      setFormOpen(true);
    },
    onError: (e) => toast.error(e),
  });
  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("The file has no rows");
      return api.post<{ created: number; updated: number; errors: Array<{ row: number; sku?: string; message: string }> }>("/products/import", { rows });
    },
    onSuccess: (r) => {
      for (const k of [["products"], ["inventory-summary"], ["pos-products"]]) qc.invalidateQueries({ queryKey: k });
      if (r.errors.length) toast.warning(`Imported ${r.created} new, ${r.updated} updated. ${r.errors.length} rows skipped`, r.errors.slice(0, 3).map((e) => `Row ${e.row}: ${e.message}`).join("\n"));
      else toast.success(`Imported ${r.created} new, ${r.updated} updated`);
    },
    onError: (e) => toast.error(e),
  });

  async function exportCsv() {
    const all: Product[] = [];
    for (let p = 1; p <= 20; p++) {
      const r = await api.page<Product, PageMeta>("/products", { ...filters, page: p, pageSize: 100 });
      all.push(...r.data);
      if (p >= r.meta.pageCount) break;
    }
    const flat = all.map((p) => ({
      sku: p.sku,
      name: p.name,
      kind: p.kind,
      category: p.category?.slug ?? "",
      unit: p.unit,
      mrp: p.mrp ?? "",
      sellingPrice: p.sellingPrice,
      costPrice: p.costPrice ?? "",
      taxRate: p.taxRate,
      stock: p.stockQuantity,
      ...Object.fromEntries(Object.entries(p.attributes ?? {}).map(([k, v]) => [k, v === null ? "" : String(v)])),
    }));
    const cols = ["sku", "name", "kind", "category", "unit", "mrp", "sellingPrice", "costPrice", "taxRate", "stock", "localName", "scientificName", "bagSize", "height", "series", "potSize", "dimensions", "material", "color", "packOf"];
    downloadCsv(`organo-products-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(flat, cols));
    toast.success(`Exported ${all.length} products`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Name, SKU, local or scientific name" aria-label="Search products" />
        </InputGroup>
        <Select value={categoryId} onValueChange={(v) => (setCategoryId(v as string), setPage(1))}>
          <SelectTrigger className="w-44" aria-label="Category">
            <SelectValue>{(v: string) => (v === "ALL" ? "All categories" : (categories?.find((c) => c.id === v)?.name ?? ""))}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="ALL">All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select value={kind} onValueChange={(v) => (setKind(v as ProductKind | "ALL"), setPage(1))}>
          <SelectTrigger className="w-36" aria-label="Type">
            <SelectValue>{(v: string) => (v === "ALL" ? "All types" : PRODUCT_KIND_LABEL[v as ProductKind])}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="ALL">All types</SelectItem>
            {PRODUCT_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {PRODUCT_KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select value={stock} onValueChange={(v) => (setStock(v as StockFilter), setPage(1))}>
          <SelectTrigger className="w-36" aria-label="Stock level">
            <SelectValue>{(v: string) => ({ all: "Any stock", low: "Low stock", out: "Out of stock" })[v as StockFilter]}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">Any stock</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectPopup>
        </Select>
        <Select value={active} onValueChange={(v) => (setActive(v as "true" | "false" | "all"), setPage(1))}>
          <SelectTrigger className="w-32" aria-label="Status">
            <SelectValue>{(v: string) => ({ true: "Active", false: "Inactive", all: "All" })[v as "true"]}</SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectPopup>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importCsv.mutate(f);
              e.target.value = "";
            }}
          />
          <Menu>
            <MenuTrigger render={<Button variant="outline" />}>
              <SlidersHorizontal /> CSV
            </MenuTrigger>
            <MenuPopup align="end" className="w-56">
              <MenuItem onClick={exportCsv}>
                <Download /> Export products
              </MenuItem>
              <MenuItem onClick={() => fileRef.current?.click()}>
                <Upload /> Import products
              </MenuItem>
              <MenuSeparator />
              <p className="px-2 py-1 text-xs text-muted-foreground">Import matches by SKU. Use the export as a template.</p>
            </MenuPopup>
          </Menu>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Product
          </Button>
        </div>
      </div>

      <div className="mt-4">
        {query.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : rows.length === 0 ? (
          <Empty className="rounded-xl border py-14">
            <EmptyHeader>
              <EmptyTitle>No products match</EmptyTitle>
              <EmptyDescription>Change the filters or add a product.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className={cn("overflow-hidden rounded-xl border transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden lg:table-cell">Category</TableHead>
                  <TableHead className="hidden text-right md:table-cell">MRP</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Cost</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const st = dec(p.stockQuantity);
                  const low = p.lowStockThreshold && st.lte(p.lowStockThreshold);
                  return (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/inventory/${p.id}`)}>
                      <TableCell className="max-w-72">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{p.sku}</div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{p.category?.name ?? PRODUCT_KIND_LABEL[p.kind]}</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular md:table-cell">{p.mrp ? formatINR(p.mrp) : "-"}</TableCell>
                      <TableCell className="text-right font-medium tabular">
                        {p.attributes?.priceOnRequest === true && dec(p.sellingPrice).isZero() ? <span className="text-xs font-normal text-warning-foreground">On request</span> : formatINR(p.sellingPrice)}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular xl:table-cell">{p.costPrice ? formatINR(p.costPrice) : "-"}</TableCell>
                      <TableCell className="text-right tabular">
                        {p.trackStock ? (
                          <span className={cn(st.lte(0) ? "text-muted-foreground" : low ? "font-medium text-warning-foreground" : "")}>
                            {formatQty(st)} <span className="text-xs text-muted-foreground">{p.unit}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not tracked</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {!p.active ? (
                          <Badge variant="secondary" size="sm">
                            Inactive
                          </Badge>
                        ) : p.trackStock && st.lte(0) ? (
                          <Badge variant="outline" size="sm">
                            Out of stock
                          </Badge>
                        ) : low ? (
                          <Badge variant="warning" size="sm">
                            Low
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Menu>
                          <MenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${p.name}`} />}>
                            <MoreHorizontal />
                          </MenuTrigger>
                          <MenuPopup align="end" className="w-48">
                            <MenuItem
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                            >
                              <PencilLine /> Edit
                            </MenuItem>
                            <MenuItem disabled={!p.trackStock} onClick={() => setAdjusting(p)}>
                              <PackagePlus /> Adjust stock
                            </MenuItem>
                            <MenuItem onClick={() => duplicate.mutate(p)}>
                              <Copy /> Duplicate
                            </MenuItem>
                            <MenuItem render={<Link href={`/inventory/${p.id}`} />}>
                              <History /> View history
                            </MenuItem>
                            <MenuSeparator />
                            <MenuItem onClick={() => toggleActive.mutate(p)}>
                              <Power /> {p.active ? "Deactivate" : "Activate"}
                            </MenuItem>
                          </MenuPopup>
                        </Menu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-3">
          <PaginationBar meta={query.data?.meta} onPage={setPage} />
        </div>
      </div>
      <ProductFormSheet open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <AdjustStockDialog product={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}

function MovementsTab() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 250);
  const query = useQuery({
    queryKey: ["movements", dq, page],
    queryFn: () => api.page<Movement>("/inventory/movements", { q: dq || undefined, page, pageSize: 50 }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.data ?? [];
  return (
    <>
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} placeholder="Product name" aria-label="Search movements" />
      </InputGroup>
      <div className="mt-4">
        {query.isLoading ? (
          <Skeleton className="h-64" />
        ) : rows.length === 0 ? (
          <Empty className="rounded-xl border py-14">
            <EmptyHeader>
              <EmptyTitle>No stock movements yet</EmptyTitle>
              <EmptyDescription>Purchases, adjustments and invoice sales appear here, so every change is traceable.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MovementTable rows={rows} showProduct />
        )}
        <div className="mt-3">
          <PaginationBar meta={query.data?.meta} onPage={setPage} />
        </div>
      </div>
    </>
  );
}

export function MovementTable({ rows, showProduct }: { rows: Movement[]; showProduct?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            {showProduct && <TableHead>Product</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="hidden md:table-cell">Reason</TableHead>
            <TableHead className="hidden lg:table-cell">By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => {
            const q = dec(m.quantity);
            return (
              <TableRow key={m.id}>
                <TableCell className="text-muted-foreground tabular">{fmtDateTime(m.createdAt)}</TableCell>
                {showProduct && (
                  <TableCell className="max-w-56">
                    <Link className="block truncate hover:underline" href={`/inventory/${m.productId}`}>
                      {m.product?.name}
                    </Link>
                  </TableCell>
                )}
                <TableCell>{MOVEMENT_TYPE_LABEL[m.type]}</TableCell>
                <TableCell className={cn("text-right font-medium tabular", q.gt(0) ? "text-success-foreground" : "text-destructive-foreground")}>
                  {q.gt(0) ? "+" : ""}
                  {formatQty(q)}
                </TableCell>
                <TableCell className="text-right tabular">{formatQty(m.balanceAfter)}</TableCell>
                <TableCell className="hidden max-w-64 truncate text-muted-foreground md:table-cell">
                  {m.document ? (
                    <Link className="tabular hover:underline" href={`/invoices/${m.document.id}`}>
                      {m.reason ?? m.document.number}
                    </Link>
                  ) : (
                    (m.reason ?? "-")
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{m.user?.name ?? "System"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const { data: categories, isLoading } = useCategories();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProductKind>("PLANT");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  };
  const create = useMutation({
    mutationFn: () => api.post("/categories", { name, kind }),
    onSuccess: () => {
      invalidate();
      toast.success(`Category "${name}" added`);
      setName("");
    },
    onError: (e) => toast.error(e),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; active?: boolean }) => api.patch(`/categories/${id}`, body),
    onSuccess: () => {
      invalidate();
      setRenaming(null);
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (c: Category) => api.del(`/categories/${c.id}`),
    onSuccess: () => {
      invalidate();
      toast.success("Category deleted");
    },
    onError: (e) => toast.error(e),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <SectionCard title="Categories" description="Shown as filters in the POS catalog">
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <ul className="divide-y">
            {categories?.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                {renaming?.id === c.id ? (
                  <Input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && renaming.name.trim()) update.mutate({ id: c.id, name: renaming.name.trim() });
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onBlur={() => renaming.name.trim() && renaming.name !== c.name ? update.mutate({ id: c.id, name: renaming.name.trim() }) : setRenaming(null)}
                    className="max-w-64"
                    size="sm"
                  />
                ) : (
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-medium", !c.active && "text-muted-foreground line-through")}>{c.name}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{PRODUCT_KIND_LABEL[c.kind]}</span>
                <span className="w-20 text-right text-xs text-muted-foreground tabular">{c.productCount} products</span>
                <Menu>
                  <MenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label={`Actions for ${c.name}`} />}>
                    <MoreHorizontal />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem onClick={() => setRenaming({ id: c.id, name: c.name })}>
                      <PencilLine /> Rename
                    </MenuItem>
                    <MenuItem onClick={() => update.mutate({ id: c.id, active: !c.active })}>
                      <Eye /> {c.active ? "Hide from POS" : "Show in POS"}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem variant="destructive" disabled={c.productCount > 0} onClick={() => remove.mutate(c)}>
                      <Trash2 /> Delete {c.productCount > 0 ? "(has products)" : ""}
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Add category">
        <div className="grid gap-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Succulents" aria-label="Category name" />
          <Select value={kind} onValueChange={(v) => setKind(v as ProductKind)}>
            <SelectTrigger aria-label="Category type">
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
          <Button disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
            Add category
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
