import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function PendingActivation() {
  const { signOut, profile } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Clock className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle>Account Pending Activation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Welcome, <span className="font-medium text-foreground">{profile?.full_name || "there"}</span>!
            Your account has been created but is waiting for a Ward Manager to activate it.
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact your Ward Manager to get access.
          </p>
          <Button variant="outline" onClick={signOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
