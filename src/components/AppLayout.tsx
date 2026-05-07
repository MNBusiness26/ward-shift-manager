import { ReactNode, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ImpersonationBar } from "@/components/qa/ImpersonationBar";
import { useTranslation } from "@/i18n/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

export function AppLayout({ children }: { children: ReactNode }) {
  const { dir, t } = useTranslation();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) return;
    if (sessionStorage.getItem("wardwise-install-tip-shown")) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;
    const timer = setTimeout(() => {
      toast(t("pwa.installTip") || "Tip: Add WardWise to your home screen for an app-like experience.", {
        duration: 8000,
      });
      sessionStorage.setItem("wardwise-install-tip-shown", "1");
    }, 2500);
    return () => clearTimeout(timer);
  }, [isMobile, t]);

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
