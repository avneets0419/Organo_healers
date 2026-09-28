import { cookies } from "next/headers";
import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { CommandMenuProvider } from "@/components/shell/command-menu";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const defaultOpen = store.get("sidebar_state")?.value !== "false";
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <CommandMenuProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <AppHeader />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </SidebarInset>
      </CommandMenuProvider>
    </SidebarProvider>
  );
}
