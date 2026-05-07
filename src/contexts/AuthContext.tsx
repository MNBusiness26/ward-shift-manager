import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  realProfile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isActive: boolean;
  isManager: boolean;
  isAssistantManager: boolean;
  hasProfile: boolean;
  profileLoaded: boolean;
  signOut: () => Promise<void>;
  // Impersonation (QA mode)
  impersonatedProfile: Profile | null;
  isImpersonating: boolean;
  impersonate: (profile: Profile | null) => void;
  confirmIfImpersonating: (action?: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [impersonatedProfile, setImpersonatedProfile] = useState<Profile | null>(null);
  const [impersonatedRoles, setImpersonatedRoles] = useState<AppRole[]>([]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    setProfileLoaded(true);
  };

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles(data?.map((r) => r.role) ?? []);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
            fetchRoles(session.user.id);
          }, 0);
        } else {
          setProfile(null);
          setRoles([]);
          setProfileLoaded(false);
          setImpersonatedProfile(null);
          setImpersonatedRoles([]);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const impersonate = useCallback((p: Profile | null) => {
    setImpersonatedProfile(p);
    if (!p) {
      setImpersonatedRoles([]);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", p.id)
      .then(({ data }) => {
        const dbRoles = (data?.map((r) => r.role) ?? []) as AppRole[];
        if (dbRoles.length > 0) {
          setImpersonatedRoles(dbRoles);
          return;
        }
        // Placeholder profile (auto-created by shift assignment, not signed up
        // yet) has no user_roles row because of FK to auth.users. Fall back to
        // profiles.role so QA preview matches what handle_new_user will set
        // when they actually sign up.
        const fallback = p.role as AppRole | null;
        const valid: AppRole[] = ["manager", "assistant_manager", "team_leader", "nurse", "assistant"];
        setImpersonatedRoles(fallback && valid.includes(fallback) ? [fallback] : []);
      });
  }, []);

  const confirmIfImpersonating = useCallback((action = "this action") => {
    if (!impersonatedProfile) return true;
    return window.confirm(
      `Warning: You are in QA Mode. Perform ${action} as a real action?`
    );
  }, [impersonatedProfile]);

  const signOut = async () => {
    setImpersonatedProfile(null);
    setImpersonatedRoles([]);
    await supabase.auth.signOut();
  };

  const effectiveProfile = impersonatedProfile ?? profile;
  const effectiveRoles = impersonatedProfile ? impersonatedRoles : roles;

  // Hard-coded manager allow-list — guarantees access even if the DB
  // role row is missing or stale.
  const HARDCODED_MANAGER_EMAILS = new Set([
    "michael.nejman@gmail.com",
    "michusha@gmail.com",
    "lihimizrahi85@gmail.com",
  ]);
  const realEmail = (profile?.email ?? user?.email ?? "").toLowerCase();
  const effectiveEmail = (effectiveProfile?.email ?? "").toLowerCase();
  const isHardcodedManager =
    HARDCODED_MANAGER_EMAILS.has(realEmail) ||
    (impersonatedProfile && HARDCODED_MANAGER_EMAILS.has(effectiveEmail));

  // Activation gate must always reflect the REAL admin session, not the
  // impersonated profile (which may be inactive/unclaimed staff).
  const hasProfile = profile !== null;
  const isActive = profile?.is_active ?? HARDCODED_MANAGER_EMAILS.has(realEmail);
  const isManager = effectiveRoles.includes("manager") || !!isHardcodedManager;
  const isAssistantManager = effectiveRoles.includes("assistant_manager");

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile: effectiveProfile,
        realProfile: profile,
        roles: effectiveRoles,
        isLoading,
        isActive,
        isManager,
        isAssistantManager,
        hasProfile,
        profileLoaded,
        signOut,
        impersonatedProfile,
        isImpersonating: impersonatedProfile !== null,
        impersonate,
        confirmIfImpersonating,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
