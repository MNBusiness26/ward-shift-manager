import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Sun, Sunset, Moon, Users, ArrowLeftRight, Ban, Palmtree, Plane, Star, Bandage, Baby, Clock, BookOpen, PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfToday, isSameDay } from "date-fns";
import { formatLocale } from "@/i18n/dateLocale";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useTranslation } from "@/i18n/useTranslation";
import { getRoleLabel } from "@/lib/roles";
import { useHolidayMap } from "@/hooks/useHolidays";
import { HolidayCornerIcon } from "@/components/holidays/HolidayCell";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const shiftIcons: Record<string, React.ElementType> = {
  morning: Sun,
  evening: Sunset,
  night: Moon,
};

const shiftColorClass: Record<string, { bg: string; border: string; icon: string }> = {
  morning: { bg: "bg-shift-morning/10", border: "border-s-2 border-s-shift-morning", icon: "text-shift-morning" },
  evening: { bg: "bg-shift-evening/10", border: "border-s-2 border-s-shift-evening", icon: "text-shift-evening" },
  night: { bg: "bg-shift-night/10", border: "border-s-2 border-s-shift-night", icon: "text-shift-night" },
};

// Soft Amethyst per spec (#9F66CC) for availability blocks
const AMETHYST_BG = "bg-[#9F66CC]/10 border-s-2 border-s-[#9F66CC]";
const AMETHYST_TEXT = "text-[#7A4BB0]";

// Hebrew RTL safety: enforce Heebo + 1.5 line-height
const heLabelStyle: React.CSSProperties = { fontFamily: "'Heebo', sans-serif", lineHeight: 1.5 };

type TimelineItem =
  | { kind: "shift"; date: string; sortTime: string; data: any }
  | { kind: "availability"; date: string; sortTime: string; data: any; pending: boolean };

