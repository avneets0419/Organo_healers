"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV } from "./nav";
import { UserMenu } from "./user-menu";
import { useSidebarCounts } from "./use-sidebar-counts";

export function AppSidebar() {
  const pathname = usePathname();
  const counts = useSidebarCounts();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-1.5">
        <Link href="/dashboard" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Image
            src="/brand/organo-healers-logo.png"
            alt="Organo Healers Plant Studio"
            width={148}
            height={29}
            priority
            className="h-auto w-[148px] group-data-[collapsible=icon]:hidden dark:brightness-110"
          />
          <Image
            src="/brand/organo-mark.png"
            alt="Organo Healers"
            width={28}
            height={28}
            className="hidden size-7 group-data-[collapsible=icon]:block"
          />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((section, i) => (
          <SidebarGroup key={section.label ?? i} className="py-1">
            {section.label && <SidebarGroupLabel>{section.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const badge = item.href === "/followups" ? counts.followupsDue : undefined;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton isActive={active} tooltip={item.label} render={<Link href={item.href} />}>
                        <item.icon strokeWidth={1.75} />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {!!badge && <SidebarMenuBadge className="tabular">{badge}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
