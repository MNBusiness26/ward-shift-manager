import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PartyPopper } from "lucide-react";

export function WelcomeOverlay() {
  const { user, profile, roles } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    const key = `wardwise_welcome_shown_${user.id}`;
    if (!localStorage.getItem(key)) {
      setOpen(true);
      localStorage.setItem(key, "true");
    }
  }, [user, profile]);

  if (!profile) return null;

  const roleLabel = roles.length > 0
    ? roles.map((r) => getRoleLabel(r, locale)).join(", ")
    : (profile.role ? getRoleLabel(profile.role, locale) : "Staff");

  const ftePercent = Math.round(Number(profile.target_fte_percent) * 100);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md text-center">
        <DialogHeader className="items-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">Welcome to the Ward! 🎉</DialogTitle>
          <DialogDescription className="text-base">
            Hi <span className="font-semibold text-foreground">{profile.full_name}</span>, your account is all set up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">Role</span>
            <span className="font-medium">{roleLabel}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm text-muted-foreground">FTE</span>
            <span className="font-medium">{ftePercent}%</span>
          </div>
        </div>
        <Button onClick={() => setOpen(false)} className="w-full">
          Let's Go!
        </Button>
      </DialogContent>
    </Dialog>
  );
}
