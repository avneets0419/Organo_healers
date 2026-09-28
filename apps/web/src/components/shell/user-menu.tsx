"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, LogOut, Moon, Settings, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenu() {
  const { data: me, isLoading } = useMe();
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();

  async function signOut() {
    await api.post("/auth/logout").catch(() => undefined);
    qc.clear();
    router.replace("/login");
  }

  if (isLoading || !me) {
    return (
      <div className="flex items-center gap-2 p-1">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-24 group-data-[collapsible=icon]:hidden" />
      </div>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}>
            <Avatar className="size-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-brand-soft text-xs font-semibold text-primary">{initials(me.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{me.name}</span>
              <span className="truncate text-xs text-muted-foreground">{me.role}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 opacity-60" />
          </MenuTrigger>
          <MenuPopup side="top" align="start" className="w-56">
            <MenuGroup>
              <MenuGroupLabel className="truncate">{me.email}</MenuGroupLabel>
              <MenuItem onClick={() => router.push("/settings")}>
                <Settings /> Settings
              </MenuItem>
              <MenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
                {resolvedTheme === "dark" ? <Sun /> : <Moon />}
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem onClick={signOut}>
              <LogOut /> Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
