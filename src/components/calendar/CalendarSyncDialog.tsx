import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, Check, RefreshCw, Smartphone, Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface CalendarSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarSyncDialog({ open, onOpenChange }: CalendarSyncDialogProps) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [token, setToken] = useState<string | null>((profile as any)?.calendar_token || null);

  const feedUrl = token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed?token=${token}`
    : null;

  const generateToken = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const newToken = crypto.randomUUID();
      const { error } = await supabase
        .from("profiles")
        .update({
          calendar_token: newToken,
          last_sync_generated_at: new Date().toISOString(),
        } as any)
        .eq("id", user.id);
      if (error) throw error;
      setToken(newToken);
      toast.success("Sync link generated!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateToken = async () => {
    await generateToken();
    toast.info("New link generated. Old link will stop working.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync Calendar</DialogTitle>
          <DialogDescription>
            Sync your shifts directly to your phone. Updates in WardWise will reflect on your personal calendar automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!token ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Generate a private subscription link to sync your published shifts with your phone or desktop calendar.
              </p>
              <Button onClick={generateToken} disabled={loading}>
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Sync Link
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Your Subscription Link</label>
                <div className="flex gap-2">
                  <Input readOnly value={feedUrl || ""} className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={copyToClipboard}>
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link is private. Anyone with it can see your shift schedule.
                </p>
              </div>

              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="ios">
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      iPhone / iOS
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground space-y-1">
                    <p>1. Open <strong>Settings</strong> → <strong>Calendar</strong> → <strong>Accounts</strong></p>
                    <p>2. Tap <strong>Add Account</strong> → <strong>Other</strong></p>
                    <p>3. Tap <strong>Add Subscribed Calendar</strong></p>
                    <p>4. Paste the link above and tap <strong>Save</strong></p>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="android">
                  <AccordionTrigger className="text-sm">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Android / Google Calendar
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground space-y-1">
                    <p>1. Open <strong>Google Calendar</strong> on a desktop browser</p>
                    <p>2. Next to "Other calendars", click <strong>+</strong> → <strong>From URL</strong></p>
                    <p>3. Paste the link above and click <strong>Add calendar</strong></p>
                    <p>4. The calendar will sync to your Android device automatically</p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={regenerateToken} disabled={loading} className="text-xs text-muted-foreground">
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Regenerate link (invalidates old link)
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
