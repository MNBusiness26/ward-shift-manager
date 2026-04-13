import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldX, LogOut, Mail } from "lucide-react";

export default function RestrictedAccess() {
  const { signOut, user } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <ShieldX className="h-7 w-7 text-destructive" />
          </div>
          <CardTitle>Access Restricted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Your email{" "}
            <span className="font-medium text-foreground">{user?.email}</span>{" "}
            is not currently authorized for WardWise access.
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact Michael or your Ward Manager to be added to the staff directory.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={signOut} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
            <Button asChild variant="default" className="gap-2">
              <a href="mailto:michael.nejman@gmail.com?subject=WardWise%20Access%20Request">
                <Mail className="h-4 w-4" />
                Request Access
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
