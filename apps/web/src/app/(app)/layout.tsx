import { AppHeader } from "@/components/shell/app-header";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppSidebarProvider } from "@/components/shell/app-sidebar-provider";
import { CommandMenuProvider } from "@/components/shell/command-menu";
import { SidebarInset } from "@/components/ui/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppSidebarProvider>
      <CommandMenuProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <AppHeader />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </SidebarInset>
      </CommandMenuProvider>
    </AppSidebarProvider>
  );
}
