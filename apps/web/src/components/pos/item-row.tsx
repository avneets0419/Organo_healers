"use client";

import { ChevronDown, Copy, FolderInput, GripVertical, Minus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { calculateItem, dec, formatINR, formatQty } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuSub, MenuSubPopup, MenuSubTrigger, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { usePos, type DraftItem } from "./pos-store";

const DECIMAL = /^\d*\.?\d{0,3}$/;
const MONEY = /^\d*\.?\d{0,2}$/;

/** Text input that only accepts a (possibly partial) decimal. */
function NumInput({
  value,
  onChange,
  allow = MONEY,
  className,
  invalid,
  ...rest
}: { value: string; onChange: (v: string) => void; allow?: RegExp; invalid?: boolean } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  return (
    <Input
      {...rest}
      nativeInput
      inputMode="decimal"
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const v = e.target.value.replace(/,/g, "");
        if (v === "" || allow.test(v)) onChange(v);
      }}
      onFocus={(e) => e.currentTarget.select()}
      className={cn("tabular", className)}
    />
  );
}

export interface GroupOption {
  key: string;
  label: string;
}

export const ItemRow = memo(function ItemRow({
  item,
  index,
  groupKey,
  groupOptions,
  pricesIncludeTax,
  onDragStart,
  onDropBefore,
}: {
  item: DraftItem;
  index: number;
  groupKey: string;
  groupOptions: GroupOption[];
  pricesIncludeTax: boolean;
  onDragStart: (itemKey: string) => void;
  onDropBefore: (index: number) => void;
}) {
  const update = usePos((s) => s.updateItem);
  const remove = usePos((s) => s.removeItem);
  const moveItem = usePos((s) => s.moveItem);
  const addCustom = usePos((s) => s.addCustomItem);
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const calc = calculateItem(
    { quantity: item.quantity || "0", rate: item.rate || "0", discountType: item.discountType, discountValue: item.discountValue, taxRate: item.taxRate || "0" },
    pricesIncludeTax,
  );
  const qtyInvalid = !item.quantity || dec(item.quantity).lte(0);
  const rateMissing = dec(item.rate || "0").isZero();
  const outOfStock = item.trackStock && item.stock !== undefined && item.stock !== null && dec(item.stock).lt(item.quantity || "0");
  const set = (patch: Partial<DraftItem>) => update(item.key, patch);
  const setAttr = (k: string, v: string) => set({ attributes: { ...item.attributes, [k]: v } });

  const bump = (delta: number) => {
    const next = dec(item.quantity || "0").plus(delta);
    set({ quantity: next.lte(0) ? "1" : next.toString() });
  };

  return (
    <div
      className={cn("group/item relative rounded-lg transition-colors", dragOver && "before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-primary")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-oh-item")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        onDropBefore(index);
      }}
    >
      <div className="grid grid-cols-[16px_minmax(0,1fr)_auto_28px] items-center gap-x-2 gap-y-1 px-1.5 py-1.5 @xl:grid-cols-[16px_minmax(0,1fr)_118px_96px_92px_28px]">
        <button
          type="button"
          draggable
          aria-label="Drag to reorder"
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-oh-item", item.key);
            e.dataTransfer.effectAllowed = "move";
            onDragStart(item.key);
          }}
          className="flex h-7 cursor-grab items-center justify-center text-muted-foreground/60 opacity-60 group-hover/item:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        <div className="min-w-0">
          <input
            value={item.name}
            onChange={(e) => set({ name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
            }}
            placeholder="Item name"
            aria-label="Item name"
            className="w-full truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none hover:bg-accent/60 focus:bg-background focus:ring-2 focus:ring-ring/30"
          />
          <div className="flex flex-wrap items-center gap-x-2 px-1 text-xs text-muted-foreground">
            {item.sku && <span className="tabular">{item.sku}</span>}
            {item.attributes.bagSize && <span>Bag {item.attributes.bagSize}</span>}
            {item.attributes.height && <span>{item.attributes.height}</span>}
            {item.mrp && dec(item.mrp).gt(item.rate || "0") && <span className="line-through tabular">MRP {formatINR(item.mrp)}</span>}
            {dec(calc.discountAmount).gt(0) && <span className="text-success-foreground tabular">-{formatINR(calc.discountAmount)}</span>}
            {dec(item.taxRate || "0").gt(0) && <span className="tabular">GST {formatQty(item.taxRate)}%</span>}
            {outOfStock && <span className="text-warning-foreground">{dec(item.stock!).lte(0) ? "Not in stock" : `Only ${formatQty(item.stock!)} in stock`}</span>}
            {rateMissing && <span className="text-warning-foreground">Set a rate</span>}
          </div>
        </div>

        <div className="col-span-3 col-start-2 row-start-2 flex items-center gap-2 @xl:contents">
          <div className="flex items-center">
            <Button size="icon-xs" variant="ghost" aria-label="Decrease quantity" onClick={() => bump(-1)}>
              <Minus />
            </Button>
            <NumInput
              size="sm"
              value={item.quantity}
              onChange={(v) => set({ quantity: v })}
              allow={DECIMAL}
              invalid={qtyInvalid}
              aria-label="Quantity"
              className="w-14 text-center [&_input]:text-center"
            />
            <Button size="icon-xs" variant="ghost" aria-label="Increase quantity" onClick={() => bump(1)}>
              <Plus />
            </Button>
          </div>
          <div className="flex items-center gap-1.5 @xl:block">
            <span className="text-xs text-muted-foreground @xl:hidden">Rate</span>
            <NumInput size="sm" value={item.rate} onChange={(v) => set({ rate: v })} aria-label="Rate" invalid={rateMissing} className="w-24 @xl:w-full [&_input]:text-right" />
          </div>
        </div>

        <div className="text-right text-sm font-semibold tabular">{formatINR(calc.total)}</div>

        <Menu>
          <MenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="Item actions" />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuPopup align="end" className="w-52">
            <MenuItem onClick={() => setOpen((o) => !o)}>
              <ChevronDown /> {open ? "Hide details" : "Details, discount, GST"}
            </MenuItem>
            {groupOptions.length > 1 && (
              <MenuSub>
                <MenuSubTrigger>
                  <FolderInput /> Move to group
                </MenuSubTrigger>
                <MenuSubPopup>
                  {groupOptions
                    .filter((g) => g.key !== groupKey)
                    .map((g) => (
                      <MenuItem key={g.key} onClick={() => moveItem(item.key, g.key)}>
                        {g.label}
                      </MenuItem>
                    ))}
                </MenuSubPopup>
              </MenuSub>
            )}
            <MenuItem
              onClick={() => {
                const k = addCustom(groupKey);
                update(k, { ...item, key: k });
              }}
            >
              <Copy /> Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => remove(item.key)}>
              <Trash2 /> Remove
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      {open && (
        <div className="mx-1.5 mb-2 grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-2.5 @xl:grid-cols-6">
          <label className="col-span-2 grid gap-1 text-xs text-muted-foreground @xl:col-span-6">
            Description
            <Textarea value={item.description ?? ""} onChange={(e) => set({ description: e.target.value || null })} rows={2} placeholder="Shown under the item name" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Bag size
            <Input size="sm" value={item.attributes.bagSize ?? ""} onChange={(e) => setAttr("bagSize", e.target.value)} placeholder="18 x 18" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Height
            <Input size="sm" value={item.attributes.height ?? ""} onChange={(e) => setAttr("height", e.target.value)} placeholder="7-8 ft" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            MRP
            <NumInput size="sm" value={item.mrp ?? ""} onChange={(v) => set({ mrp: v || null })} />
          </label>
          <div className="grid gap-1 text-xs text-muted-foreground">
            Discount
            <div className="flex gap-1">
              <Select
                value={item.discountType ?? "NONE"}
                onValueChange={(v) => set({ discountType: v === "NONE" ? null : (v as "PERCENT" | "AMOUNT"), discountValue: v === "NONE" ? null : item.discountValue })}
              >
                <SelectTrigger size="sm" className="w-16 min-w-0" aria-label="Discount type">
                  <SelectValue>{(v: string) => (v === "PERCENT" ? "%" : v === "AMOUNT" ? "₹" : "None")}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="PERCENT">%</SelectItem>
                  <SelectItem value="AMOUNT">₹</SelectItem>
                </SelectPopup>
              </Select>
              <NumInput size="sm" disabled={!item.discountType} value={item.discountValue ?? ""} onChange={(v) => set({ discountValue: v || null })} aria-label="Discount value" />
            </div>
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">
            GST %
            <NumInput size="sm" value={item.taxRate} onChange={(v) => set({ taxRate: v })} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Unit
            <Input size="sm" value={item.unit ?? ""} onChange={(e) => set({ unit: e.target.value || null })} placeholder="pc" />
          </label>
        </div>
      )}
    </div>
  );
});