export default function Index() {
  const { user, profile, roles, confirmIfImpersonating } = useAuth();
  const viewUserId = profile?.id ?? user?.id;
  const { settings } = useAppSettings();
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const holidayMap = useHolidayMap();

  const today = startOfToday();
  const weekEnd = addDays(today, 6);
  const todayStr = format(today, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  const greetingTemplate = settings.find((s: any) => s.key === "greeting_template")?.value as string | undefined;
  const greetingFormat = settings.find((s: any) => s.key === "greeting_format")?.value ?? "formal";

  const roleLabel = (() => {
    if (roles.includes("manager")) return getRoleLabel("manager", locale);
    if (roles.includes("assistant_manager")) return getRoleLabel("assistant_manager", locale);
    if (roles.includes("team_leader")) return getRoleLabel("team_leader", locale);
    if (roles.includes("assistant")) return getRoleLabel("assistant", locale);
    return getRoleLabel("nurse", locale);
  })();

  const shiftLabels: Record<string, string> = {
    morning: t("shift.morning"),
    evening: t("shift.evening"),
    night: t("shift.night"),
  };

  const greeting = (() => {
    const name = profile?.full_name || "there";
    const firstName = name.split(" ")[0];
    const lastName = name.split(" ").slice(1).join(" ") || firstName;
    if (greetingTemplate && typeof greetingTemplate === "string" && greetingTemplate.trim()) {
      return greetingTemplate
        .replace(/\{\{title\}\}/g, roleLabel)
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{last_name\}\}/g, lastName);
    }
    if (greetingFormat === "first_name") return `${t("dashboard.greeting")}, ${firstName}`;
    return `${t("dashboard.greeting")}, ${roleLabel} ${name}`;
  })();

  // 1. Confirmed shifts (next 7 days, mine)
  const { data: myShifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ["dash-my-shifts", viewUserId, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", viewUserId!)
        .eq("is_draft", false)
        .gte("date", todayStr)
        .lte("date", endStr)
        .order("date").order("start_time");
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  // 2. All shifts in range — for team context
  const { data: allShifts = [] } = useQuery({
    queryKey: ["dash-all-shifts", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("id, date, type, assigned_user_id, is_responsible_on_shift, profiles:assigned_user_id(full_name)")
        .eq("is_draft", false)
        .gte("date", todayStr)
        .lte("date", endStr);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // 3. Availability requests (mine, in range, approved + pending)
  const { data: myAvailability = [] } = useQuery({
    queryKey: ["dash-my-avail", viewUserId, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_requests")
        .select("*")
        .eq("user_id", viewUserId!)
        .in("status", ["approved", "pending"])
        .lte("date", endStr)
        .or(`end_date.gte.${todayStr},end_date.is.null`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewUserId,
  });

  // 4. Swap requests for summary
  const { data: swaps = [] } = useQuery({
    queryKey: ["dash-swaps", viewUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("swap_requests")
        .select("*, shift:shift_id(date, type, start_time, end_time), requester:requesting_user_id(full_name), coverer:covering_user_id(full_name)")
        .or(`requesting_user_id.eq.${viewUserId},covering_user_id.eq.${viewUserId}`)
        .in("status", ["pending", "peer_accepted"]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewUserId,
  });

  // Accept swap action
  const acceptSwap = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .update({ status: "peer_accepted", covering_user_id: user!.id })
        .eq("id", swapId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dash-swaps"] });
      toast.success(t("swap.accepted") || "Swap accepted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Build chronological timeline
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const items: TimelineItem[] = [];
  for (const s of myShifts) {
    items.push({ kind: "shift", date: s.date, sortTime: s.start_time, data: s });
  }
  for (const a of myAvailability as any[]) {
    items.push({
      kind: "availability",
      date: a.date,
      sortTime: "00:00:00",
      data: a,
      pending: a.status === "pending",
    });
  }
  // Group by date, sort within
  const itemsByDate = new Map<string, TimelineItem[]>();
  for (const it of items) {
    const arr = itemsByDate.get(it.date) || [];
    arr.push(it);
    itemsByDate.set(it.date, arr);
  }
  for (const arr of itemsByDate.values()) {
    arr.sort((a, b) => a.sortTime.localeCompare(b.sortTime));
  }

  const getTeammates = (date: string, type: string) =>
    allShifts.filter((s) => s.date === date && s.type === type && s.assigned_user_id !== viewUserId).slice(0, 3);

  const availIcon = (type: string) => {
    switch (type) {
      case "vacation":
      case "yearly_leave":
        return Palmtree;
      case "sick_leave":
        return Bandage;
      case "maternity_leave":
        return Baby;
      case "leave":
        return Plane;
      case "study":
        return BookOpen;
      case "preference":
        return Star;
      default:
        return Ban;
    }
  };

  const availLabel = (type: string) => {
    switch (type) {
      case "vacation": return t("dashboard.vacation");
      case "leave": return t("dashboard.leave");
      case "sick_leave": return t("dashboard.sickLeave");
      case "maternity_leave": return t("dashboard.maternityLeave");
      case "yearly_leave": return t("dashboard.yearlyLeave");
      case "preference": return t("common.preference") || "Preference";
      case "study": return t("common.study") || "Study";
      default: return t("dashboard.blocked");
    }
  };

  // Summary partitions
  const myPendingAvail = (myAvailability as any[]).filter((a) => a.status === "pending");
  const swapsToAction = swaps.filter((s: any) =>
    (s.is_pool_request && s.requesting_user_id !== user?.id && s.status === "pending") ||
    (s.covering_user_id === user?.id && s.status === "pending")
  );
  const swapsSent = swaps.filter((s: any) => s.requesting_user_id === user?.id);

  return (
    <div className="space-y-6">
      {/* Top bar greeting */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold" style={locale === "he" ? heLabelStyle : undefined}>
          {greeting}
        </h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      {/* Timeline */}
      {shiftsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse shadow-md"><CardContent className="h-20 p-4" /></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isToday = isSameDay(day, new Date());
            const dayItems = itemsByDate.get(dateStr) || [];
            const holiday = holidayMap.get(dateStr);

            return (
              <div key={dateStr} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {formatLocale(day, "EEEE, MMMM d", locale)}
                  </h2>
                  {isToday && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                      {t("dashboard.today")}
                    </Badge>
                  )}
                  {holiday && <HolidayCornerIcon holiday={holiday} inline size="sm" />}
                </div>

                {dayItems.length === 0 ? (
                  <Card className="border-dashed shadow-md">
                    <CardContent className="flex items-center gap-3 py-4 px-4">
                      <Calendar className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground">{t("dashboard.noShifts")}</span>
                    </CardContent>
                  </Card>
                ) : (
                  dayItems.map((it, idx) => {
                    if (it.kind === "availability") {
                      const a = it.data;
                      const Icon = availIcon(a.request_type);
                      return (
                        <Card key={`a-${a.id}-${idx}`} className={`shadow-md border-0 overflow-hidden`}>
                          <CardContent className={`p-0`}>
                            <div className={`${AMETHYST_BG} ${it.pending ? "border-dashed border-2 border-[#9F66CC]/50" : ""} p-3 md:p-4 flex items-center gap-3`}>
                              <Icon className={`h-5 w-5 ${AMETHYST_TEXT}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap" style={locale === "he" ? heLabelStyle : undefined}>
                                  <span className={`text-sm font-semibold ${AMETHYST_TEXT}`}>{availLabel(a.request_type)}</span>
                                  {it.pending && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-dashed">
                                      {t("common.pending") || "Pending"}
                                    </Badge>
                                  )}
                                </div>
                                {a.reason && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.reason}</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }
                    // shift
                    const shift = it.data;
                    const Icon = shiftIcons[shift.type] || Sun;
                    const colors = shiftColorClass[shift.type] || shiftColorClass.morning;
                    const teammates = getTeammates(dateStr, shift.type);
                    return (
                      <Card key={`s-${shift.id}`} className={`overflow-hidden shadow-md border-0 ${isToday ? "ring-1 ring-primary/20" : ""}`}>
                        <CardContent className="p-0">
                          <div className={`${colors.bg} ${colors.border} ${shift.is_draft ? "border-dashed" : ""}`}>
                            <div className="relative p-3 md:p-4 space-y-2">
                              {shift.is_responsible_on_shift && (
                                <Star className="absolute top-3 end-3 h-4 w-4 fill-primary text-primary" />
                              )}
                              <div className="flex items-center gap-2 flex-wrap pe-6" style={locale === "he" ? heLabelStyle : undefined}>
                                <Icon className={`h-4 w-4 ${colors.icon}`} />
                                <span className={`text-sm font-semibold ${colors.icon}`}>{shiftLabels[shift.type]}</span>
                                <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {shift.start_time.slice(0, 5)} — {shift.end_time.slice(0, 5)}
                                </span>
                                {shift.is_standby && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                                    <PhoneCall className="h-2.5 w-2.5" />{t("payroll.onCall") || "On-call"}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t("dashboard.role")}: <span className="font-medium text-foreground capitalize">{roleLabel}</span>
                              </div>
                              {/* Team Context footer */}
                              <div className="flex items-start gap-1.5 text-xs border-t border-border/50 pt-2 mt-1">
                                <Users className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="text-muted-foreground font-medium">{t("dashboard.onShiftWith")} </span>
                                  {teammates.length === 0 ? (
                                    <span className="text-muted-foreground">{t("dashboard.noOtherStaff")}</span>
                                  ) : (
                                    <span className="inline-flex flex-wrap gap-x-1.5 gap-y-0.5">
                                      {teammates.map((tm) => (
                                        <span key={tm.id} className="inline-flex items-center gap-0.5 text-foreground">
                                          {(tm.profiles as any)?.full_name?.split(" ")[0] || "?"}
                                          {tm.is_responsible_on_shift && <Star className="h-2.5 w-2.5 fill-primary text-primary" />}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {shift.comments && (
                                <p className="text-xs text-muted-foreground border-t border-border pt-1.5 mt-1">{shift.comments}</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Requests Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        {/* Availability Requests */}
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-primary">{t("dashboard.myAvailabilityRequests") || "My Availability Requests"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myPendingAvail.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("common.none") || "Nothing pending."}</p>
            ) : (
              myPendingAvail.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate" style={locale === "he" ? heLabelStyle : undefined}>
                      {availLabel(a.request_type)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatLocale(new Date(a.date), "MMM d", locale)}
                      {a.end_date && a.end_date !== a.date && ` — ${formatLocale(new Date(a.end_date), "MMM d", locale)}`}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-dashed">{t("common.pending") || "Pending"}</Badge>
                </div>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="w-full min-h-11">
              <Link to="/availability">{t("dashboard.manageAvailability") || "Manage availability"}</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Swap Requests */}
        <Card className="shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-primary">{t("dashboard.swapRequests") || "Swap Requests"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {t("dashboard.toAction") || "To Action"}
              </div>
              {swapsToAction.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("common.none") || "Nothing to action."}</p>
              ) : (
                swapsToAction.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2 mb-1">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate" style={locale === "he" ? heLabelStyle : undefined}>
                        {s.requester?.full_name || "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.shift?.date && formatLocale(new Date(s.shift.date), "EEE MMM d", locale)} · {s.shift?.type}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="min-h-11 px-3"
                      disabled={acceptSwap.isPending}
                      onClick={() => acceptSwap.mutate(s.id)}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 me-1" />
                      {t("swap.accept") || "Accept"}
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {t("dashboard.sent") || "Sent"}
              </div>
              {swapsSent.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("common.none") || "No sent requests."}</p>
              ) : (
                swapsSent.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2 mb-1">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground truncate" style={locale === "he" ? heLabelStyle : undefined}>
                        {s.shift?.date && formatLocale(new Date(s.shift.date), "EEE MMM d", locale)} · {s.shift?.type}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.is_pool_request ? (t("swap.pool") || "Pool") : (s.coverer?.full_name || "—")}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{s.status}</Badge>
                  </div>
                ))
              )}
            </div>
            <Button asChild variant="ghost" size="sm" className="w-full min-h-11">
              <Link to="/swaps">{t("dashboard.manageSwaps") || "Manage swaps"}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
