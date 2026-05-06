import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useStaffPool } from "@/hooks/useStaffPool";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { Eye, X, ChevronsUpDown } from "lucide-react";

const ADMIN_EMAIL = "michael.nejman@gmail.com";

export function ImpersonationBar() {
  const { realProfile, impersonate, impersonatedProfile, isImpersonating } = useAuth();
  const { data: staff = [] } = useStaffPool();
  const [open, setOpen] = useState(false);

  if (realProfile?.email !== ADMIN_EMAIL) return null;

  const sorted = useMemo(
    () => [...staff].sort((a, b) => a.full_name.localeCompare(b.full_name, "he")),
    [staff]
  );

  const handlePick = async (id: string) => {
    setOpen(false);
    const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
    if (data) impersonate(data);
  };

  return (
    <div
      className="sticky top-0 z-50 flex items-center gap-2 border-b px-3 py-2 text-sm"
      style={{
        background: isImpersonating ? "#9F66CC" : "#3B82F6",
        color: "white",
      }}
    >
      <Eye className="h-4 w-4" />
      <span className="font-semibold">QA Mode</span>
      {isImpersonating ? (
        <span>
          Viewing as: <strong>{impersonatedProfile?.full_name}</strong>
        </span>
      ) : (
        <span className="opacity-90">Pick a staff member to simulate their view</span>
      )}

      <div className="ms-auto flex items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8 gap-2">
              {isImpersonating ? "Switch user" : "View as…"}
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search staff…" />
              <CommandList>
                <CommandEmpty>No staff found.</CommandEmpty>
                {sorted.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={s.full_name}
                    onSelect={() => handlePick(s.id)}
                  >
                    <div className="flex flex-col">
                      <span>{s.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.role} {s.email ? `· ${s.email}` : ""}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {isImpersonating && (
          <Button
            size="sm"
            variant="secondary"
            className="h-8 gap-1"
            onClick={() => impersonate(null)}
          >
            <X className="h-3.5 w-3.5" />
            Reset View
          </Button>
        )}
      </div>
    </div>
  );
}
