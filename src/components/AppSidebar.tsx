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

const nurseItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Calendar", url: "/calendar", icon: Calendar },
  { title: "Availability", url: "/availability", icon: CalendarOff },
  { title: "Swap Requests", url: "/swaps", icon: ArrowLeftRight },
  { title: "Team Calendar", url: "/team-calendar", icon: Users },
  { title: "My Stats", url: "/stats", icon: BarChart3 },
];

const managerItems = [
  { title: "Master Roster", url: "/roster", icon: ClipboardList },
  { title: "Mgmt Calendar", url: "/management-calendar", icon: CalendarDays },
  { title: "Requests", url: "/requests", icon: Settings },
  { title: "Staff", url: "/staff", icon: Users },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

export function AppSidebar() {
  const { state, toggleSidebar, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isManager, isAssistantManager, profile, signOut } = useAuth();
  const isMobile = useIsMobile();

  const handleLinkClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const showManagement = isManager || isAssistantManager;
  // Only full managers with the admin email see the Admin link
  const showAdmin = isManager && profile?.email === ADMIN_EMAIL;

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-4 py-4">
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">
              WardWise
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={toggleSidebar}
          >
            <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </Button>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nurseItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent text-base md:text-sm"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      onClick={handleLinkClick}
                    >
                      <item.icon className="mr-2 h-5 w-5 md:h-4 md:w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showManagement && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/60">Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managerItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="hover:bg-sidebar-accent text-base md:text-sm"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        onClick={handleLinkClick}
                      >
                        <item.icon className="mr-2 h-5 w-5 md:h-4 md:w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {showAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin"
                        className="hover:bg-sidebar-accent text-base md:text-sm"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        onClick={handleLinkClick}
                      >
                        <Shield className="mr-2 h-5 w-5 md:h-4 md:w-4" />
                        {!collapsed && <span>Admin</span>}
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
            className="flex w-full items-center gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
