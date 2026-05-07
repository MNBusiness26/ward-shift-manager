import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sun, Sunset, Moon, TrendingUp } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { useTranslation } from "@/i18n/useTranslation";
import { formatLocale } from "@/i18n/dateLocale";

export default function MyStats() {
  const { user, profile } = useAuth();
  const viewUserId = profile?.id ?? user?.id;
  const { t, locale } = useTranslation();
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const { data: monthShifts = [] } = useQuery({
    queryKey: ["stats-month", viewUserId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", viewUserId!)
        .gte("date", format(monthStart, "yyyy-MM-dd"))
        .lte("date", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  const { data: weekShifts = [] } = useQuery({
    queryKey: ["stats-week", viewUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("assigned_user_id", viewUserId!)
        .gte("date", format(weekStart, "yyyy-MM-dd"))
        .lte("date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
    enabled: !!viewUserId,
  });

  const fte = profile?.target_fte_percent ?? 1;
  const expectedWeekly = 5 * fte;
  const fulfillment = expectedWeekly > 0 ? Math.round((weekShifts.length / expectedWeekly) * 100) : 0;

  const morningCount = monthShifts.filter((s) => s.type === "morning").length;
  const eveningCount = monthShifts.filter((s) => s.type === "evening").length;
  const nightCount = monthShifts.filter((s) => s.type === "night").length;

  const completedShifts = monthShifts.filter(
    (s) => new Date(s.date) < now
  ).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("page.myStats")}</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            {t("stats.weeklyFulfillment")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {weekShifts.length} {t("stats.of")} {expectedWeekly} {t("stats.shifts")} ({fte * 100}% FTE)
              </span>
              <span className="font-semibold">{fulfillment}%</span>
            </div>
            <Progress value={Math.min(fulfillment, 100)} className="h-3" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shift-morning/15">
              <Sun className="h-5 w-5 text-shift-morning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{morningCount}</p>
              <p className="text-xs text-muted-foreground">{t("shift.morning")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shift-evening/15">
              <Sunset className="h-5 w-5 text-shift-evening" />
            </div>
            <div>
              <p className="text-2xl font-bold">{eveningCount}</p>
              <p className="text-xs text-muted-foreground">{t("shift.evening")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-shift-night/15">
              <Moon className="h-5 w-5 text-shift-night" />
            </div>
            <div>
              <p className="text-2xl font-bold">{nightCount}</p>
              <p className="text-xs text-muted-foreground">{t("shift.night")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("stats.monthSummary")} — {formatLocale(now, "MMMM yyyy", locale)}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold">{monthShifts.length}</p>
              <p className="text-sm text-muted-foreground">{t("stats.totalBooked")}</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold">{completedShifts}</p>
              <p className="text-sm text-muted-foreground">{t("stats.completed")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
