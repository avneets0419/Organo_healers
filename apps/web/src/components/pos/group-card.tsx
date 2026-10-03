"use client";

import { ArrowDown, ArrowUp, ChevronRight, Copy, MoreHorizontal, NotebookPen, PackagePlus, PencilLine, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatINR } from "@organo/shared";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ItemRow, type GroupOption } from "./item-row";
import { usePos, type DraftGroup } from "./pos-store";

export function GroupCard({
  group,
  index,
  count,
  subtotal,
  groupOptions,
  pricesIncludeTax,
  dragItemKey,
  setDragItemKey,
}: {
  group: DraftGroup;
  index: number;
  count: number;
  subtotal: string;
  groupOptions: GroupOption[];
  pricesIncludeTax: boolean;
  dragItemKey: string | null;
  setDragItemKey: (k: string | null) => void;
}) {
  const active = usePos((s) => s.activeGroupKey === group.key);
  const setActive = usePos((s) => s.setActiveGroup);
  const updateGroup = usePos((s) => s.updateGroup);
  const removeGroup = usePos((s) => s.removeGroup);
  const duplicateGroup = usePos((s) => s.duplicateGroup);
  const moveGroup = usePos((s) => s.moveGroup);
  const moveItem = usePos((s) => s.moveItem);
  const addCustom = usePos((s) => s.addCustomItem);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropping, setDropping] = useState(false);

  const dropAt = (i?: number) => {
    if (dragItemKey) moveItem(dragItemKey, group.key, i);
    setDragItemKey(null);
    setDropping(false);
  };

  return (
    <section
      aria-label={group.name || `Group ${index + 1}`}
      onClick={() => !active && setActive(group.key)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("application/x-oh-item")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dropAt();
      }}
      className={cn(
        "rounded-xl border bg-card transition-[border-color,box-shadow]",
        active ? "border-primary/45 shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_10%,transparent)]" : "hover:border-input",
        dropping && "border-primary border-dashed",
      )}
    >
      <header className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={group.collapsed ? "Expand group" : "Collapse group"}
          aria-expanded={!group.collapsed}
          onClick={(e) => {
            e.stopPropagation();
            updateGroup(group.key, { collapsed: !group.collapsed });
          }}
        >
          <ChevronRight className={cn("transition-transform", !group.collapsed && "rotate-90")} />
        </Button>
        <input
          value={group.name}
          onChange={(e) => updateGroup(group.key, { name: e.target.value })}
          onFocus={() => setActive(group.key)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          }}
          placeholder={index === 0 ? "Group name, e.g. GROUND FLOOR (optional)" : `Group ${index + 1} name`}
          aria-label="Group name"
          className="min-w-0 flex-1 rounded-md bg-transparent px-1.5 py-1 text-[13px] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70 hover:bg-accent/60 focus:bg-background focus:ring-2 focus:ring-ring/30"
        />
        <span className="hidden text-xs text-muted-foreground tabular @md:inline">
          {count} {count === 1 ? "item" : "items"}
        </span>
        <span className="min-w-20 text-right text-sm font-semibold tabular">{formatINR(subtotal)}</span>
        <Menu>
          <MenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="Group actions" />}>
            <MoreHorizontal />
          </MenuTrigger>
          <MenuPopup align="end" className="w-52">
            <MenuItem onClick={() => addCustom(group.key)}>
              <PackagePlus /> Add custom line
            </MenuItem>
            <MenuItem onClick={() => updateGroup(group.key, { notes: group.notes ?? "" })}>
              <NotebookPen /> {group.notes !== null ? "Edit notes" : "Add notes"}
            </MenuItem>
            <MenuItem onClick={() => duplicateGroup(group.key)}>
              <Copy /> Duplicate group
            </MenuItem>
            <MenuSeparator />
            <MenuItem disabled={index === 0} onClick={() => moveGroup(group.key, -1)}>
              <ArrowUp /> Move up
            </MenuItem>
            <MenuItem disabled={index === groupOptions.length - 1} onClick={() => moveGroup(group.key, 1)}>
              <ArrowDown /> Move down
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => (count ? setConfirmDelete(true) : removeGroup(group.key))}>
              <Trash2 /> Delete group
            </MenuItem>
          </MenuPopup>
        </Menu>
      </header>

      {!group.collapsed && (
        <div className="p-1">
          {group.notes !== null && (
            <div className="px-1.5 pt-1 pb-1.5">
              <Textarea
                value={group.notes}
                onChange={(e) => updateGroup(group.key, { notes: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && updateGroup(group.key, { notes: null })}
                rows={2}
                placeholder="Notes for this group, shown under the heading"
                aria-label="Group notes"
              />
            </div>
          )}
          {group.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center">
              <p className="text-sm text-muted-foreground">
                {active ? "Products you add from the catalog land here." : "Empty group. Select it, then add products."}
              </p>
              <Button size="xs" variant="outline" onClick={() => addCustom(group.key)}>
                <PencilLine /> Custom line
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {group.items.map((it, i) => (
                <ItemRow
                  key={it.key}
                  item={it}
                  index={i}
                  groupKey={group.key}
                  groupOptions={groupOptions}
                  pricesIncludeTax={pricesIncludeTax}
                  onDragStart={setDragItemKey}
                  onDropBefore={(idx) => dropAt(idx)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {group.name ? `"${group.name}"` : "this group"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {count} {count === 1 ? "item" : "items"} will be removed from this {usePos.getState().type === "INVOICE" ? "invoice" : "proforma"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                removeGroup(group.key);
                setConfirmDelete(false);
              }}
            >
              Delete group
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
