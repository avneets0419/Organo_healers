"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { dec, formatQty, MANUAL_MOVEMENT_TYPES, MOVEMENT_TYPE_LABEL, type MovementType } from "@organo/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";
import type { Product } from "@/lib/types";

const HELP: Record<string, string> = {
  PURCHASE: "Stock received from a supplier. Adds to stock.",
  RETURN: "Customer returned items. Adds to stock.",
  DAMAGE: "Plants lost, pots broken. Removes from stock.",
  ADJUSTMENT: "Use + to add or - to remove, e.g. after a stock count.",
  MANUAL_CORRECTION: "Fix a data-entry mistake. Use + or -.",
};

type StockProduct = Pick<Product, "id" | "name" | "unit" | "stockQuantity">;

export function AdjustStockDialog({ product, onClose }: { product: StockProduct | null; onClose: () => void }) {
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup className="max-w-md">{product && <AdjustStockForm key={product.id} product={product} onClose={onClose} />}</DialogPopup>
    </Dialog>
  );
}

function AdjustStockForm({ product, onClose }: { product: StockProduct; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<MovementType>("PURCHASE");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const signed = type === "ADJUSTMENT" || type === "MANUAL_CORRECTION";
  const valid = qty !== "" && qty !== "-" && /^-?\d*\.?\d{0,3}$/.test(qty) && !dec(qty).isZero() && (signed || dec(qty).gt(0));
  const delta = valid ? (type === "DAMAGE" ? dec(qty).abs().neg() : dec(qty)) : null;
  const after = delta ? dec(product.stockQuantity).plus(delta) : null;

  const m = useMutation({
    mutationFn: () => api.post("/inventory/movements", { productId: product.id, type, quantity: qty, unitCost: unitCost || null, reason: reason || null }),
    onSuccess: () => {
      for (const k of [["products"], ["product", product.id], ["movements"], ["inventory-summary"], ["pos-products"]]) qc.invalidateQueries({ queryKey: k });
      toast.success(`${product.name}: stock now ${formatQty(after!)} ${product.unit}`);
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product.name}, currently {product ? formatQty(product.stockQuantity) : ""} {product.unit}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-3">
          <ToggleGroup value={[type]} onValueChange={(v: string[]) => v[0] && setType(v[0] as MovementType)} variant="outline" size="sm" className="flex-wrap">
            {MANUAL_MOVEMENT_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t}>
                {MOVEMENT_TYPE_LABEL[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">{HELP[type]}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Quantity
              <Input nativeInput inputMode="decimal" value={qty} onChange={(e) => /^-?\d*\.?\d{0,3}$/.test(e.target.value) && setQty(e.target.value)} autoFocus className="tabular" placeholder={signed ? "+5 or -2" : "10"} />
            </label>
            {type === "PURCHASE" && (
              <label className="grid gap-1.5 text-sm font-medium">
                Unit cost
                <Input nativeInput inputMode="decimal" value={unitCost} onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setUnitCost(e.target.value)} className="tabular" />
              </label>
            )}
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Reason
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Supplier bill no., count date, what happened" />
          </label>
          {after && (
            <p className="text-sm">
              New stock: <span className="font-semibold tabular">{formatQty(after)}</span> {product.unit}
              {after.lt(0) && <span className="ml-2 text-xs text-warning-foreground">Below zero</span>}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button disabled={!valid} loading={m.isPending} onClick={() => m.mutate()}>
            Record {MOVEMENT_TYPE_LABEL[type].toLowerCase()}
          </Button>
        </DialogFooter>
    </>
  );
}
