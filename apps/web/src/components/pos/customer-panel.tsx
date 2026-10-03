"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Mail, Phone, UserRound, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CUSTOMER_STATUS_LABEL, formatPhone, isValidIndianMobile, type CustomerStatus } from "@organo/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/api";
import type { CustomerLite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { usePos } from "./pos-store";

type Field = "name" | "phone" | "email";

function lookupTerm(field: Field | null, value: string): string | null {
  const v = value.trim();
  if (!field || !v) return null;
  if (field === "phone") return v.replace(/\D/g, "").length >= 4 ? v : null;
  if (field === "email") return v.length >= 3 ? v : null;
  return v.length >= 2 ? v : null;
}

export function CustomerPanel() {
  const customer = usePos((s) => s.customer);
  const setCustomer = usePos((s) => s.setCustomer);
  const selectCustomer = usePos((s) => s.selectCustomer);
  const clearCustomer = usePos((s) => s.clearCustomer);
  const locked = usePos((s) => !!s.documentId);

  const [focus, setFocus] = useState<Field | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const term = useDebounce(customer.id ? null : lookupTerm(focus, focus ? customer[focus] : ""), 180);
  const { data: matches = [], isFetching } = useQuery({
    queryKey: ["customer-lookup", term],
    queryFn: () => api.get<CustomerLite[]>("/customers/lookup", { q: term! }),
    enabled: !!term,
    placeholderData: (p) => p,
  });
  const open = !customer.id && !dismissed && !!term && focus !== null;

  const phoneError = useMemo(() => {
    const digits = customer.phone.replace(/\D/g, "");
    if (!customer.phone || focus === "phone") return null;
    return digits.length >= 10 && !isValidIndianMobile(customer.phone) ? "Not a valid Indian mobile number" : digits.length < 10 ? "Enter 10 digits" : null;
  }, [customer.phone, focus]);
  const emailError = customer.email && focus !== "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ? "Check this email" : null;

  function pick(c: CustomerLite) {
    selectCustomer(c);
    setFocus(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[highlight] ?? matches[0]!);
    } else if (e.key === "Escape") {
      setDismissed(true);
    }
  }

  const fieldProps = (f: Field) => ({
    value: customer[f],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setCustomer({ [f]: e.target.value });
      setHighlight(0);
      setDismissed(false);
    },
    onFocus: () => {
      clearTimeout(blurTimer.current);
      setFocus(f);
    },
    onBlur: () => {
      blurTimer.current = setTimeout(() => setFocus(null), 150);
    },
    onKeyDown,
  });

  const edited =
    customer.id &&
    customer.original &&
    (customer.original.name !== customer.name || customer.original.phone !== customer.phone || customer.original.email !== customer.email);

  return (
    <section aria-label="Customer" className="relative">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Customer</h2>
        {customer.id ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="success" size="sm">
              <Check /> Existing
            </Badge>
            {customer.status && (
              <Badge variant="outline" size="sm">
                {CUSTOMER_STATUS_LABEL[customer.status as CustomerStatus]}
              </Badge>
            )}
            {!locked && (
              <Button size="icon-xs" variant="ghost" aria-label="Clear customer" onClick={clearCustomer}>
                <X />
              </Button>
            )}
          </div>
        ) : (
          customer.name && <Badge variant="info" size="sm">New customer</Badge>
        )}
      </div>

      <div className="grid gap-2">
        <InputGroup>
          <InputGroupAddon>
            <UserRound />
          </InputGroupAddon>
          <InputGroupInput aria-label="Customer name" placeholder="Customer or company name" autoComplete="off" {...fieldProps("name")} />
        </InputGroup>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <InputGroup>
              <InputGroupAddon>
                <Phone />
              </InputGroupAddon>
              <InputGroupInput aria-label="Phone" aria-invalid={!!phoneError || undefined} placeholder="Phone" inputMode="tel" autoComplete="off" {...fieldProps("phone")} />
              {isFetching && focus && (
                <InputGroupAddon align="inline-end">
                  <Spinner className="size-3.5" />
                </InputGroupAddon>
              )}
            </InputGroup>
            {phoneError && <p className="mt-1 text-xs text-destructive-foreground">{phoneError}</p>}
          </div>
          <div>
            <InputGroup>
              <InputGroupAddon>
                <Mail />
              </InputGroupAddon>
              <InputGroupInput aria-label="Email" aria-invalid={!!emailError || undefined} placeholder="Email" inputMode="email" autoComplete="off" {...fieldProps("email")} />
            </InputGroup>
            {emailError && <p className="mt-1 text-xs text-destructive-foreground">{emailError}</p>}
          </div>
        </div>
        {edited && <p className="text-xs text-muted-foreground">Changes to this customer&apos;s details are saved to their profile.</p>}
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border bg-popover shadow-lg/5"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-muted-foreground">
              {isFetching ? "Searching" : "No existing customer. A new one will be created when you save."}
            </div>
          ) : (
            <>
              <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">Existing customers</div>
              {matches.map((c, i) => (
                <button
                  key={c.id}
                  role="option"
                  aria-selected={i === highlight}
                  className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm", i === highlight && "bg-accent")}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(c)}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-primary">
                    {c.companyName ? <Building2 className="size-4" /> : <UserRound className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular">
                      {[c.phone ? formatPhone(c.phone) : null, c.email].filter(Boolean).join("  ·  ") || "No contact details"}
                    </span>
                  </span>
                  <Badge variant="outline" size="sm">
                    {CUSTOMER_STATUS_LABEL[c.status]}
                  </Badge>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
