"use client";

import { useState, useSyncExternalStore } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

// The collapsed state lives in a cookie. Reading it on the client (instead of
// cookies() in the layout) keeps every app route static, so Vercel serves the
// shell from its CDN and <Link> can prefetch whole pages.
const subscribe = () => () => {};
const readCookie = () => !document.cookie.split("; ").includes("sidebar_state=false");

export function AppSidebarProvider({ children }: { children: React.ReactNode }) {
  const fromCookie = useSyncExternalStore(subscribe, readCookie, () => true);
  const [open, setOpen] = useState<boolean | null>(null);
  return (
    <SidebarProvider open={open ?? fromCookie} onOpenChange={setOpen}>
      {children}
    </SidebarProvider>
  );
}
