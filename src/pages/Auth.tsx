import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Mail } from "lucide-react";

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteValid, setInviteValid] = useState<null | { full_name: string; email: string }>(null);

  // When an invite token is present, prefill from staff_directory and force signup mode
  useEffect(() => {
    if (!inviteToken) return;
    setInviteLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("staff_directory")
        .select("full_name, email, is_claimed")
        .eq("invite_token", inviteToken)
        .maybeSingle();
      if (error || !data) {
        toast.error("Invalid or expired invitation link");
      } else if (data.is_claimed) {
        toast.info("This invitation has already been used. Please sign in.");
        setEmail(data.email);
        setIsLogin(true);
      } else {
        setInviteValid({ full_name: data.full_name, email: data.email });
        setEmail(data.email);
        setFullName(data.full_name);
        setIsLogin(false);
      }
      setInviteLoading(false);
    })();
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (inviteValid) {
          toast.success("Account created! You can sign in now.");
        } else {
          toast.success("Account created! A manager will activate your access.");
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await lovable.auth.signInWithOAuth("google");
    if (result?.error) toast.error(String(result.error));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">WardWise</CardTitle>
          <CardDescription>
            {inviteValid
              ? `Welcome ${inviteValid.full_name.split(" ")[0]}! Set your password to activate your account.`
              : isLogin
                ? "Sign in to your account"
                : "Create a new account"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteValid && (
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
              <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div style={{ lineHeight: 1.5 }}>
                You were invited as <strong>{inviteValid.full_name}</strong>. Your role and details are preconfigured — just set a password.
              </div>
            </div>
          )}

          {!inviteValid && (
            <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                type="button"
              >
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {!isLogin && (
              <Input
                placeholder="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={!!inviteValid}
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!!inviteValid}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button className="w-full" type="submit" disabled={loading || inviteLoading}>
              {loading ? "Loading..." : isLogin ? "Sign In" : inviteValid ? "Activate Account" : "Sign Up"}
            </Button>
          </form>

          {!inviteValid && (
            <p className="text-center text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary underline-offset-4 hover:underline"
              >
                {isLogin ? "Sign Up" : "Sign In"}
              </button>
            </p>
          )}

          {!isLogin && !inviteValid && (
            <p className="text-center text-xs text-muted-foreground">
              After sign-up, a manager must activate your account before you can access the system.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
