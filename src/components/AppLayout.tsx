import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ImpersonationBar } from "@/components/qa/ImpersonationBar";
import { useTranslation } from "@/i18n/useTranslation";

export function AppLayout({ children }: { children: ReactNode }) {
  const { dir } = useTranslation();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" dir={dir}>
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <ImpersonationBar />
          <header className="sticky top-0 z-40 h-12 flex items-center border-b bg-background px-4 md:hidden">
            <SidebarTrigger />
            <span className="ms-3 font-semibold text-primary">WardWise</span>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
