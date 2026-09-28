"use client";

import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, FileText, Package, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, Fragment, useContext, useMemo, useState, type ReactNode } from "react";
import { formatINR, formatPhone } from "@organo/shared";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/use-debounce";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { api } from "@/lib/api";
import { NAV } from "./nav";

interface SearchResults {
  customers: Array<{ id: string; name: string; phone: string | null; email: string | null }>;
  documents: Array<{ id: string; number: string; type: "PROFORMA" | "INVOICE"; customerName: string; grandTotal: string }>;
  products: Array<{ id: string; name: string; sku: string; sellingPrice: string }>;
}

interface Entry {
  value: string;
  label: string;
  hint?: string;
  href: string;
  icon: ReactNode;
}
interface Group {
  value: string;
  items: Entry[];
}

const Ctx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });
export const useCommandMenu = () => useContext(Ctx);

export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useHotkeys([
    { combo: "mod+k", handler: () => setOpen((o) => !o) },
    { combo: "n", handler: () => router.push("/pos?type=INVOICE") },
    { combo: "p", handler: () => router.push("/pos?type=PROFORMA") },
  ]);

  return (
    <Ctx.Provider value={{ open, setOpen }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup>{open && <CommandBody onNavigate={(href) => { setOpen(false); router.push(href); }} />}</CommandDialogPopup>
      </CommandDialog>
    </Ctx.Provider>
  );
}

function CommandBody({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounce(q.trim(), 180);
  const { data, isFetching } = useQuery({
    queryKey: ["search", dq],
    queryFn: () => api.get<SearchResults>("/search", { q: dq }),
    enabled: dq.length >= 2,
    placeholderData: (prev) => prev,
  });

  const groups: Group[] = useMemo(() => {
    const nav: Group = {
      value: "Go to",
      items: NAV.flatMap((s) => s.items)
        .filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()))
        .map((i) => ({ value: `nav:${i.href}`, label: i.label, href: i.href, icon: <i.icon /> })),
    };
    if (dq.length < 2 || !data) return nav.items.length ? [nav] : [];
    const out: Group[] = [];
    if (data.customers.length)
      out.push({
        value: "Customers",
        items: data.customers.map((c) => ({
          value: `c:${c.id}`,
          label: c.name,
          hint: c.phone ? formatPhone(c.phone) : (c.email ?? undefined),
          href: `/customers/${c.id}`,
          icon: <User />,
        })),
      });
    if (data.documents.length)
      out.push({
        value: "Invoices & proformas",
        items: data.documents.map((d) => ({
          value: `d:${d.id}`,
          label: `${d.number}  ${d.customerName}`,
          hint: formatINR(d.grandTotal),
          href: `/${d.type === "INVOICE" ? "invoices" : "proformas"}/${d.id}`,
          icon: <FileText />,
        })),
      });
    if (data.products.length)
      out.push({
        value: "Products",
        items: data.products.map((p) => ({
          value: `p:${p.id}`,
          label: p.name,
          hint: `${p.sku}  ${formatINR(p.sellingPrice)}`,
          href: `/inventory/${p.id}`,
          icon: <Package />,
        })),
      });
    if (nav.items.length) out.push(nav);
    return out;
  }, [data, dq, q]);

  return (
    <Command items={groups} filter={null} value={q} onValueChange={(v: string) => setQ(v)}>
      <CommandInput placeholder="Search customers, invoices, products" />
      <CommandPanel>
        <CommandEmpty>{dq.length < 2 ? "Type at least 2 characters" : isFetching ? "Searching" : "No matches"}</CommandEmpty>
        <CommandList>
          {(group: Group) => (
            <Fragment key={group.value}>
              <CommandGroup items={group.items}>
                <CommandGroupLabel>{group.value}</CommandGroupLabel>
                <CommandCollection>
                  {(item: Entry) => (
                    <CommandItem key={item.value} value={item.value} onClick={() => onNavigate(item.href)} className="gap-2.5">
                      <span className="grid size-4 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4 [&_svg]:stroke-[1.5]">{item.icon}</span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.hint && <CommandShortcut className="tabular">{item.hint}</CommandShortcut>}
                    </CommandItem>
                  )}
                </CommandCollection>
              </CommandGroup>
            </Fragment>
          )}
        </CommandList>
      </CommandPanel>
      <CommandFooter>
        <div className="flex items-center gap-2">
          <Kbd>
            <CornerDownLeft />
          </Kbd>
          <span>Open</span>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <Spinner className="size-3.5" />}
          <Kbd>Esc</Kbd>
          <span>Close</span>
        </div>
      </CommandFooter>
    </Command>
  );
}
