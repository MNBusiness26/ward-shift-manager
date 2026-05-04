import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AppLayout } from "@/components/AppLayout";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";

import Auth from "./pages/Auth";
import PendingActivation from "./pages/PendingActivation";
import RestrictedAccess from "./pages/RestrictedAccess";
import Index from "./pages/Index";
import MyCalendar from "./pages/MyCalendar";
import Availability from "./pages/Availability";
import SwapRequests from "./pages/SwapRequests";
import MyStats from "./pages/MyStats";
import Roster from "./pages/Roster";
import Requests from "./pages/Requests";
import Staff from "./pages/Staff";
import Analytics from "./pages/Analytics";
import StaffStats from "./pages/StaffStats";
import ManagementCalendar from "./pages/ManagementCalendar";
import Admin from "./pages/Admin";
import AdminDictionary from "./pages/AdminDictionary";
import GlobalTeamCalendar from "./pages/GlobalTeamCalendar";
import PayrollDashboard from "./pages/PayrollDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, requireManager }: { children: React.ReactNode; requireManager?: boolean }) {
  const { user, isLoading, isActive, isManager, isAssistantManager, hasProfile, profileLoaded } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (!profileLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hasProfile) return <RestrictedAccess />;
  if (!isActive) return <PendingActivation />;
  if (requireManager && !isManager && !isAssistantManager) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <WelcomeOverlay />
      {children}
    </AppLayout>
  );
}

function ManagerHomeRedirect() {
  const { isManager, isAssistantManager } = useAuth();
  if (isManager || isAssistantManager) return <Navigate to="/management-calendar" replace />;
  return <Index />;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <Auth />} />
      <Route path="/" element={<ProtectedRoute><ManagerHomeRedirect /></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><MyCalendar /></ProtectedRoute>} />
      <Route path="/availability" element={<ProtectedRoute><Availability /></ProtectedRoute>} />
      <Route path="/swaps" element={<ProtectedRoute><SwapRequests /></ProtectedRoute>} />
      <Route path="/stats" element={<ProtectedRoute><MyStats /></ProtectedRoute>} />
      <Route path="/team-calendar" element={<ProtectedRoute><GlobalTeamCalendar /></ProtectedRoute>} />
      <Route path="/roster" element={<ProtectedRoute requireManager><Roster /></ProtectedRoute>} />
      <Route path="/requests" element={<ProtectedRoute requireManager><Requests /></ProtectedRoute>} />
      <Route path="/staff" element={<ProtectedRoute requireManager><Staff /></ProtectedRoute>} />
      <Route path="/management-calendar" element={<ProtectedRoute requireManager><ManagementCalendar /></ProtectedRoute>} />
      <Route path="/staff-stats" element={<ProtectedRoute requireManager><StaffStats /></ProtectedRoute>} />
      {/* <Route path="/analytics" element={<ProtectedRoute requireManager><Analytics /></ProtectedRoute>} /> */}
      <Route path="/payroll" element={<ProtectedRoute requireManager><PayrollDashboard /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireManager><Admin /></ProtectedRoute>} />
      <Route path="/admin/dictionary" element={<ProtectedRoute requireManager><AdminDictionary /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <I18nProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </I18nProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
