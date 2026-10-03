"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { CornerDownLeft, PackageSearch, Plus, Search, X } from "lucide-react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { dec, formatINR, formatQty, PRODUCT_KIND_LABEL } from "@organo/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useCategories } from "@/hooks/use-settings";
import { api, type Paged } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-store";

const PAGE = 40;

function metaLine(p: Product): string {
  const a = p.attributes ?? {};
  const bits = [
    typeof a.bagSize === "string" ? `Bag ${a.bagSize}` : null,
    typeof a.height === "string" ? a.height : null,
    typeof a.dimensions === "string" ? a.dimensions : null,
    typeof a.scientificName === "string" ? a.scientificName : null,
  ].filter(Boolean);
  return [p.category?.name ?? PRODUCT_KIND_LABEL[p.kind], ...bits].join("  ·  ");
}

export const ProductSearchInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof InputGroupInput>>(function ProductSearchInput(props, ref) {
  return <InputGroupInput ref={ref} {...props} />;
});

export function ProductCatalog({ searchRef, className }: { searchRef: React.RefObject<HTMLInputElement | null>; className?: string }) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [hl, setHl] = useState({ key: "", index: 0 });
  const dq = useDebounce(q.trim(), 160);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = usePos((s) => s.groups);
  const activeGroupKey = usePos((s) => s.activeGroupKey);
  const setActiveGroup = usePos((s) => s.setActiveGroup);
  const addProduct = usePos((s) => s.addProduct);
  const { data: categories } = useCategories();

  const query = useInfiniteQuery({
    queryKey: ["pos-products", dq, categoryId],
    queryFn: ({ pageParam }) =>
      api.page<Product>("/products", { q: dq || undefined, categoryId: categoryId ?? undefined, active: "true", page: pageParam, pageSize: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last: Paged<Product>) => (last.meta.page < last.meta.pageCount ? last.meta.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });
  const products = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.meta.total ?? 0;

  // The highlight belongs to one result set; a new search or category starts at the top.
  const resultKey = `${dq}|${categoryId ?? ""}`;
  const highlight = hl.key === resultKey ? hl.index : 0;
  const setHighlight = (next: number | ((h: number) => number)) =>
    setHl({ key: resultKey, index: typeof next === "function" ? next(highlight) : next });
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const activeGroup = groups.find((g) => g.key === activeGroupKey) ?? groups[0];
  const groupLabel = (g: (typeof groups)[number], i: number) => g.name.trim() || `Group ${i + 1}`;

  function add(p: Product) {
    const { merged } = addProduct(p);
    const where = activeGroup ? groupLabel(activeGroup, groups.indexOf(activeGroup)) : "";
    if (p.attributes?.priceOnRequest === true || dec(p.sellingPrice).isZero()) {
      toast.warning(`${p.name} added without a price`, "Enter the rate in the invoice editor.");
    } else if (merged) {
      toast.info(`${p.name}: quantity +1`, where);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, products.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = products[highlight];
      if (p) add(p);
    } else if (e.key === "Escape" && q) {
      e.preventDefault();
      setQ("");
    }
  }

  const cats = (categories ?? []).filter((c) => c.active && c.productCount > 0);

  return (
    <section aria-label="Products" className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 pb-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Products</h2>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">Adding to</span>
          <Select value={activeGroupKey} onValueChange={(v) => v && setActiveGroup(v as string)}>
            <SelectTrigger size="sm" className="h-7 max-w-44 min-w-0 text-xs">
              <SelectValue>{() => (activeGroup ? groupLabel(activeGroup, groups.indexOf(activeGroup)) : "")}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {groups.map((g, i) => (
                <SelectItem key={g.key} value={g.key}>
                  {groupLabel(g, i)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      </div>

      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <ProductSearchInput
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search plants, pots, SKU"
          aria-label="Search products"
          autoComplete="off"
          data-hotkeys-ignore
        />
        <InputGroupAddon align="inline-end">
          {q ? (
            <Button size="icon-xs" variant="ghost" aria-label="Clear search" onClick={() => setQ("")}>
              <X />
            </Button>
          ) : (
            <Kbd>/</Kbd>
          )}
        </InputGroupAddon>
      </InputGroup>

      <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]" role="tablist" aria-label="Categories">
        <CategoryChip active={!categoryId} onClick={() => setCategoryId(null)}>
          All
        </CategoryChip>
        {cats.map((c) => (
          <CategoryChip key={c.id} active={categoryId === c.id} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
            {c.name}
            <span className="text-muted-foreground tabular">{c.productCount}</span>
          </CategoryChip>
        ))}
      </div>

      <div ref={listRef} className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2" role="listbox" aria-label="Product results">
        {query.isLoading ? (
          <div className="grid gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : query.isError ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>Couldn&apos;t load products</EmptyTitle>
              <EmptyDescription>Check the connection and try again.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm" variant="outline" onClick={() => query.refetch()}>
              Retry
            </Button>
          </Empty>
        ) : products.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch />
              </EmptyMedia>
              <EmptyTitle>No products match &ldquo;{q}&rdquo;</EmptyTitle>
              <EmptyDescription>Add it as a custom line from the editor, or create it in Inventory.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid gap-1">
            {products.map((p, i) => (
              <ProductRow key={p.id} product={p} index={i} highlighted={i === highlight} onHover={() => setHighlight(i)} onAdd={() => add(p)} />
            ))}
            {query.hasNextPage && (
              <li className="py-2 text-center">
                <Button size="sm" variant="ghost" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                  Show more ({total - products.length} left)
                </Button>
              </li>
            )}
          </ul>
        )}
      </div>
      <div className="hidden items-center gap-3 border-t pt-2 text-xs text-muted-foreground lg:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> select
        </span>
        <span className="flex items-center gap-1">
          <Kbd>
            <CornerDownLeft className="size-3" />
          </Kbd>
          add
        </span>
        <span className="ml-auto tabular">{total} products</span>
      </div>
    </section>
  );
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-primary bg-primary text-primary-foreground [&_span]:text-primary-foreground/75" : "bg-background hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function ProductRow({
  product: p,
  index,
  highlighted,
  onHover,
  onAdd,
}: {
  product: Product;
  index: number;
  highlighted: boolean;
  onHover: () => void;
  onAdd: () => void;
}) {
  const noPrice = p.attributes?.priceOnRequest === true || dec(p.sellingPrice).isZero();
  const stock = dec(p.stockQuantity);
  const low = p.lowStockThreshold && stock.lte(p.lowStockThreshold);
  const hasMrp = p.mrp && dec(p.mrp).gt(p.sellingPrice);
  return (
    <li
      role="option"
      aria-selected={highlighted}
      data-index={index}
      onMouseEnter={onHover}
      onClick={onAdd}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors",
        highlighted ? "border-border bg-accent/70" : "hover:bg-accent/40",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.name}</div>
        <div className="truncate text-xs text-muted-foreground">{metaLine(p)}</div>
      </div>
      <div className="shrink-0 text-right">
        {noPrice ? (
          <Badge variant="warning" size="sm">
            Price on request
          </Badge>
        ) : (
          <>
            <div className="text-sm font-semibold tabular">{formatINR(p.sellingPrice)}</div>
            {hasMrp && <div className="text-xs text-muted-foreground line-through tabular">MRP {formatINR(p.mrp)}</div>}
          </>
        )}
        {p.trackStock && (
          <div className={cn("text-[11px] tabular", low && stock.gt(0) ? "text-warning-foreground" : "text-muted-foreground")}>
            {stock.lte(0) ? "Out of stock" : `${formatQty(stock)} ${p.unit} in stock`}
          </div>
        )}
      </div>
      <Button
        size="icon-sm"
        variant={highlighted ? "default" : "outline"}
        aria-label={`Add ${p.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        <Plus />
      </Button>
    </li>
  );
}
