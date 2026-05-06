import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/i18n/useTranslation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inviteUrl: string | null;
  recipientName?: string;
}

export function InviteLinkDialog({ open, onOpenChange, inviteUrl, recipientName }: Props) {
  const [copied, setCopied] = useState(false);
  const { locale } = useTranslation();

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Invitation link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={locale === "he" ? "rtl" : "ltr"} style={{ lineHeight: 1.5 }}>
        <DialogHeader>
          <DialogTitle className="font-medium">Invitation Link {recipientName ? `for ${recipientName}` : ""}</DialogTitle>
          <DialogDescription>
            Share this link directly with the staff member. They'll use it to create their account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={inviteUrl ?? ""} className="min-h-[44px] font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button onClick={handleCopy} className="min-h-[44px] gap-2 shrink-0">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
