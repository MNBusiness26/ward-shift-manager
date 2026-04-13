import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Copy, Check, RefreshCw, Smartphone, Monitor, Mail, QrCode, ExternalLink } from "lucide-react";
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
  const [emailSending, setEmailSending] = useState(false);

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed`;
  const feedUrl = token ? `${baseUrl}?token=${token}` : null;
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:\/\//, "webcal://") : null;
  const qrCodeUrl = webcalUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(webcalUrl)}`
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

  const handleWebcalConnect = () => {
    if (!webcalUrl) return;
    window.location.href = webcalUrl;
  };

  const handleSendEmail = async () => {
    if (!user?.email || !webcalUrl) return;
    setEmailSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-sync-email", {
        body: { email: user.email, webcalUrl, feedUrl },
      });
      if (error) throw error;
      toast.success("Sync link sent to your email!");
    } catch {
      // Fallback: open mailto
      const subject = encodeURIComponent("WardWise Calendar Sync Link");
      const body = encodeURIComponent(
        `Tap the link below on your phone to subscribe to your WardWise shift calendar:\n\n${webcalUrl}\n\nIf tapping doesn't work, copy this URL and add it manually in your calendar app:\n${feedUrl}`
      );
      window.open(`mailto:${user.email}?subject=${subject}&body=${body}`, "_blank");
      toast.info("Opening email client with your sync link...");
    } finally {
      setEmailSending(false);
    }
  };

  const regenerateToken = async () => {
    await generateToken();
    toast.info("New link generated. Old link will stop working.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Button onClick={generateToken} disabled={loading} className="w-full sm:w-auto">
                {loading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
                Generate Sync Link
              </Button>
            </div>
          ) : (
            <>
              {/* Primary: One-tap connect */}
              <div className="space-y-3">
                <Button onClick={handleWebcalConnect} className="w-full gap-2 h-12 text-base">
                  <ExternalLink className="h-5 w-5" />
                  Connect to Phone Calendar
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Tap to instantly subscribe — your shifts will appear in your native calendar app.
                </p>
              </div>

              {/* Secondary actions */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-1.5" onClick={handleSendEmail} disabled={emailSending}>
                  <Mail className="h-4 w-4" />
                  {emailSending ? "Sending..." : "Email Link"}
                </Button>
                <Button variant="outline" className="gap-1.5" onClick={copyToClipboard}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
              </div>

              {/* QR Code for desktop users */}
              {qrCodeUrl && (
                <div className="flex flex-col items-center gap-2 rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <QrCode className="h-3.5 w-3.5" />
                    Scan with your phone camera
                  </div>
                  <img
                    src={qrCodeUrl}
                    alt="Calendar sync QR code"
                    className="rounded-md bg-white p-1"
                    width={160}
                    height={160}
                  />
                </div>
              )}

              {/* URL field (collapsed by default on mobile) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subscription URL</label>
                <div className="flex gap-2">
                  <Input readOnly value={feedUrl || ""} className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={copyToClipboard} className="shrink-0">
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
                    <p>1. Tap <strong>"Connect to Phone Calendar"</strong> above</p>
                    <p>2. Tap <strong>Subscribe</strong> when the system prompt appears</p>
                    <p>3. Your shifts will appear in the Calendar app</p>
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
                    <p>1. If <strong>"Connect"</strong> doesn't open your calendar app, use <strong>"Copy Link"</strong> above</p>
                    <p>2. Open <strong>Google Calendar</strong> on a desktop browser</p>
                    <p>3. Next to "Other calendars", click <strong>+</strong> → <strong>From URL</strong></p>
                    <p>4. Paste the link and click <strong>Add calendar</strong></p>
                    <p>5. The calendar will sync to your Android device automatically</p>
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
