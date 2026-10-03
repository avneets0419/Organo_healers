"use client";

import { dec, formatINR, type CalcResult } from "@organo/shared";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePos } from "./pos-store";

export function TotalsPanel({ calc, savings }: { calc: CalcResult; savings: string }) {
  const discountType = usePos((s) => s.discountType);
  const discountValue = usePos((s) => s.discountValue);
  const set = usePos((s) => s.set);
  const t = calc.totals;

  return (
    <div className="grid gap-1.5 text-sm">
      <Row label="Subtotal" value={formatINR(t.subtotal)} />
      {dec(t.itemDiscountTotal).gt(0) && <Row label="Item discounts" value={`-${formatINR(t.itemDiscountTotal)}`} muted />}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          Discount
          <Select
            value={discountType ?? "NONE"}
            onValueChange={(v) => set({ discountType: v === "NONE" ? null : (v as "PERCENT" | "AMOUNT"), discountValue: v === "NONE" ? "" : discountValue })}
          >
            <SelectTrigger size="sm" className="h-6 w-[5.5rem] min-w-0 text-xs" aria-label="Discount type">
              <SelectValue>{(v: string) => (v === "PERCENT" ? "%" : v === "AMOUNT" ? "₹" : "None")}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="NONE">None</SelectItem>
              <SelectItem value="PERCENT">Percent</SelectItem>
              <SelectItem value="AMOUNT">Amount</SelectItem>
            </SelectPopup>
          </Select>
          {discountType && (
            <Input
              size="sm"
              nativeInput
              inputMode="decimal"
              value={discountValue}
              onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && set({ discountValue: e.target.value })}
              className="w-20 tabular"
              aria-label="Discount value"
            />
          )}
        </div>
        <span className="tabular text-muted-foreground">{dec(t.discountTotal).gt(0) ? `-${formatINR(t.discountTotal)}` : formatINR(0)}</span>
      </div>
      {dec(t.taxTotal).gt(0) && <Row label="GST" value={formatINR(t.taxTotal)} muted />}
      {!dec(t.roundOff).isZero() && <Row label="Round off" value={`${dec(t.roundOff).gt(0) ? "+" : "-"}${formatINR(dec(t.roundOff).abs(), { alwaysPaise: true })}`} muted />}
      <div className="mt-1 flex items-baseline justify-between border-t pt-2">
        <span className="font-medium">Grand total</span>
        <span className="text-xl font-semibold tracking-tight tabular">{formatINR(t.grandTotal)}</span>
      </div>
      {dec(savings).gt(0) && <p className="text-right text-xs text-success-foreground tabular">Customer saves {formatINR(savings)} on MRP</p>}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "tabular text-muted-foreground" : "tabular"}>{value}</span>
    </div>
  );
}
