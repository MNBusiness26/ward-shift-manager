import {
  Calendar,
  CalendarOff,
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Users,
  ClipboardList,
  CalendarDays,
  Settings,
  LogOut,
  ChevronLeft,
  Shield,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslation } from "@/i18n/useTranslation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const ADMIN_EMAIL = "michael.nejman@gmail.com";

export function AppSidebar() {
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isManager, isAssistantManager, profile, signOut } = useAuth();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const nurseItems = [
    { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
    { title: t("nav.myCalendar"), url: "/calendar", icon: Calendar },
    { title: t("nav.teamCalendar"), url: "/team-calendar", icon: Users },
    { title: t("nav.availability"), url: "/availability", icon: CalendarOff },
    { title: t("nav.swapRequests"), url: "/swaps", icon: ArrowLeftRight },
    { title: t("nav.myStats"), url: "/stats", icon: BarChart3 },
  ];

  const managerItems = [
    { title: t("nav.shiftManager"), url: "/roster", icon: ClipboardList },
    { title: t("nav.weeklyOverview"), url: "/management-calendar", icon: CalendarDays },
    { title: t("nav.requests"), url: "/requests", icon: Settings },
    { title: t("nav.staff"), url: "/staff", icon: Users },
    { title: t("nav.analytics"), url: "/analytics", icon: BarChart3 },
  ];

  const handleLinkClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const showManagement = isManager || isAssistantManager;
  const showAdmin = isManager && profile?.email === ADMIN_EMAIL;

  const isActive = (url: string) =>
    url === "/" ? location.pathname === "/" : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-e border-sidebar-border">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-4">
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-primary">
              WardWise
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ms-auto h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={toggleSidebar}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </Button>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">{t("nav.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nurseItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={`text-base md:text-sm rounded-sm transition-colors ${
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        onClick={handleLinkClick}
                      >
                        <item.icon className={`me-2 h-5 w-5 md:h-4 md:w-4 transition-colors ${
                          active ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                        }`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showManagement && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">{t("nav.management")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managerItems.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                         className={`text-base md:text-sm rounded-sm transition-colors ${
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          onClick={handleLinkClick}
                        >
                          <item.icon className={`me-2 h-5 w-5 md:h-4 md:w-4 transition-colors ${
                            active ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                          }`} />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {showAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin"
                        className={`text-base md:text-sm rounded-sm transition-colors ${
                          isActive("/admin")
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        onClick={handleLinkClick}
                      >
                        <Shield className={`me-2 h-5 w-5 md:h-4 md:w-4 transition-colors ${
                          isActive("/admin") ? "text-sidebar-primary" : "text-sidebar-foreground/60"
                        }`} />
                        {!collapsed && <span>{t("nav.admin")}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && profile && (
          <p className="mb-2 truncate text-xs text-sidebar-foreground/70">
            {profile.full_name}
          </p>
        )}
        <SidebarMenuButton asChild>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>{t("nav.signOut")}</span>}
          </button>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
