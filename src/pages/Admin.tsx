import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

const ADMIN_EMAIL = "michael.nejman@gmail.com";

export default function Admin() {
  const { user, profile } = useAuth();

  if (!user || profile?.email !== ADMIN_EMAIL) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Shield className="h-6 w-6" />
        Admin Settings
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>System Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Admin dashboard — coming soon. This page is restricted to the system administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
