"use client";

import { FileCheck2, FileClock, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { titleForPath } from "./nav";
import { useCommandMenu } from "./command-menu";

export function AppHeader({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const { setOpen } = useCommandMenu();

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <h1 className="truncate text-sm font-medium">{children ?? titleForPath(pathname)}</h1>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" className="w-9 justify-start gap-2 overflow-hidden text-muted-foreground sm:w-56" onClick={() => setOpen(true)}>
          <Search className="size-4" />
          <span className="hidden min-w-0 flex-1 truncate text-left sm:inline">Search</span>
          <KbdGroup className="hidden sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
        <Menu>
          <MenuTrigger render={<Button size="sm" />}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">New</span>
          </MenuTrigger>
          <MenuPopup align="end" className="w-52">
            <MenuItem render={<Link href="/pos?type=PROFORMA" />}>
              <FileClock /> Proforma <MenuShortcut>P</MenuShortcut>
            </MenuItem>
            <MenuItem render={<Link href="/pos?type=INVOICE" />}>
              <FileCheck2 /> Invoice <MenuShortcut>N</MenuShortcut>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </header>
  );
}
